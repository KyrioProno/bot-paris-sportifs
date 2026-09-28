import type { useEditor } from '../../hooks/useEditor';

/** L'API complète de l'éditeur, partagée par les sous-composants. */
export type EditorApi = ReturnType<typeof useEditor>;

export { LINE_STYLE_OPTIONS } from '../../hooks/useEditor';
export const PLAYER_COLORS = [
  '#3D8BFF',
  '#FF4D5A',
  '#20E67A',
  '#FFAA3D',
  '#A78BFA',
  '#38BDF8',
  '#F4F7F5',
  '#87928C',
];
