// ─────────────────────────────────────────────────────────────
// Catégories d'exercices (technique, tactique, physique, gardiens,
// coups de pied arrêtés) et métadonnées de fiche.
// ─────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  label: string;
  emoji: string;
  items: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'Technique',
    label: 'Technique',
    emoji: '⚙️',
    items: ['Passe', 'Contrôle', 'Conduite', 'Dribble', 'Jonglage', 'Finition'],
  },
  {
    id: 'Tactique',
    label: 'Tactique',
    emoji: '🧠',
    items: [
      'Sortie de balle',
      'Pressing',
      'Bloc bas',
      'Bloc médian',
      'Transition offensive',
      'Transition défensive',
      'Jeu positionnel',
      'Attaque',
    ],
  },
  {
    id: 'Physique',
    label: 'Physique',
    emoji: '💪',
    items: ['Vitesse', 'Explosivité', 'Endurance', 'Changement de direction'],
  },
  {
    id: 'Gardiens',
    label: 'Gardiens',
    emoji: '🧤',
    items: ['Réflexes', 'Plongeons', 'Sorties', '1 contre 1', 'Jeu au pied'],
  },
  {
    id: 'Coups de pied arrêtés',
    label: 'Coups de pied arrêtés',
    emoji: '🚩',
    items: ['Corners', 'Coups francs', 'Penalties'],
  },
];

export function subcategoriesOf(category: string | null): string[] {
  return CATEGORIES.find((c) => c.id === category)?.items ?? [];
}

export const AGE_GROUPS = [
  'U7',
  'U9',
  'U11',
  'U13',
  'U15',
  'U17',
  'U19',
  'Seniors',
  'Vétérans',
  'Féminines',
  'Loisir',
];

export const INTENSITY_LABELS = ['Très faible', 'Faible', 'Modérée', 'Élevée', 'Maximale'];

export const MATERIAL_IDEAS = [
  'Ballons',
  'Plots',
  'Coupelles',
  'Cônes',
  'Cerceaux',
  'Échelle de rythme',
  'Haies',
  'Mannequins',
  'Piquets',
  'Chasubles',
  'Grand but',
  'Petits buts',
  'Mini-buts',
  'Gardien',
  'Sifflet',
  'Chronomètre',
];
