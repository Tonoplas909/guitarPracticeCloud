import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { VisualizerMode } from '../../shared/models/playback.model';
import { AudioEngineService } from '../../shared/services/audio-engine.service';
import { ThemeService } from '../../shared/services/theme.service';

/** Espace entre deux barres du spectre, en pixels logiques. */
const BAR_GAP = 2;

/** Vitesse de retombée des témoins de crête (fraction de hauteur par image). */
const PEAK_FALL = 0.012;

/**
 * Visualiseur audio temps réel, dessiné sur un `<canvas>`.
 *
 * Il lit le spectre et la forme d'onde instantanés fournis par
 * `AudioEngineService`, qui les tient d'un `AnalyserNode` branché sur
 * l'élément `<audio>` de la barre de lecture. Il ne touche jamais au son :
 * supprimer ce composant n'enlèverait que l'image.
 *
 * Trois rendus, choisis par l'utilisateur :
 * - `bars`   : spectre en barres, bandes regroupées de façon logarithmique
 *              pour que les graves ne mangent pas tout l'écran ;
 * - `wave`   : oscilloscope, le signal tel qu'il arrive ;
 * - `groove` : spectre déroulé en cercle, autour du sillon du disque.
 *
 * Trois précautions qui comptent :
 * 1. Le `<canvas>` est redimensionné en pixels PHYSIQUES
 *    (`devicePixelRatio`), sinon le tracé est flou sur un écran dense.
 * 2. La boucle d'animation ne tourne que pendant la lecture. En pause, une
 *    seule image « au repos » est dessinée : rien ne consomme de CPU.
 * 3. Les couleurs sont relues depuis les variables CSS du thème, et non
 *    codées en dur, pour que le visualiseur suive « jour » et « nuit ».
 */
@Component({
  selector: 'app-visualizer',
  imports: [],
  template: `
    <canvas #canvas [style.height.px]="height()"></canvas>
    <!-- Le canvas est purement décoratif : son contenu est déjà annoncé par
         l'état du lecteur (piste, position, lecture/pause). On le retire donc
         de l'arbre d'accessibilité plutôt que de le faire lire. -->
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      width: 100%;
      overflow: hidden;
    }

    canvas {
      display: block;
      width: 100%;
    }
  `,
  host: { 'aria-hidden': 'true' },
})
export class VisualizerComponent {
  private readonly engine = inject(AudioEngineService);
  private readonly theme = inject(ThemeService);
  private readonly destroyRef = inject(DestroyRef);

  /* Requête de vue NON obligatoire : les `effect()` déclarés ci-dessous sont
     réveillés par n'importe laquelle de leurs dépendances, y compris avant
     que la vue n'existe (composant rendu dans un `@if` qui vient de
     s'ouvrir). Une requête `required` lèverait alors une exception ; ici on
     se contente de ne rien dessiner. */
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  /** Rendu choisi. */
  readonly mode = input<VisualizerMode>('bars');

  /** Hauteur en pixels logiques. */
  readonly height = input(48);

  /** Vrai pendant la lecture : c'est ce qui démarre et arrête la boucle. */
  readonly playing = input(false);

  /** Épaisseur minimale d'une barre : en dessous, on dessine moins de bandes. */
  readonly barWidth = input(6);

  private frame = 0;
  private peaks: Float32Array = new Float32Array(0);
  private colors = { accent: '#c0391c', accent2: '#007568', faint: '#6f6454', line: '#d9cfba' };

  constructor() {
    // Les couleurs sont relues à chaque bascule de thème. Les relire à chaque
    // image coûterait un `getComputedStyle` 60 fois par seconde.
    effect(() => {
      this.theme.resolved();
      this.readColors();
      if (!this.playing()) this.drawRestingState();
    });

    // Démarrage et arrêt de la boucle : un seul endroit décide, en fonction de
    // l'état de lecture et de la disponibilité du graphe audio.
    effect(() => {
      const shouldRun = this.playing() && this.engine.available();
      this.mode();

      this.stop();
      if (shouldRun) this.start();
      else this.drawRestingState();
    });

    this.destroyRef.onDestroy(() => this.stop());
  }

  private start(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const context = canvas?.getContext('2d');
    // jsdom (tests) et les navigateurs sans canvas renvoient `null` : il n'y a
    // alors rien à dessiner, et surtout rien à faire planter.
    if (!canvas || !context) return;

    const render = (): void => {
      this.resize(canvas, context);
      this.draw(canvas, context, true);
      this.frame = requestAnimationFrame(render);
    };

    this.frame = requestAnimationFrame(render);
  }

  private stop(): void {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }

  /** Une seule image, en pause ou sans graphe audio. */
  private drawRestingState(): void {
    const canvas = this.canvasRef()?.nativeElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    this.resize(canvas, context);
    this.draw(canvas, context, false);
  }

  /**
   * Aligne la taille du tampon de dessin sur la taille affichée, en tenant
   * compte de la densité de l'écran. Fait à chaque image : c'est le seul
   * moyen fiable de suivre un redimensionnement de la fenêtre sans
   * `ResizeObserver`, et l'opération est sans effet quand rien n'a changé.
   */
  private resize(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.height() * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // Le repère est remis à l'échelle logique : tout le code de dessin
    // raisonne ensuite en pixels CSS, quelle que soit la densité.
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  private draw(
    canvas: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
    live: boolean,
  ): void {
    const width = canvas.clientWidth;
    const height = this.height();

    context.clearRect(0, 0, width, height);
    if (width <= 0 || height <= 0) return;

    switch (this.mode()) {
      case 'wave':
        this.drawWave(context, width, height, live);
        break;
      case 'groove':
        this.drawGroove(context, width, height, live);
        break;
      case 'bars':
      default:
        this.drawBars(context, width, height, live);
    }
  }

  // =====================================================================
  // Rendus
  // =====================================================================

  /**
   * Spectre en barres. Les 1024 bandes de l'analyseur sont regroupées de
   * façon LOGARITHMIQUE : l'oreille perçoit les hauteurs ainsi, et un
   * regroupement linéaire écraserait tout le haut du spectre dans les
   * dernières barres.
   */
  private drawBars(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    live: boolean,
  ): void {
    const count = Math.max(8, Math.floor(width / (this.barWidth() + BAR_GAP)));
    const barWidth = (width - BAR_GAP * (count - 1)) / count;
    const spectrum = live ? this.engine.readFrequencies() : null;
    const bands = spectrum?.length ?? 0;

    if (this.peaks.length !== count) this.peaks = new Float32Array(count);

    // Dégradé vertical unique, créé une fois par image : les barres partagent
    // la même échelle de couleur, donc leur hauteur reste comparable.
    const gradient = context.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, this.colors.accent);
    gradient.addColorStop(1, this.colors.accent2);

    for (let index = 0; index < count; index += 1) {
      let value = 0;

      if (spectrum && bands > 0) {
        // Bornes logarithmiques de la bande, en évitant un intervalle vide.
        const from = Math.floor(bands ** (index / count));
        const to = Math.max(from + 1, Math.floor(bands ** ((index + 1) / count)));

        let max = 0;
        for (let bin = from; bin < to && bin < bands; bin += 1) {
          if (spectrum[bin] > max) max = spectrum[bin];
        }
        value = max / 255;
      } else {
        // Au repos : un léger relief plutôt qu'une ligne morte, pour montrer
        // que le visualiseur est bien là et attend du son.
        value = 0.06 + 0.02 * Math.sin(index * 0.9);
      }

      const x = index * (barWidth + BAR_GAP);
      const barHeight = Math.max(2, value * (height - 3));
      const y = height - barHeight;

      context.fillStyle = live ? gradient : this.colors.line;
      this.fillRounded(context, x, y, barWidth, barHeight, Math.min(2.5, barWidth / 2));

      if (!live) continue;

      // Témoin de crête : il monte instantanément et retombe lentement, comme
      // sur un VU-mètre. Il rend visibles les pics trop brefs pour être lus
      // sur la barre elle-même.
      this.peaks[index] = Math.max(value, this.peaks[index] - PEAK_FALL);
      const peakY = height - Math.max(2, this.peaks[index] * (height - 3));
      context.fillStyle = this.colors.accent2;
      context.fillRect(x, Math.max(0, peakY - 1.5), barWidth, 1.5);
    }
  }

  /** Oscilloscope : le signal temporel, tracé d'un seul trait. */
  private drawWave(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    live: boolean,
  ): void {
    const middle = height / 2;

    // Ligne de zéro, toujours présente : elle donne l'échelle du tracé.
    context.strokeStyle = this.colors.line;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, middle);
    context.lineTo(width, middle);
    context.stroke();

    if (!live) return;

    const samples = this.engine.readWaveform();
    if (samples.length === 0) return;

    const step = Math.max(1, Math.floor(samples.length / width));

    context.strokeStyle = this.colors.accent;
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.beginPath();

    for (let x = 0, index = 0; index < samples.length; index += step, x += 1) {
      // L'analyseur centre le silence sur 128 : on ramène donc en -1 → +1.
      const amplitude = (samples[index] - 128) / 128;
      const y = middle - amplitude * (middle - 2);
      if (x === 0) context.moveTo(0, y);
      else context.lineTo(x, y);
    }

    context.stroke();
  }

  /**
   * Spectre déroulé en cercle, autour du trou du disque : c'est le rendu qui
   * donne son nom à la charte. Les barres rayonnent depuis un sillon central.
   */
  private drawGroove(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    live: boolean,
  ): void {
    const centerX = width / 2;
    const centerY = height / 2;
    const outer = Math.min(width, height) / 2 - 2;
    const inner = outer * 0.42;
    if (outer <= 0) return;

    // Sillons : trois cercles pâles, le décor fixe sur lequel tout se pose.
    context.strokeStyle = this.colors.line;
    context.lineWidth = 1;
    for (const ratio of [0.42, 0.62, 0.82]) {
      context.beginPath();
      context.arc(centerX, centerY, outer * ratio, 0, Math.PI * 2);
      context.stroke();
    }

    const spectrum = live ? this.engine.readFrequencies() : null;
    const bands = spectrum?.length ?? 0;
    const count = 84;

    context.lineCap = 'round';
    context.lineWidth = Math.max(1.5, (Math.PI * 2 * inner) / count - 1.5);

    for (let index = 0; index < count; index += 1) {
      let value = 0.05;

      if (spectrum && bands > 0) {
        const from = Math.floor(bands ** (index / count));
        const to = Math.max(from + 1, Math.floor(bands ** ((index + 1) / count)));
        let max = 0;
        for (let bin = from; bin < to && bin < bands; bin += 1) {
          if (spectrum[bin] > max) max = spectrum[bin];
        }
        value = max / 255;
      }

      // Départ en haut (-90°) : le pic des graves est ainsi à midi, là où
      // l'œil se pose d'abord.
      const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
      const length = inner + value * (outer - inner);

      context.strokeStyle = live
        ? value > 0.72
          ? this.colors.accent2
          : this.colors.accent
        : this.colors.line;

      context.beginPath();
      context.moveTo(centerX + Math.cos(angle) * inner, centerY + Math.sin(angle) * inner);
      context.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
      context.stroke();
    }
  }

  // =====================================================================
  // Outils
  // =====================================================================

  /**
   * Rectangle à sommet arrondi, posé sur la ligne de base.
   * `roundRect` est récent : son absence ne doit pas empêcher le dessin.
   */
  private fillRounded(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
  ): void {
    if (typeof context.roundRect !== 'function') {
      context.fillRect(x, y, width, height);
      return;
    }

    context.beginPath();
    context.roundRect(x, y, width, height, [radius, radius, 0, 0]);
    context.fill();
  }

  /**
   * Relit les couleurs du thème courant depuis les variables CSS. Les valeurs
   * lues sont des chaînes hexadécimales, directement acceptées par le canvas.
   */
  private readColors(): void {
    if (typeof getComputedStyle !== 'function') return;

    const styles = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string): string =>
      styles.getPropertyValue(name).trim() || fallback;

    this.colors = {
      accent: read('--accent', this.colors.accent),
      accent2: read('--accent-2', this.colors.accent2),
      faint: read('--ink-faint', this.colors.faint),
      line: read('--line', this.colors.line),
    };
  }
}
