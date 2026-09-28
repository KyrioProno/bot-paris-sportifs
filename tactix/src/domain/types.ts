// ─────────────────────────────────────────────────────────────
// TACTIX — Modèle de données central
// Le modèle est 100 % indépendant de l'affichage : toutes les positions
// sont exprimées en MÈTRES dans le repère du terrain (origine = coin
// supérieur gauche du terrain complet, x = longueur, y = largeur).
// L'orientation (horizontale / verticale) est une pure projection
// calculée au rendu : aucune donnée n'est jamais « tournée ».
// ─────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── Terrain ──────────────────────────────────────────────────

export type Orientation = 'horizontal' | 'vertical';

/** Types de terrains proposés dans la configuration rapide. */
export type PitchTemplateId =
  | 'full' // terrain complet 11v11
  | 'threeQuarter' // 3/4 de terrain
  | 'half' // demi-terrain
  | 'finalThird' // dernier tiers
  | 'penaltyArea' // surface de réparation
  | 'custom' // zone personnalisée
  | 'reduced'; // jeu réduit (2 buts / plusieurs petits buts)

export type MarkingStyle = 'fifa' | 'smallSided';

export interface PitchSpec {
  template: PitchTemplateId;
  /** Longueur totale du terrain « monde » en mètres (axe x). */
  length: number;
  /** Largeur totale du terrain « monde » en mètres (axe y). */
  width: number;
  /** Fenêtre visible du terrain, en mètres (clippe les marquages). */
  view: Rect;
  /** Style de marquage : normes FIFA ou terrain réduit. */
  marking: MarkingStyle;
  orientation: Orientation;
  /** Marge esthétique autour du terrain, en mètres. */
  padding: number;
  /** Affiche les bandes de tonte. */
  stripes: boolean;
}

// ── Buts ─────────────────────────────────────────────────────

export type GoalKind = 'large' | 'small' | 'mini';

export type GoalConfigId =
  | 'none'
  | 'oneLarge'
  | 'oneLargeKeeper'
  | 'twoLarge'
  | 'twoSmall'
  | 'twoSmallSides'
  | 'fourSmall'
  | 'oneLargeTwoSmall';

// ── Objets de la scène ───────────────────────────────────────

export type Team = 'home' | 'away' | 'neutral';

export type PlayerRole =
  | 'GK'
  | 'DC'
  | 'DD'
  | 'DG'
  | 'MDC'
  | 'MC'
  | 'MOC'
  | 'AD'
  | 'AG'
  | 'AC';

export type ObjectKind =
  | 'player'
  | 'ball'
  | 'goal'
  | 'equipment'
  | 'zone';

export interface SceneObject {
  id: string;
  kind: ObjectKind;
  /** Position en mètres (repère terrain complet). */
  x: number;
  y: number;
  /** Rotation en degrés (matériel, buts, zones). */
  rotation?: number;
  /** Surcharge de couleur. */
  color?: string;
  /** Objet verrouillé : impossible à déplacer. */
  locked?: boolean;

  // ── Joueurs ──
  team?: Team;
  number?: number;
  name?: string;
  role?: PlayerRole;
  showName?: boolean;
  /** Titulaire « gardien » (utilisé pour les configurations de buts). */
  keeper?: boolean;

  // ── Ballons ──
  /** Ballon rattaché à un joueur (possession). */
  ownerId?: string | null;

  // ── Buts / matériel / zones ──
  /** Identifiant de matériel (voir domain/equipment.ts). */
  itemType?: string;
  /** Type de but (voir domain/goals.ts). */
  goalKind?: GoalKind;
  scale?: number;
  zoneW?: number;
  zoneH?: number;
  zoneColor?: string;
}

// ── Trajectoires (actions) ───────────────────────────────────

export type ActionType =
  | 'pass'
  | 'run'
  | 'call'
  | 'dribble'
  | 'press'
  | 'move'
  | 'shot';

export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface Action {
  id: string;
  type: ActionType;
  /** Joueur (ou objet) qui effectue l'action. */
  ownerId: string;
  /** Points en mètres : [départ, ...points de passage]. */
  points: Point[];
  /** Étape dans laquelle l'action a été créée (segment 0). */
  stepIndex: number;
  style: LineStyle;
  curved: boolean;
  arrow: boolean;
  color?: string;
  /** Ballon concerné (passe, dribble, frappe). */
  ballId?: string | null;
  /** Joueur receveur (passe, frappe). */
  receiverId?: string | null;
  /** Distance de passe en mètres (info affichée). */
  label?: string;
}

// ── Étapes ───────────────────────────────────────────────────

export interface Step {
  id: string;
  title: string;
  note?: string;
  /** Durée de maintien de l'étape avant de passer à la suivante (ms). */
  holdMs: number;
  /** Durée de la transition vers l'étape suivante (ms). */
  transitionMs: number;
  /** Position initiale de chaque objet pour cette étape. */
  positions: Record<string, Point>;
  /** Propriétaire du ballon au début de l'étape. */
  ballOwners: Record<string, string | null>;
  /** Actions jouées pendant la transition vers l'étape suivante. */
  actions: Action[];
  /**
   * Traçabilité : identifiants d'objets dont la position de cette étape
   * est CALCULÉE à partir des actions de l'étape précédente.
   * Permet de recalculer proprement quand une trajectoire est modifiée.
   */
  derived?: string[];
  /** Identifiants de ballons dont le propriétaire est calculé. */
  derivedOwners?: string[];
}

// ── Fiche d'exercice ─────────────────────────────────────────

export interface ExerciseInfo {
  objective: string;
  category: string | null;
  subcategory: string | null;
  players: string;
  ageGroup: string;
  durationMin: number;
  intensity: number; // 1..5
  material: string[];
  instructions: string;
  keyPoints: string[];
  variants: string;
}

// ── Documents ────────────────────────────────────────────────

export type DocKind = 'tactic' | 'exercise';

export interface TactixDoc {
  id: string;
  kind: DocKind;
  name: string;
  createdAt: string;
  updatedAt: string;
  favorite: boolean;
  /** Terrain + orientation. */
  pitch: PitchSpec;
  goalConfig: GoalConfigId;
  format: string;
  formation: string;
  objects: SceneObject[];
  steps: Step[];
  info: ExerciseInfo;
  /** Journal de l'assistant (création / modifications par texte). */
  assistantLog: { role: 'user' | 'app'; text: string; at: string }[];
  /** Score de complétion « mode création rapide ». */
  quickDraft?: boolean;
}

// ── Séances ──────────────────────────────────────────────────

export type SessionBlockId =
  | 'warmup'
  | 'technique'
  | 'tactics'
  | 'finishing'
  | 'game';

export interface SessionItem {
  id: string;
  exerciseId: string;
  block: SessionBlockId;
  durationMin: number;
  note?: string;
}

export interface Session {
  id: string;
  name: string;
  date: string;
  group: string;
  coach: string;
  notes: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  items: SessionItem[];
}

// ── Espace de travail (persisté) ─────────────────────────────

export interface Settings {
  mode: 'simple' | 'advanced';
  lastTab: TabId;
  quickStartSeen: boolean;
  showGrid: boolean;
  snapPrecise: boolean;
  speed: number;
}

export interface Workspace {
  version: number;
  docs: TactixDoc[];
  sessions: Session[];
  settings: Settings;
}

export type TabId = 'home' | 'tactics' | 'exercises' | 'sessions' | 'library';

export type Route =
  | { name: 'home' }
  | { name: 'tactics' }
  | { name: 'exercises' }
  | { name: 'sessions' }
  | { name: 'library'; filter?: 'all' | 'tactic' | 'exercise' | 'session' | 'favorite' }
  | { name: 'editor'; docId: string }
  | { name: 'session'; sessionId: string }
  | { name: 'present'; docId: string };
