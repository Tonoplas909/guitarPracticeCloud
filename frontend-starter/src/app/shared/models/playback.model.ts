/**
 * Types de la lecture audio, partagés par le lecteur, la scène et la
 * bibliothèque. Ils sont regroupés ici pour qu'un seul fichier décrive le
 * vocabulaire du lecteur.
 */

/** Comportement en fin de piste. */
export type RepeatMode = 'off' | 'all' | 'one';

/** Rendu choisi pour le visualiseur. */
export type VisualizerMode = 'bars' | 'wave' | 'groove';

/** Thème de l'interface. `auto` suit la préférence du système. */
export type ThemeChoice = 'auto' | 'jour' | 'nuit';

/** Critère de tri de la bibliothèque. */
export type SortKey = 'recent' | 'oldest' | 'title' | 'size' | 'plays';

/**
 * Métadonnées locales d'une piste. Le backend du TP ne stocke que titre,
 * nom d'origine, type, taille et date : les favoris, le compteur d'écoutes
 * et les étiquettes vivent donc dans le navigateur (voir TrackMetaService).
 */
export interface TrackMeta {
  favorite: boolean;
  plays: number;
  /** Date ISO de la dernière écoute, ou `null` si jamais écoutée. */
  lastPlayedAt: string | null;
  tags: string[];
}

/** Valeur par défaut d'une piste dont rien n'a encore été enregistré. */
export const EMPTY_TRACK_META: TrackMeta = {
  favorite: false,
  plays: 0,
  lastPlayedAt: null,
  tags: [],
};

/** Libellés affichés pour chaque mode de répétition. */
export const REPEAT_LABELS: Record<RepeatMode, string> = {
  off: 'Répétition désactivée',
  all: 'Répéter la file',
  one: 'Répéter la piste',
};

/** Libellés affichés pour chaque rendu du visualiseur. */
export const VISUALIZER_LABELS: Record<VisualizerMode, string> = {
  bars: 'Spectre',
  wave: 'Oscilloscope',
  groove: 'Sillon',
};
