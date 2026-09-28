import type {
  Action,
  GoalConfigId,
  Orientation,
  PitchTemplateId,
  Point,
  SceneObject,
  TactixDoc,
  Team,
} from './types';
import { createPitch, CUSTOM_DEFAULT } from './pitch/dimensions';
import { applyActions, cloneDoc, ensureSteps, makeStep } from './steps';
import {
  applyFormat,
  applyPitch,
  createExercise,
  reverseDirection,
  setGoalConfig,
  syncTeamCount,
} from './doc';
import { applyFormation, makeBall, makePlayer, playersOf, resetStepZero } from './team';
import { configNeedsKeeper } from './goals';
import { equipmentById } from './equipment';
import { createAction, uid } from './actions';
import { CATEGORIES } from './categories';
import { formatById } from './formats';
import { clamp } from './geometry';

// ─────────────────────────────────────────────────────────────
// ASSISTANT INTELLIGENT
// Création et modification d'exercices à partir d'une phrase.
// 100 % local (aucun service externe) : analyse lexicale en français
// puis génération d'un exercice réellement utilisable (joueurs,
// matériel, trajectoires, étapes, consignes).
// ─────────────────────────────────────────────────────────────

export interface ParsedIntent {
  pitch: PitchTemplateId;
  orientation: Orientation;
  format: { home: number; away: number };
  goals: GoalConfigId;
  keeper: boolean;
  material: string[];
  theme: ThemeId;
  category: string | null;
  subcategory: string | null;
  duration: number;
  intensity: number;
  raw: string;
}

export type ThemeId =
  | 'buildup'
  | 'transition'
  | 'pressing'
  | 'positional'
  | 'finishing'
  | 'rondo'
  | 'generic';

const THEMES: { id: ThemeId; keywords: string[]; category: string; sub: string }[] = [
  {
    id: 'buildup',
    keywords: ['sortie de balle', 'relance', 'construction', 'sortir le ballon'],
    category: 'Tactique',
    sub: 'Sortie de balle',
  },
  {
    id: 'transition',
    keywords: ['transition', 'contre-attaque', 'contre attaque', 'rapide vers l’avant', 'verticalité'],
    category: 'Tactique',
    sub: 'Transition offensive',
  },
  {
    id: 'pressing',
    keywords: ['pressing', 'contre-pressing', 'récupération', 'harcèlement'],
    category: 'Tactique',
    sub: 'Pressing',
  },
  {
    id: 'positional',
    keywords: ['jeu positionnel', 'possession', 'conservation', 'circulation'],
    category: 'Tactique',
    sub: 'Jeu positionnel',
  },
  {
    id: 'finishing',
    keywords: ['finition', 'finir', 'but', 'frappe', 'conclure', '3e homme', 'troisième homme'],
    category: 'Technique',
    sub: 'Finition',
  },
  {
    id: 'rondo',
    keywords: ['rondo', 'carré', 'toros'],
    category: 'Technique',
    sub: 'Passe',
  },
];

const MATERIAL_WORDS: { word: string; id: string }[] = [
  { word: 'plot', id: 'plat' },
  { word: 'coupelle', id: 'coupelle' },
  { word: 'cône', id: 'cone' },
  { word: 'cone', id: 'cone' },
  { word: 'grand cône', id: 'coneGrand' },
  { word: 'cerceau', id: 'cerceau' },
  { word: 'échelle', id: 'echelle' },
  { word: 'echelle', id: 'echelle' },
  { word: 'haie', id: 'haie' },
  { word: 'mannequin', id: 'mannequin' },
  { word: 'piquet', id: 'piquet' },
  { word: 'jalon', id: 'jalon' },
  { word: 'slalom', id: 'slalom' },
  { word: 'barrière', id: 'barriere' },
  { word: 'corde', id: 'corde' },
  { word: 'élastique', id: 'elastique' },
  { word: 'banc', id: 'banc' },
  { word: 'cible', id: 'cible' },
  { word: 'mur', id: 'mur' },
  { word: 'porte', id: 'porte' },
];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, '’')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseIntent(prompt: string): ParsedIntent {
  const p = normalize(prompt);

  // Terrain
  let pitch: PitchTemplateId = 'half';
  if (/(jeu reduit|espace reduit|20 ?x ?20|petit terrain)/.test(p)) pitch = 'reduced';
  else if (/dernier tiers|tiers offensif|zone de finition/.test(p)) pitch = 'finalThird';
  else if (/surface|16 metres|zone de but/.test(p)) pitch = 'penaltyArea';
  else if (/(terrain complet|plein terrain|11 contre 11|11v11)/.test(p)) pitch = 'full';
  else if (/3 ?\/ ?4|trois quarts/.test(p)) pitch = 'threeQuarter';
  else if (/demi[- ]?terrain|moitie de terrain|une moitie/.test(p)) pitch = 'half';

  const orientation: Orientation = /vertical|portrait/.test(p) ? 'vertical' : 'horizontal';

  // Format
  const fmt = /(\d{1,2})\s*(?:contre|vs\.?|v)\s*(\d{1,2})/.exec(p);
  let home = fmt ? clamp(parseInt(fmt[1], 10), 1, 11) : 0;
  let away = fmt ? clamp(parseInt(fmt[2], 10), 1, 11) : 0;
  if (!fmt) {
    home = pitch === 'full' ? 11 : 4;
    away = pitch === 'full' ? 11 : 4;
  }

  // Buts
  const keeper = /gardien|goal ?keeper|gk/.test(p);
  let goals: GoalConfigId = 'none';
  const smallGoals = /(deux|2)\s*petits buts/.test(p);
  const fourSmall = /(quatre|4)\s*petits buts/.test(p);
  const sideGoals = /(lateral|lateraux|cote|sur les cotes|sur les cotes du terrain)/.test(p);
  const bigGoal = /grand but|but classique|vrai but/.test(p);
  if (fourSmall) goals = 'fourSmall';
  else if (smallGoals && sideGoals) goals = 'twoSmallSides';
  else if (smallGoals && bigGoal) goals = 'oneLargeTwoSmall';
  else if (smallGoals) goals = 'twoSmall';
  else if (bigGoal && keeper) goals = 'oneLargeKeeper';
  else if (bigGoal) goals = 'oneLarge';
  else if (/mini[- ]?buts?/.test(p)) goals = 'twoSmall';
  else if (pitch === 'full') goals = 'twoLarge';
  else goals = 'twoSmall';

  // Matériel
  const material: string[] = [];
  if (/ballon/.test(p)) material.push('Ballons');
  for (const m of MATERIAL_WORDS) {
    if (p.includes(normalize(m.word))) {
      const label = equipmentById(m.id)?.label;
      if (label && !material.includes(label)) material.push(label);
    }
  }
  if (keeper && !material.includes('Gardien')) material.push('Gardien');

  // Thème
  let theme: ThemeId = 'generic';
  let category: string | null = null;
  let subcategory: string | null = null;
  for (const t of THEMES) {
    if (t.keywords.some((k) => p.includes(normalize(k)))) {
      theme = t.id;
      category = t.category;
      subcategory = t.sub;
      break;
    }
  }
  if (!category) {
    for (const cat of CATEGORIES) {
      for (const item of cat.items) {
        if (p.includes(normalize(item))) {
          category = cat.id;
          subcategory = item;
          break;
        }
      }
      if (category) break;
    }
  }

  const durationMatch = /(\d{1,3})\s*(min|minutes)/.exec(p);
  const duration = durationMatch ? clamp(parseInt(durationMatch[1], 10), 5, 90) : 15;
  const intensity = /intensite (faible|moderee)/.test(p) ? 3 : 4;

  return {
    pitch,
    orientation,
    format: { home, away },
    goals,
    keeper,
    material,
    theme,
    category,
    subcategory,
    duration,
    intensity,
    raw: prompt,
  };
}

// ── Génération ───────────────────────────────────────────────

export function generateFromIntent(intent: ParsedIntent, name?: string): TactixDoc {
  let doc = createExercise(name ?? defaultName(intent));
  const pitch = createPitch(intent.pitch, intent.orientation);
  doc.pitch = pitch;
  doc.objects = [];
  doc.steps = [makeStep(0)];
  doc.goalConfig = intent.goals;
  doc.format = `${intent.format.home}v${intent.format.away}`;
  doc.info = {
    ...doc.info,
    objective: objectiveFor(intent),
    category: intent.category,
    subcategory: intent.subcategory,
    durationMin: intent.duration,
    intensity: intent.intensity,
    material: intent.material.length ? intent.material : ['Ballons', 'Plots'],
    instructions: instructionsFor(intent),
    keyPoints: keyPointsFor(intent.theme),
    variants: 'Modifier le nombre de joueurs ou la taille du terrain pour ajuster la difficulté.',
    players: `${intent.format.home} attaquants · ${intent.format.away} défenseurs${intent.keeper ? ' · 1 gardien' : ''}`,
  };

  // Buts (le sens est choisi AVANT le placement des joueurs)
  doc = setGoalConfig(doc, intent.goals);
  if (intent.theme === 'buildup') {
    // Sortie de balle : on défend le but de gauche
    doc = reverseDirection(doc);
  }

  // Joueurs
  const targetHome = intent.format.home;
  const targetAway = intent.format.away;
  doc = syncTeamCount(doc, 'home', targetHome);
  doc = syncTeamCount(doc, 'away', targetAway);
  if (configNeedsKeeper(intent.goals) && !playersOf(doc, 'away').some((o) => o.keeper)) {
    const v = doc.pitch.view;
    const gkTeam: Team = intent.theme === 'buildup' ? 'home' : 'away';
    const gx = intent.theme === 'buildup' ? v.x + 4 : v.x + v.w - 4;
    const gk = makePlayer(gkTeam, 1, gx, doc.pitch.width / 2, { role: 'GK', keeper: true });
    doc = { ...doc, objects: [...doc.objects, gk] };
  }

  // Formations selon le thème
  const homeFormation = intent.theme === 'positional' || intent.theme === 'rondo' ? '2-2-1' : 'auto';
  doc = applyFormation(doc, homeFormation, 'home');
  doc = applyFormation(doc, 'auto', 'away');
  if (intent.theme === 'buildup') {
    doc = placeForTheme(doc, intent.theme);
  }

  // Ballon
  if (!doc.objects.some((o) => o.kind === 'ball')) {
    const homes = playersOf(doc, 'home');
    const owner = homes[0];
    if (owner) doc = { ...doc, objects: [...doc.objects, makeBall(owner.x, owner.y, owner.id)] };
  }
  doc = resetStepZero(doc);
  doc = ensureSteps(doc, 1);

  // Matériel d'entraînement
  doc = addMaterialShapes(doc, intent);

  // Trajectoires et étapes du thème
  doc = buildScript(doc, intent.theme);
  doc = { ...doc, formation: homeFormation };
  return doc;
}

function placeForTheme(doc: TactixDoc, theme: ThemeId): TactixDoc {
  if (theme !== 'buildup') return doc;
  const v = doc.pitch.view;
  const homes = playersOf(doc, 'home');
  const positions: Point[] = [
    { x: v.x + v.w * 0.1, y: doc.pitch.width * 0.5 },
    { x: v.x + v.w * 0.22, y: doc.pitch.width * 0.3 },
    { x: v.x + v.w * 0.22, y: doc.pitch.width * 0.7 },
    { x: v.x + v.w * 0.42, y: doc.pitch.width * 0.35 },
    { x: v.x + v.w * 0.42, y: doc.pitch.width * 0.65 },
    { x: v.x + v.w * 0.68, y: doc.pitch.width * 0.25 },
    { x: v.x + v.w * 0.68, y: doc.pitch.width * 0.75 },
    { x: v.x + v.w * 0.85, y: doc.pitch.width * 0.5 },
  ];
  const objects = doc.objects.map((o) => {
    if (o.kind !== 'player' || o.team !== 'home' || o.keeper) return o;
    const idx = homes.findIndex((h) => h.id === o.id);
    const p = positions[Math.min(idx, positions.length - 1)];
    return { ...o, x: p.x, y: p.y };
  });
  return resetStepZero({ ...doc, objects });
}

function addMaterialShapes(doc: TactixDoc, intent: ParsedIntent): TactixDoc {
  const v = doc.pitch.view;
  const objects: SceneObject[] = [];
  const equipIds = intent.material
    .map((label) => equipmentById(label)?.id ?? MATERIAL_WORDS.find((m) => equipmentById(m.id)?.label === label)?.id)
    .filter(Boolean) as string[];

  for (const id of ['plat', 'coupelle', 'cone']) {
    if (!equipIds.includes(id)) continue;
    // Lignes de repères sur un côté du terrain
    for (let i = 0; i < 4; i++) {
      objects.push({
        id: uid('e'),
        kind: 'equipment',
        itemType: id,
        x: v.x + v.w * (0.2 + i * 0.18),
        y: v.y + v.h * 0.06,
        rotation: 0,
        scale: 1,
      });
    }
  }
  if (equipIds.includes('cerceau') || equipIds.includes('echelle') || equipIds.includes('slalom')) {
    const id = equipIds.includes('echelle') ? 'echelle' : equipIds.includes('cerceau') ? 'cerceau' : 'slalom';
    for (let i = 0; i < 3; i++) {
      objects.push({
        id: uid('e'),
        kind: 'equipment',
        itemType: id,
        x: v.x + v.w * (0.25 + i * 0.22),
        y: v.y + v.h * 0.94,
        rotation: 0,
        scale: 1,
      });
    }
  }
  const structural = equipIds.filter((id) =>
    ['mannequin', 'haie', 'piquet', 'jalon', 'barriere', 'corde', 'elastique', 'banc', 'cible', 'mur', 'porte'].includes(id),
  );
  structural.slice(0, 4).forEach((id, i) => {
    objects.push({
      id: uid('e'),
      kind: 'equipment',
      itemType: id,
      x: v.x + v.w * (0.34 + i * 0.12),
      y: v.y + v.h * (0.42 + (i % 2) * 0.16),
      rotation: 0,
      scale: 1,
    });
  });
  if (objects.length === 0) return doc;
  return {
    ...doc,
    objects: [...doc.objects, ...objects],
    steps: doc.steps.map((s, i) =>
      i === 0
        ? {
            ...s,
            positions: {
              ...s.positions,
              ...Object.fromEntries(objects.map((o) => [o.id, { x: o.x, y: o.y }])),
            },
          }
        : s,
    ),
  };
}

/** Écrit un enchaînement automatique d'actions + étapes selon le thème. */
function buildScript(doc: TactixDoc, theme: ThemeId): TactixDoc {
  const homes = playersOf(doc, 'home').filter((o) => !o.keeper);
  const aways = playersOf(doc, 'away').filter((o) => !o.keeper);
  if (homes.length === 0) return doc;
  const ball = doc.objects.find((o) => o.kind === 'ball');
  if (!ball) return doc;
  const v = doc.pitch.view;

  const actions: Action[] = [];
  const push = (
    type: Action['type'],
    owner: SceneObject,
    to: Point,
    step: number,
    receiver?: SceneObject,
  ) => {
    const points = [{ x: owner.x, y: owner.y }, to];
    actions.push(
      createAction(type, owner.id, points, {
        stepIndex: step,
        ballId: type === 'pass' || type === 'shot' || type === 'dribble' ? ball.id : null,
        receiverId: receiver ? receiver.id : null,
      }),
    );
  };

  if (theme === 'buildup') {
    const gk = doc.objects.find((o) => o.kind === 'player' && o.keeper && o.team === 'home');
    const dc = homes[0];
    const mc = homes[3] ?? homes[1] ?? homes[0];
    const winger = homes[5] ?? homes[homes.length - 1];
    if (gk) push('pass', gk, { x: dc.x, y: dc.y }, 0, dc);
    push('pass', dc, { x: mc.x, y: mc.y }, 1, mc);
    push('run', mc, { x: v.x + v.w * 0.62, y: mc.y * 0.92 }, 1);
    push('pass', mc, { x: winger.x, y: winger.y }, 2, winger);
    push('run', winger, { x: v.x + v.w * 0.9, y: winger.y }, 2);
  } else if (theme === 'transition') {
    const carrier = homes[0];
    const target = homes[Math.min(2, homes.length - 1)];
    const runner = homes[homes.length - 1];
    push('pass', carrier, { x: target.x, y: target.y }, 0, target);
    push('run', runner, { x: v.x + v.w * 0.86, y: runner.y }, 0);
    push('pass', target, { x: v.x + v.w * 0.78, y: runner.y }, 1, runner);
    push('run', runner, { x: v.x + v.w * 0.92, y: doc.pitch.width * 0.5 }, 1);
  } else if (theme === 'pressing') {
    const presser = aways[0];
    const carrier = homes[0];
    if (presser && carrier) {
      push('press', presser, { x: carrier.x + 1.5, y: carrier.y }, 0);
      const second = aways[1];
      if (second) push('move', second, { x: carrier.x + 4, y: carrier.y + 3 }, 0);
    }
  } else if (theme === 'positional' || theme === 'rondo') {
    const ring = homes.length > 3 ? homes.slice(0, 4) : homes;
    const center = { x: v.x + v.w * 0.45, y: doc.pitch.width * 0.5 };
    const radius = Math.min(v.w, v.h) * 0.22;
    ring.forEach((pl, i) => {
      const angle = (i / Math.max(1, ring.length)) * Math.PI * 2;
      push('pass', ball.ownerId === pl.id ? pl : pl, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      }, 0, ring[(i + 1) % ring.length]);
    });
  } else if (theme === 'finishing') {
    const carrier = homes[0];
    const relay = homes[1] ?? homes[0];
    const finisher = homes[homes.length - 1];
    push('pass', carrier, { x: relay.x, y: relay.y }, 0, relay);
    push('pass', relay, { x: carrier.x, y: carrier.y }, 1, carrier);
    push('pass', carrier, { x: finisher.x, y: finisher.y }, 2, finisher);
    push('run', finisher, { x: v.x + v.w * 0.9, y: doc.pitch.width * 0.45 }, 3);
    push('shot', finisher, { x: v.x + v.w - 1, y: doc.pitch.width * 0.5 }, 4);
  } else {
    const a = homes[0];
    const b = homes[1] ?? homes[0];
    push('pass', a, { x: b.x, y: b.y }, 0, b);
    if (homes[2]) push('run', homes[2], { x: homes[2].x, y: Math.max(v.y + 2, homes[2].y - v.h * 0.25) }, 0);
    push('run', b, { x: v.x + v.w * 0.8, y: b.y }, 1);
  }

  if (actions.length === 0) return doc;
  const withSteps = ensureSteps(doc, 8);
  const result = applyActions(withSteps, actions).doc;
  const titles = [
    '1. Mise en place',
    '2. Première circulation',
    '3. Enchaînement',
    '4. Création du déséquilibre',
    '5. Finition',
    '6. Fin de séquence',
  ];
  return {
    ...result,
    steps: result.steps.map((s, i) => ({ ...s, title: titles[i] ?? `Étape ${i + 1}` })),
  };
}

function defaultName(intent: ParsedIntent): string {
  const theme = THEMES.find((t) => t.id === intent.theme);
  const base = theme ? theme.sub : 'Exercice';
  return `${base} — ${intent.format.home}v${intent.format.away}`;
}

function objectiveFor(intent: ParsedIntent): string {
  switch (intent.theme) {
    case 'buildup':
      return 'Sortir proprement de la zone de construction et casser la première ligne adverse.';
    case 'transition':
      return 'Enchaîner récupération et attaque rapide vers l’avant en moins de 6 secondes.';
    case 'pressing':
      return 'Represser immédiatement après la perte du ballon et gagner le duel.';
    case 'positional':
      return 'Conserver le ballon sous pression et créer des supériorités numériques.';
    case 'rondo':
      return 'Améliorer la qualité de passe, le contrôle orienté et le soutien permanent.';
    case 'finishing':
      return 'Conclure les actions rapidement après le dernier passeur.';
    default:
      return 'Exercice de travail thématique — objectif à préciser.';
  }
}

function instructionsFor(intent: ParsedIntent): string {
  const keeper = intent.keeper ? ' avec gardien' : '';
  return `Exercice en ${intent.format.home} contre ${intent.format.away}${keeper}. Respecter le sens de circulation du ballon, rejouer immédiatement après chaque fin d'action. ${intent.theme === 'transition' ? 'Déclencher la transition dès la récupération.' : ''}`.trim();
}

function keyPointsFor(theme: ThemeId): string[] {
  switch (theme) {
    case 'buildup':
      return [
        'Écarter pour ouvrir les lignes de passe',
        'Prise d’information avant réception',
        'Attirer pour libérer le 3e homme',
      ];
    case 'pressing':
      return ['Premier rideau agressif', 'Verrouiller le porteur', 'Réagir dès la perte'];
    case 'transition':
      return ['Première passe vers l’avant', 'Course de soutien immédiate', 'Finition rapide'];
    case 'positional':
      return ['Toujours 2 solutions', 'Jouer dans le dos du pressing', 'Changer de rythme'];
    default:
      return ['Qualité technique', 'Rythme d’exécution', 'Communication'];
  }
}

// ── API ──────────────────────────────────────────────────────

export function assistantCreate(prompt: string): { doc: TactixDoc; replies: string[] } {
  const intent = parseIntent(prompt);
  const doc = generateFromIntent(intent);
  const replies = [
    `Terrain ${intent.pitch} · ${intent.orientation} · buts : ${intent.goals}`,
    `Effectif ${intent.format.home} contre ${intent.format.away}${intent.keeper ? ' avec gardien' : ''}`,
    `${doc.steps.length} étapes générées automatiquement`,
  ];
  return { doc, replies };
}

export interface ModifyResult {
  doc: TactixDoc;
  replies: string[];
}

export function assistantModify(doc: TactixDoc, prompt: string): ModifyResult {
  const p = normalize(prompt);
  const replies: string[] = [];
  let next = cloneDoc(doc);

  // Ajouter / retirer des joueurs
  const addMatch = /(ajoute|ajouter|mets|met)\s+(un|une|\d+)?\s*(joueur|attaquant|defenseur|adversaire|gardien)/.exec(p);
  const removeMatch = /(enleve|enlever|retire|retirer|supprime|supprimer)\s+(un|une|\d+)?\s*(joueur|attaquant|defenseur|adversaire|gardien)/.exec(p);

  if (/gardien/.test(p) && addMatch) {
    const v = next.pitch.view;
    const side = /gauche|but de gauche/.test(p) ? v.x + 4 : v.x + v.w - 4;
    const team: Team = side > v.x + v.w / 2 ? 'away' : 'home';
    next = {
      ...next,
      objects: [
        ...next.objects,
        makePlayer(team, 1, side, next.pitch.width / 2, { role: 'GK', keeper: true }),
      ],
      info: { ...next.info, material: [...new Set([...next.info.material, 'Gardien'])] },
    };
    replies.push('Gardien ajouté');
  } else if (addMatch) {
    const team: Team = /adversaire|defenseur/.test(p) ? 'away' : 'home';
    const count = addMatch[2] && /^\d+$/.test(addMatch[2]) ? parseInt(addMatch[2], 10) : 1;
    const current = playersOf(next, team).length;
    next = syncTeamCount(next, team, current + count);
    replies.push(`${count} joueur${count > 1 ? 's' : ''} ajouté${count > 1 ? 's' : ''} (${team === 'away' ? 'adversaires' : 'équipe'})`);
  } else if (removeMatch) {
    const team: Team = /adversaire|defenseur/.test(p) ? 'away' : 'home';
    const current = playersOf(next, team).length;
    if (current > 1) {
      next = syncTeamCount(next, team, current - 1);
      replies.push('Joueur retiré');
    } else {
      replies.push('Impossible : il faut au moins un joueur');
    }
  }

  // Format
  const fmt = /(\d{1,2})\s*(?:contre|vs\.?|v)\s*(\d{1,2})/.exec(p);
  const passTo = /(passe|passer|mets)\s+(?:en|a|à)?\s*(\d{1,2})\s*(?:contre|vs\.?|v)\s*(\d{1,2})/.exec(p);
  const fmtMatch = passTo ?? fmt;
  if (fmtMatch && /format|contre|vs|passe|passe en/.test(p)) {
    const id = `${fmtMatch[fmtMatch.length - 2]}v${fmtMatch[fmtMatch.length - 1]}`;
    if (formatById(id)) {
      next = applyFormat(next, id);
      replies.push(`Format ${id} appliqué`);
    }
  }

  // Buts
  if (/petits buts/.test(p) && /(lateral|lateraux|cote)/.test(p)) {
    next = setGoalConfig(next, 'twoSmallSides');
    replies.push('Deux petits buts latéraux');
  } else if (/(quatre|4) petits buts/.test(p)) {
    next = setGoalConfig(next, 'fourSmall');
    replies.push('4 petits buts');
  } else if (/(deux|2) petits buts/.test(p)) {
    next = setGoalConfig(next, 'twoSmall');
    replies.push('2 petits buts');
  } else if (/grand but/.test(p) && /gardien/.test(p)) {
    next = setGoalConfig(next, 'oneLargeKeeper');
    replies.push('Grand but + gardien');
  } else if (/grand but/.test(p)) {
    next = setGoalConfig(next, 'oneLarge');
    replies.push('Grand but ajouté');
  }

  // Sens du jeu
  if (/inverse|inverser|retourne|retourner|sens de l/.test(p)) {
    next = reverseDirection(next);
    replies.push('Sens de jeu inversé');
  }

  // Terrain / orientation
  const terrainMatch = /(dernier tiers|surface|demi[- ]?terrain|terrain complet|jeu reduit|3 ?\/ ?4)/.exec(p);
  if (terrainMatch && /(terrain|passe|mets|sur)/.test(p)) {
    const map: Record<string, PitchTemplateId> = {
      'dernier tiers': 'finalThird',
      surface: 'penaltyArea',
      'demi-terrain': 'half',
      'demi terrain': 'half',
      'terrain complet': 'full',
      'jeu reduit': 'reduced',
      '3/4': 'threeQuarter',
      '3 /4': 'threeQuarter',
    };
    const template = map[terrainMatch[1]] ?? 'half';
    next = applyPitch(next, template, next.pitch.orientation, CUSTOM_DEFAULT);
    replies.push(`Terrain : ${template}`);
  }
  if (/vertical/.test(p) && /(terrain|orientation|vertical)/.test(p)) {
    next = applyPitch(next, next.pitch.template, 'vertical', CUSTOM_DEFAULT);
    replies.push('Terrain en vertical');
  } else if (/horizontal/.test(p)) {
    next = applyPitch(next, next.pitch.template, 'horizontal', CUSTOM_DEFAULT);
    replies.push('Terrain en horizontal');
  }

  // Étapes
  if (/(ajoute|ajouter|nouvelle)\s+(une\s+)?(etape|deuxieme etape)/.test(p)) {
    next = ensureSteps(next, next.steps.length + 1);
    replies.push(`Étape ajoutée (${next.steps.length} au total)`);
  }

  // Matériel
  for (const m of MATERIAL_WORDS) {
    if (!p.includes(normalize(m.word))) continue;
    const item = equipmentById(m.id);
    if (!item) continue;
    const count = item.repeatable ? 4 : 1;
    const v = next.pitch.view;
    const created: SceneObject[] = [];
    for (let i = 0; i < count; i++) {
      created.push({
        id: uid('e'),
        kind: 'equipment',
        itemType: m.id,
        x: v.x + v.w * (0.2 + i * 0.12),
        y: v.y + v.h * 0.12,
        rotation: 0,
        scale: 1,
      });
    }
    next = { ...next, objects: [...next.objects, ...created] };
    next = {
      ...next,
      steps: next.steps.map((s, i) =>
        i === 0
          ? {
              ...s,
              positions: {
                ...s.positions,
                ...Object.fromEntries(created.map((o) => [o.id, { x: o.x, y: o.y }])),
              },
            }
          : s,
      ),
      info: { ...next.info, material: [...new Set([...next.info.material, item.label])] },
    };
    replies.push(`${count} × ${item.label}`);
    break;
  }

  // Fiche
  const dur = /(\d{1,3})\s*(min|minutes)/.exec(p);
  if (dur && /(duree|minutes|min)/.test(p)) {
    const value = clamp(parseInt(dur[1], 10), 5, 90);
    next = { ...next, info: { ...next.info, durationMin: value } };
    replies.push(`Durée : ${value} min`);
  }
  const intensity = /intensite\s*(\d)/.exec(p);
  if (intensity) {
    const value = clamp(parseInt(intensity[1], 10), 1, 5);
    next = { ...next, info: { ...next.info, intensity: value } };
    replies.push(`Intensité : ${value}/5`);
  }
  const rename = /(renomme|appelle|titre)\s*(?:le|la|l’|l')?\s*(?:exercice|seance|séance)?\s*(?:en|:)?\s*["“«]?([^"”»]+)["”»]?/.exec(prompt);
  if (rename) {
    const value = rename[3].trim();
    if (value) {
      next = { ...next, name: value.slice(0, 60) };
      replies.push(`Renommé : ${next.name}`);
    }
  }
  const objective = /(objectif)\s*(?:est|:)?\s*(.+)/.exec(prompt);
  if (objective) {
    next = { ...next, info: { ...next.info, objective: objective[2].trim() } };
    replies.push('Objectif mis à jour');
  }
  const categoryMatch = CATEGORIES.flatMap((c) => c.items.map((i) => ({ cat: c.id, item: i }))).find(
    (entry) => p.includes(normalize(entry.cat)) || p.includes(normalize(entry.item)),
  );
  if (categoryMatch) {
    next = {
      ...next,
      info: { ...next.info, category: categoryMatch.cat, subcategory: categoryMatch.item },
    };
    replies.push(`Catégorie : ${categoryMatch.cat} · ${categoryMatch.item}`);
  }

  if (replies.length === 0) {
    replies.push(
      'Je n’ai pas compris la demande. Essayez : « ajoute un défenseur », « mets deux petits buts sur les côtés », « passe en 5 contre 4 », « inverse le sens », « ajoute une étape », « vertical ».',
    );
  }
  return { doc: next, replies };
}

export const ASSISTANT_EXAMPLES = [
  'Crée-moi un exercice de sortie de balle en 4 contre 3 avec un gardien, deux petits buts sur les côtés et une transition rapide.',
  'Exercice de finition 3 contre 2 sur demi-terrain avec gardien et ballons.',
  'Rondo 4 contre 4 sur terrain vertical en jeu réduit.',
  'Pressing 6 contre 5 sur 3/4 de terrain avec plots et mannequins.',
];
