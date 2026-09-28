import type { Session } from '../src/domain/types';

/** Séance de test (blocs, durées, notes). */
export function createSessionFixture(exerciseId: string): Session {
  const now = new Date().toISOString();
  return {
    id: 'ses_test',
    name: 'Séance type — Transition & finition',
    date: now.slice(0, 10),
    group: 'Seniors A',
    coach: 'Entraîneur',
    notes: 'Séance axée sur la transition offensive et la finition rapide.',
    favorite: true,
    createdAt: now,
    updatedAt: now,
    items: [
      { id: 'it1', exerciseId, block: 'warmup', durationMin: 15, note: 'Mobilité + passes' },
      { id: 'it2', exerciseId, block: 'technique', durationMin: 20 },
      { id: 'it3', exerciseId, block: 'tactics', durationMin: 25 },
      { id: 'it4', exerciseId, block: 'game', durationMin: 20 },
    ],
  };
}
