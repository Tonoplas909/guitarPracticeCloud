import {
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { formatTime } from '../../shared/formatting';
import { ThemeService } from '../../shared/services/theme.service';

/** Largeur d'une colonne de forme d'onde, en pixels logiques. */
const COLUMN = 3;

/**
 * Barre de progression en forme d'onde, et contrôle de déplacement.
 *
 * Les amplitudes viennent du décodage du fichier DÉJÀ téléchargé pour la
 * lecture (voir `AudioEngineService.computePeaks`) : afficher la forme d'onde
 * ne coûte donc aucune requête supplémentaire. Tant que l'analyse n'est pas
 * finie — ou si le navigateur ne sait pas décoder le fichier — le composant
 * retombe sur un simple rail de progression, sans jamais disparaître.
 *
 * Accessibilité : un `<canvas>` n'est ni focalisable ni annoncé. L'élément
 * hôte porte donc `role="slider"` avec ses valeurs, et répond au clavier
 * (flèches, Début, Fin) exactement comme le ferait un `<input type="range">`.
 */
@Component({
  selector: 'app-waveform',
  imports: [],
  template: `<canvas #canvas [style.height.px]="height()"></canvas>`,
  styles: `
    :host {
      display: block;
      position: relative;
      width: 100%;
      cursor: pointer;
      touch-action: none;
      border-radius: var(--r-xs);
    }

    :host([aria-disabled='true']) {
      cursor: default;
      opacity: 0.5;
    }

    canvas {
      display: block;
      width: 100%;
    }
  `,
  host: {
    role: 'slider',
    tabindex: '0',
    '[attr.aria-disabled]': 'disabled()',
    '[attr.aria-valuemin]': '0',
    '[attr.aria-valuemax]': 'roundedDuration()',
    '[attr.aria-valuenow]': 'roundedTime()',
    '[attr.aria-valuetext]': 'valueText()',
    'aria-label': 'Position dans le morceau',
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(keydown)': 'onKeyDown($event)',
    '(window:resize)': 'redraw()',
  },
})
export class WaveformComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  /* Requête NON obligatoire, comme dans le visualiseur : l'`effect()` qui
     redessine peut être réveillé avant que la vue n'existe. */
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  /** Amplitudes normalisées, ou `null` tant que l'analyse n'a pas abouti. */
  readonly peaks = input<Float32Array | null>(null);

  readonly currentTime = input(0);
  readonly duration = input(0);
  readonly disabled = input(false);
  readonly height = input(44);

  /** Bornes de la boucle A → B, en secondes, pour les marquer sur l'onde. */
  readonly loopStart = input<number | null>(null);
  readonly loopEnd = input<number | null>(null);

  /** Position demandée, en fraction de la durée (0 → 1). */
  readonly seekTo = output<number>();

  private colors = {
    played: '#c0391c',
    pending: '#d9cfba',
    loop: 'rgba(0,117,104,0.14)',
    marker: '#007568',
  };

  constructor() {
    // Un seul effect redessine : il dépend de toutes les entrées utiles, donc
    // aucun changement ne peut passer inaperçu.
    effect(() => {
      this.peaks();
      this.currentTime();
      this.duration();
      this.loopStart();
      this.loopEnd();
      this.theme.resolved();

      this.readColors();
      this.redraw();
    });
  }

  /* Valeurs ARIA : un lecteur d'écran annonce « 1:12 sur 3:40 » plutôt que
     des secondes brutes, mais `aria-valuenow` doit rester un nombre. */
  protected roundedDuration(): number {
    return Math.round(this.duration());
  }

  protected roundedTime(): number {
    return Math.round(this.currentTime());
  }

  protected valueText(): string {
    return `${formatTime(this.currentTime())} sur ${formatTime(this.duration())}`;
  }

  // =====================================================================
  // Interactions
  // =====================================================================

  protected onPointerDown(event: PointerEvent): void {
    if (this.disabled()) return;

    // La capture permet de continuer à suivre le doigt ou la souris même
    // lorsqu'il sort du composant pendant le glissement.
    this.host.nativeElement.setPointerCapture?.(event.pointerId);
    this.emitFromPointer(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    // `buttons` vaut 0 quand on survole sans appuyer : on ne déplace alors pas
    // la lecture, sinon le simple passage de la souris ferait sauter le son.
    if (this.disabled() || event.buttons === 0) return;
    this.emitFromPointer(event);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (this.disabled()) return;

    const total = this.duration();
    if (total <= 0) return;

    // Les pas sont exprimés en secondes puis convertis : 5 s restent 5 s, que
    // le morceau dure une minute ou dix.
    const steps: Record<string, number> = {
      ArrowLeft: -5,
      ArrowRight: 5,
      ArrowDown: -5,
      ArrowUp: 5,
      PageDown: -30,
      PageUp: 30,
    };

    if (event.key === 'Home') {
      event.preventDefault();
      this.seekTo.emit(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      this.seekTo.emit(1);
      return;
    }

    const step = steps[event.key];
    if (step === undefined) return;

    event.preventDefault();
    const target = (this.currentTime() + step) / total;
    this.seekTo.emit(Math.max(0, Math.min(1, target)));
  }

  private emitFromPointer(event: PointerEvent): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = (event.clientX - rect.left) / rect.width;
    this.seekTo.emit(Math.max(0, Math.min(1, ratio)));
  }

  // =====================================================================
  // Dessin
  // =====================================================================

  protected redraw(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const context = canvas?.getContext('2d');
    // jsdom (tests) renvoie `null` : il n'y a rien à dessiner, et surtout
    // rien à faire planter.
    if (!canvas || !context) return;

    const width = canvas.clientWidth;
    if (width <= 0) {
      // Le composant n'a pas encore de largeur (premier rendu, ou parent
      // masqué) : on retente à la prochaine image plutôt que de ne rien
      // dessiner du tout.
      requestAnimationFrame(() => this.redraw());
      return;
    }

    const height = this.height();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const progress = this.duration() > 0 ? this.currentTime() / this.duration() : 0;
    this.drawLoopBand(context, width, height);

    const peaks = this.peaks();
    if (peaks && peaks.length > 0) this.drawPeaks(context, width, height, peaks, progress);
    else this.drawRail(context, width, height, progress);

    this.drawLoopMarkers(context, width, height);
  }

  /** Forme d'onde symétrique, la partie déjà jouée dans la couleur d'accent. */
  private drawPeaks(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    peaks: Float32Array,
    progress: number,
  ): void {
    const columns = Math.max(1, Math.floor(width / COLUMN));
    const middle = height / 2;
    const perColumn = peaks.length / columns;
    const playedUntil = progress * width;

    for (let column = 0; column < columns; column += 1) {
      // Chaque colonne affichée couvre plusieurs valeurs analysées : on garde
      // le maximum, pour qu'une attaque brève reste visible.
      const from = Math.floor(column * perColumn);
      const to = Math.max(from + 1, Math.floor((column + 1) * perColumn));
      let amplitude = 0;
      for (let index = from; index < to && index < peaks.length; index += 1) {
        if (peaks[index] > amplitude) amplitude = peaks[index];
      }

      const x = column * COLUMN;
      // Hauteur minimale de 2 px : un passage silencieux doit rester une
      // forme d'onde, pas un trou dans le dessin.
      const barHeight = Math.max(2, amplitude * (height - 2));

      context.fillStyle = x + COLUMN / 2 <= playedUntil ? this.colors.played : this.colors.pending;
      context.fillRect(x, middle - barHeight / 2, COLUMN - 1, barHeight);
    }
  }

  /** Rail simple, utilisé tant que la forme d'onde n'est pas disponible. */
  private drawRail(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    progress: number,
  ): void {
    const thickness = 4;
    const y = height / 2 - thickness / 2;

    context.fillStyle = this.colors.pending;
    context.fillRect(0, y, width, thickness);

    context.fillStyle = this.colors.played;
    context.fillRect(0, y, width * progress, thickness);
  }

  /** Bande teintée entre les points A et B de la boucle. */
  private drawLoopBand(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const total = this.duration();
    const start = this.loopStart();
    const end = this.loopEnd();
    if (total <= 0 || start === null || end === null) return;

    const from = (start / total) * width;
    const to = (end / total) * width;
    context.fillStyle = this.colors.loop;
    context.fillRect(from, 0, Math.max(1, to - from), height);
  }

  /** Repères verticaux A et B. */
  private drawLoopMarkers(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const total = this.duration();
    if (total <= 0) return;

    context.fillStyle = this.colors.marker;
    for (const mark of [this.loopStart(), this.loopEnd()]) {
      if (mark === null) continue;
      const x = Math.min(width - 2, (mark / total) * width);
      context.fillRect(x, 0, 2, height);
    }
  }

  private readColors(): void {
    if (typeof getComputedStyle !== 'function') return;

    const styles = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string): string =>
      styles.getPropertyValue(name).trim() || fallback;

    this.colors = {
      played: read('--accent', this.colors.played),
      pending: read('--line-strong', this.colors.pending),
      loop: read('--accent-2-soft', this.colors.loop),
      marker: read('--accent-2', this.colors.marker),
    };
  }
}
