import { Component, computed, input } from '@angular/core';

/**
 * Jeu d'icônes de l'application : des tracés sur une grille de 24 px, dessinés
 * au trait d'1,7 px pour s'accorder au filet des bordures.
 *
 * Elles sont déclarées en TypeScript, et non dans chaque template, pour trois
 * raisons : le même pictogramme ne peut plus diverger d'une page à l'autre, les
 * templates restent lisibles (`<app-icon name="play" />` au lieu de quinze
 * lignes de SVG), et rien n'est téléchargé — ni fichier de sprite, ni fonte
 * d'icônes.
 */
const ICON_PATHS = {
  play: ['M8 5.2 19 12 8 18.8z'],
  pause: ['M6.5 5h3.5v14H6.5z', 'M14 5h3.5v14H14z'],
  'skip-back': ['M19 19.5 9.5 12 19 4.5z', 'M5 4.8v14.4'],
  'skip-forward': ['M5 4.5 14.5 12 5 19.5z', 'M19 4.8v14.4'],
  shuffle: [
    'M16 3.2 20 7l-4 3.8',
    'M20 7h-3.6a4.2 4.2 0 0 0-3.4 1.7L9.5 13.3A4.2 4.2 0 0 1 6.1 15H4',
    'M16 13.2 20 17l-4 3.8',
    'M4 9h2.1a4.2 4.2 0 0 1 3.4 1.7l.6.8',
    'M13.3 13.5l.7.8A4.2 4.2 0 0 0 17.4 16H20',
  ],
  repeat: ['M17 2.5 21 6.5l-4 4', 'M3 11v-.5A4 4 0 0 1 7 6.5h14', 'M7 21.5 3 17.5l4-4', 'M21 13v.5a4 4 0 0 1-4 4H3'],
  'repeat-one': [
    'M17 2.5 21 6.5l-4 4',
    'M3 11v-.5A4 4 0 0 1 7 6.5h14',
    'M7 21.5 3 17.5l4-4',
    'M21 13v.5a4 4 0 0 1-4 4H3',
    'M11.4 10.4 12.6 9.6V14.4',
  ],
  volume: ['M11 5 6.2 9H3v6h3.2L11 19z', 'M15.6 9.4a3.6 3.6 0 0 1 0 5.2', 'M18.6 6.8a7.2 7.2 0 0 1 0 10.4'],
  'volume-off': ['M11 5 6.2 9H3v6h3.2L11 19z', 'M16.5 9.5 21 14.5', 'M21 9.5 16.5 14.5'],
  heart: [
    'M12 20.3 4.9 13.4A4.9 4.9 0 0 1 12 6.6a4.9 4.9 0 0 1 7.1 6.8z',
  ],
  star: ['M12 3.4l2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.8l6-.9z'],
  trash: ['M3.5 6.5h17', 'M9 6.5V4.2h6v2.3', 'M18.5 6.5 17.6 20H6.4L5.5 6.5', 'M10 10.5v6', 'M14 10.5v6'],
  download: ['M12 3.5v11.5', 'M7.5 10.8 12 15l4.5-4.2', 'M4.5 19.5h15'],
  upload: ['M12 16.2V4.5', 'M7.5 9 12 4.5 16.5 9', 'M4.5 15.5v2.6a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2.6'],
  search: ['M10.5 3.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20.5 20.5 15.6 15.6'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  plus: ['M12 5.5v13', 'M5.5 12h13'],
  check: ['M20 6.5 9.5 17 4 11.5'],
  sun: [
    'M12 7.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2z',
    'M12 2v2.2',
    'M12 19.8V22',
    'M4.2 4.2l1.6 1.6',
    'M18.2 18.2l1.6 1.6',
    'M2 12h2.2',
    'M19.8 12H22',
    'M4.2 19.8l1.6-1.6',
    'M18.2 5.8l1.6-1.6',
  ],
  moon: ['M20.8 13.4A8.8 8.8 0 1 1 10.6 3.2a6.9 6.9 0 0 0 10.2 10.2z'],
  auto: ['M3.5 4.5h17v11h-17z', 'M8.5 20h7', 'M12 15.5V20'],
  equalizer: ['M4 21v-6.5', 'M4 10V3', 'M12 21v-8.5', 'M12 8V3', 'M20 21v-4.5', 'M20 12V3', 'M1.5 14.5h5', 'M9.5 8.5h5', 'M17.5 16.5h5'],
  speed: ['M12 13.5 15.5 10', 'M3.6 17.5a9 9 0 1 1 16.8 0'],
  expand: ['M8.5 3.5H5.5a2 2 0 0 0-2 2v3', 'M15.5 3.5h3a2 2 0 0 1 2 2v3', 'M20.5 15.5v3a2 2 0 0 1-2 2h-3', 'M3.5 15.5v3a2 2 0 0 0 2 2h3'],
  collapse: ['M8.5 3.5v3a2 2 0 0 1-2 2h-3', 'M20.5 8.5h-3a2 2 0 0 1-2-2v-3', 'M3.5 15.5h3a2 2 0 0 1 2 2v3', 'M15.5 20.5v-3a2 2 0 0 1 2-2h3'],
  queue: ['M8.5 6.5h12', 'M8.5 12h12', 'M8.5 17.5h12', 'M3.5 6.5h.01', 'M3.5 12h.01', 'M3.5 17.5h.01'],
  disc: ['M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6z', 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z'],
  waveform: ['M2.5 10v4', 'M7 6.5v11', 'M11.5 3.5v17', 'M16 7.5v9', 'M20.5 10.5v3'],
  keyboard: ['M3 6.5h18v11H3z', 'M6.8 10.5h.01', 'M10.8 10.5h.01', 'M14.8 10.5h.01', 'M18 10.5h.01', 'M7.5 14h9'],
  user: ['M12 3.5a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4z', 'M4.2 20.5a7.8 7.8 0 0 1 15.6 0'],
  logout: ['M14.5 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.5', 'M9 16.5 4.5 12 9 7.5', 'M4.5 12h10'],
  refresh: ['M20.5 12a8.5 8.5 0 1 1-2.9-6.4', 'M20.5 4v4.8h-4.8'],
  clock: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 7.5V12l3.4 2'],
  tag: ['M20.3 13.6 12.6 21.3a1.5 1.5 0 0 1-2.1 0L3 13.8V4.5a1.5 1.5 0 0 1 1.5-1.5h9.3l6.5 6.5a2.6 2.6 0 0 1 0 4.1z', 'M7.5 7.5h.01'],
  music: ['M9 17.5V6l10-2v11.5', 'M6.5 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M16.5 18.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  loop: ['M7.5 7.5h9a3.2 3.2 0 0 1 0 6.4h-1.5', 'M10 10 7 7l3-3', 'M16.5 16.5h-9a3.2 3.2 0 0 1 0-6.4H9', 'M14 14l3 3-3 3'],
  filter: ['M3.5 5.5h17', 'M6.5 12h11', 'M10 18.5h4'],
  alert: ['M12 3.8 2.8 19.8h18.4z', 'M12 10v4', 'M12 17h.01'],
  chevron: ['M9 6l6 6-6 6'],
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** Icônes dessinées plein, les autres au trait. */
const FILLED: ReadonlySet<string> = new Set(['play', 'pause', 'skip-back', 'skip-forward']);

@Component({
  selector: 'app-icon',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      [attr.fill]="paintMode() === 'fill' ? 'currentColor' : 'none'"
      [attr.stroke]="paintMode() === 'fill' ? 'none' : 'currentColor'"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @for (path of paths(); track $index) {
        <path [attr.d]="path" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }
  `,
})
export class IconComponent {
  /** Nom du pictogramme. Un nom inconnu n'affiche rien plutôt que de casser. */
  readonly name = input.required<IconName>();

  /** Côté du carré, en pixels. */
  readonly size = input(18);

  /**
   * Force le remplissage — utilisé pour l'état « favori » : un cœur plein et
   * un cœur vide se distinguent sans dépendre de la couleur, ce qui garde
   * l'information lisible en niveaux de gris.
   */
  readonly solid = input(false);

  protected readonly paths = computed<readonly string[]>(() => ICON_PATHS[this.name()] ?? []);

  protected readonly paintMode = computed(() =>
    this.solid() || FILLED.has(this.name()) ? 'fill' : 'stroke',
  );
}
