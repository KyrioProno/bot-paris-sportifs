# TACTIX — « Dessine. Anime. Entraîne. »

Application complète de **tactique et d'entraînement football** : créer des tactiques, des
exercices et des séances, placer joueurs / adversaires / gardiens / ballons / matériel,
dessiner des trajectoires intelligentes au doigt, générer automatiquement les étapes et
animer l'exercice — puis l'exporter et le présenter aux joueurs.

Mobile-first (iPhone / smartphone), fonctionne aussi sur tablette et ordinateur.
Design sombre premium, pensée pour être utilisée d'une main, sur le terrain.

---

## Tester sans rien installer

Trois façons d'ouvrir l'application immédiatement :

1. **Fichier unique** — [`docs/tactix.html`](../docs/tactix.html) : un seul fichier HTML
   autonome (349 Ko, aucun fichier annexe, aucune connexion). Ouvrez-le directement dans un
   navigateur, ou hébergez-le n'importe où.
2. **Hébergement statique** — le dossier [`docs/`](../docs) contient le build complet, prêt
   pour GitHub Pages (`https://<compte>.github.io/bot-paris-sportifs/`), Netlify, Vercel, etc.
3. **En local** — voir ci-dessous.

## Démarrage

```bash
cd tactix
npm install
npm run dev        # http://localhost:5173  (accessible aussi depuis le réseau local)
```

Autres commandes :

```bash
npm run build          # build de production (dist/)
npm run preview        # prévisualisation du build
npm run typecheck      # vérification TypeScript
npm test               # moteur + rendu + fichier autonome
npm run render         # aperçus PNG des terrains (dossier preview/)
npm run build:offline  # fichier unique autonome → ../docs/tactix.html
npm run publish        # build complet + fichier unique → ../docs (hébergement statique)
```

---

## Les 3 modes

| Mode | Ce qu'il permet |
| --- | --- |
| **Tactique** | Animation d'un système : 11v11, coups de pied arrêtés, sorties de balle |
| **Exercice** | Exercice d'entraînement multi-étapes, matériel, consignes, variantes |
| **Séance** | Assemblage d'exercices par blocs (échauffement, technique, tactique, finition, jeu) avec durée totale automatique |

---

## Le moteur de terrain (vectoriel, réel)

Aucun fond d'image : **tout le terrain est calculé et dessiné par du code**.

* **Unités en mètres** dans le repère du terrain complet (105 × 68 m).
* Marquages conformes aux normes FIFA / IFAB : lignes de touche et de but, ligne médiane,
  rond central (9,15 m), point central, surfaces de réparation (16,50 × 40,32 m),
  rectangles des 5,50 m, points de penalty (11 m), arcs de cercle, arcs de corner, buts (7,32 m).
* Découpe géométrique (Liang–Barsky / Sutherland–Hodgman) : les marquages sont calculés
  pour le terrain complet puis **tronqués proprement** sur la zone visible.
* **Terrains** : complet · 3/4 · demi-terrain · dernier tiers · surface · jeu réduit · personnalisé.
* **Orientation** horizontale / verticale : le passage en vertical est un **vrai changement de
  repère** (`matrix(0 -1 1 0 0 k)`), pas une rotation d'image. Joueurs, buts, matériel,
  trajectoires et guides suivent — aucune donnée n'est jamais « tournée ».
* Changement de terrain / buts / format **sans casser l'exercice** : re-projection
  proportionnelle des objets et des trajectoires.

---

## Le cœur : trajectoire → étape suivante

Une trajectoire n'est pas un trait : c'est une **action** qui pilote le document.

```
Règle fondamentale : position finale d'une étape = position initiale de l'étape suivante
```

* Dessinez une **course** : le joueur est automatiquement placé au point final de l'étape suivante.
* Dessinez une **passe** vers un partenaire : le ballon change de propriétaire, suit réellement
  la trajectoire pendant l'animation, et l'étape suivante connaît le nouveau porteur.
* **Enchaînez** course → retour → décrochage : les étapes sont créées une à une, automatiquement.
* Modifiez ou supprimez une trajectoire : toute la chaîne est **recalculée**
  (les positions dérivées sont tracées par `derived` / `derivedOwners`).
* Les trajectoires sont **liées à leur joueur** : déplacer le joueur décale le point de départ ;
  supprimer le joueur propose « Supprimer également ses trajectoires ? Oui / Non ».

Actions disponibles : **passe, course, appel, déplacement, dribble, pressing, frappe**.
Style de ligne : continue, tirets, points. Ligne droite ou courbe. Couleurs par défaut :
bleu (passe), vert (course), rouge (pressing), blanc (déplacement) — modifiables.

---

## Interactions tactiles

| Geste | Effet |
| --- | --- |
| 1 doigt | Déplacer un joueur, un plot, un ballon, un but |
| Appui long | Menu contextuel complet de l'élément |
| 2 doigts | Zoom + déplacement du terrain |
| Double tap | Recentrer |
| Dessin | Sélectionner une action puis dessiner : le tracé devient une trajectoire propre (simplification Douglas–Peucker + lissage Catmull-Rom) |
| ＋ / − | Zoom (boutons) |
| Espace / ← → | Lecture-pause et navigation entre étapes (clavier) |

**Menu contextuel** — jamais 30 boutons : la barre du bas n'affiche que les outils pertinents
(rien de sélectionné → Joueur, Adversaire, Ballon, Matériel, Trajectoire ; joueur sélectionné →
ses 7 actions + dupliquer/supprimer ; plot sélectionné → rotation, taille, répétition, verrou…).

**Placement précis** : magnétisme sur les lignes du terrain, alignement avec les autres joueurs,
grille facultative, guides visuels, alignement et espacement automatique de plusieurs objets,
verrouillage. Désactivé = placement totalement libre.

---

## Fonctionnalités

* **Formats de jeu** : 1v1, 2v1, 2v2, 3v2, 3v3, 4v2, 4v3, 4v4, 5v3, 5v4, 5v5, 6v4, 6v5, 6v6,
  7v7, 8v8, 9v9 et **11v11** — application sans perte (les joueurs manquants sont placés sur
  les postes libres, les surnuméraires sont retirés proprement).
* **Formations** : 4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2, 5-4-1 + placements automatiques
  pour le jeu réduit (1 → 9 joueurs).
* **Buts** : grand but, grand but + gardien, 2 grands buts, 2 petits buts, 2 petits buts latéraux,
  4 petits buts, grand but + 2 petits ; chaque but est déplaçable, pivotable, duplicable.
* **Matériel** (24 éléments) : plots, coupelles, cônes, grands cônes, cerceaux, échelle de rythme,
  mini-haies, haies, piquets, mannequins, jalons, slalom, barrières, cordes, élastiques, bancs,
  rebonds, cibles, murs, portes, mini-buts, grands buts, ballons, zones colorées.
* **Fiche d'exercice** : nom, objectif, catégorie (technique, tactique, physique, gardiens,
  coups de pied arrêtés), sous-catégorie, joueurs, âge, durée, intensité, matériel, instructions,
  points clés, variantes, étapes.
* **Timeline** : ▶ ⏸ ⏮ ⏭ ↻ + pastilles numérotées, titres, notes, durées de maintien et de
  transition réglables.
* **Annuler / rétablir** : déplacement, ajout, suppression, trajectoire, étape, terrain (60 niveaux).
* **Sauvegarde automatique** (localStorage) — architecture prête pour comptes / cloud /
  synchronisation (persistance isolée dans `store/workspace.tsx`).
* **Export** : image PNG (étape en cours ou toutes les étapes), PDF complet (fiche + planches de
  toutes les étapes), partage natif, copie des instructions, sauvegarde JSON.
* **Mode présentation** : plein écran, interface masquée, lecture automatique, consignes.
* **Assistant** : création d'un exercice complet à partir d'une phrase en français, et
  modification par texte (« ajoute un défenseur », « passe en 5 contre 4 », « mets deux petits
  buts sur les côtés », « inverse le sens », « ajoute une étape », « terrain vertical »…).
* **Suggestions discrètes** : après placement, proposition de format ou de carré de passes —
  jamais bloquante.
* **Création rapide** : parcours guidé en 4 gestes ; les étapes se créent automatiquement
  pendant le dessin (exercice complet en moins d'une minute).

---

## Architecture

```
src/
  domain/            moteur métier, indépendant de React
    types.ts           modèle de données (mètres, repère terrain complet)
    geometry.ts        math, polylignes, lissage, simplification
    pitch/             dimensions FIFA, marquages, orientations (repères)
    doc.ts             fabrique de documents, changement de terrain/buts/format
    steps.ts           ÉTAPES : positions dérivées, possessions, recomputation
    actions.ts         actions/trajectoires, couleurs, durées, destinataires
    animation.ts       moteur d'animation (positions interpolées le long du tracé)
    team.ts            joueurs, équipes, formations, espacement
    formations.ts      formations prédéfinies + génériques (jeu réduit)
    formats.ts         formats 1v1 → 11v11
    goals.ts           types de buts + configurations prédéfinies
    equipment.ts       bibliothèque de matériel
    session.ts         blocs de séance, durées
    categories.ts      catégories et sous-catégories
    assistant.ts       analyse de phrase → exercice complet / modifications
  render/            moteur de rendu (mêmes primitives pour l'écran et l'export)
    shapes.ts          primitives vectorielles + sérialisation SVG
    clip.ts            découpe géométrique des marquages
    scene.ts           construction complète de la scène (terrain, joueurs, actions…)
    theme.ts           charte graphique
  engine/            interaction : hit test, magnétisme, guides, alignements
  hooks/useEditor.ts machine à états de l'éditeur (outils, sélection, étapes, animation)
  components/        UI : plateau, barre contextuelle, timeline, feuilles modales
  views/             accueil, bibliothèque, séances, éditeur, présentation, séance
  export/            SVG → PNG, PDF (impression A4), partage, lien encodé
  store/             persistance et état global
scripts/             autotests du moteur et de rendu, génération d'aperçus
```

---

## Tests

```bash
npm test
```

* `scripts/selftest.ts` — 140 vérifications : terrain complet, orientations, conversion de repère,
  marquages, 18 formats, buts et gardiens, matériel complet, trajectoire → étape suivante,
  possession du ballon, animation, suppression avec trajectoires liées, inversion de sens,
  assistant (création et modification).
* `scripts/smoketest.tsx` — rendu réel (SSR) de l'application, de l'éditeur et du mode
  présentation : détection d'erreurs de rendu.
* `scripts/offline-test.mjs` — charge le fichier autonome `docs/tactix.html` dans un DOM,
  exécute son script et clique réellement dans l'interface (navigation, création d'un
  exercice, rendu du terrain).

---

## Feuille de route

Phases 1 à 8 du cahier des charges livrées. Prochaine étape naturelle : comptes, équipes,
synchronisation cloud et partage en ligne (l'interface de persistance est déjà isolée).
