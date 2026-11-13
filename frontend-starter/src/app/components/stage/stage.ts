import {
  Component,
  ElementRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import {
  REPEAT_LABELS,
  VISUALIZER_LABELS,
  VisualizerMode,
} from '../../shared/models/playback.model';
import { Track } from '../../shared/models/track.model';
import { formatAudioType, formatSize } from '../../shared/audio-constraints';
import { formatRate, formatTime } from '../../shared/formatting';
import { AudioEngineService, EqBand } from '../../shared/services/audio-engine.service';
import { PLAYBACK_RATES, PlayerService } from '../../shared/services/player.service';
import { TrackMetaService } from '../../shared/services/track-meta.service';
import { IconComponent } from '../icon/icon';
import { VisualizerComponent } from '../visualizer/visualizer';
import { WaveformComponent } from '../waveform/waveform';

/** Les trois bandes de l'égaliseur, dans l'ordre du grave vers l'aigu. */
const EQ_BANDS: readonly { key: EqBand; label: string; hint: string }[] = [
  { key: 'low', label: 'Graves', hint: 'sous 160 Hz' },
  { key: 'mid', label: 'Médiums', hint: 'autour de 1 kHz' },
  { key: 'high', label: 'Aigus', hint: 'au-dessus de 5 kHz' },
];

/**
 * « La scène » : la vue plein écran de la lecture en cours.
 *
 * Elle ne détient aucun état propre — tout vient de `PlayerService` et de
 * `AudioEngineService`. On peut donc l'ouvrir et la fermer sans jamais
 * interrompre le son, et elle affiche exactement la même chose que la barre
 * de lecture, en grand.
 *
 * C'est aussi l'endroit où vivent les outils de travail qui n'ont pas leur
 * place dans une barre de 76 px : la boucle A → B, la vitesse de lecture,
 * l'égaliseur trois bandes et la file d'attente.
 *
 * Accessibilité : c'est une boîte de dialogue modale. Elle est annoncée comme
 * telle, le focus est déplacé sur le bouton de fermeture à l'ouverture, et
 * Échap referme.
 */
@Component({
  selector: 'app-stage',
  imports: [IconComponent, VisualizerComponent, WaveformComponent],
  templateUrl: './stage.html',
  styleUrl: './stage.css',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Lecture en cours',
    '(keydown.escape)': 'player.closeStage()',
  },
})
export class StageComponent {
  readonly player = inject(PlayerService);
  readonly engine = inject(AudioEngineService);
  private readonly meta = inject(TrackMetaService);

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  readonly bands = EQ_BANDS;
  readonly rates = PLAYBACK_RATES;
  readonly repeatLabels = REPEAT_LABELS;
  readonly visualizerLabels = VISUALIZER_LABELS;
  readonly visualizerModes: readonly VisualizerMode[] = ['bars', 'wave', 'groove'];

  readonly formatTime = formatTime;
  readonly formatRate = formatRate;
  readonly formatSize = formatSize;
  readonly formatAudioType = formatAudioType;

  constructor() {
    // À l'ouverture, le focus doit entrer dans la boîte de dialogue : sinon un
    // utilisateur au clavier continuerait de parcourir la page cachée derrière.
    effect(() => {
      const button = this.closeButton()?.nativeElement;
      button?.focus();
    });
  }

  isFavorite(trackId: string): boolean {
    return this.meta.isFavorite(trackId);
  }

  toggleFavorite(trackId: string): void {
    this.meta.toggleFavorite(trackId);
  }

  playsCount(trackId: string): number {
    return this.meta.meta(trackId).plays;
  }

  /** Le `<input type="range">` renvoie une chaîne : il faut la reconvertir. */
  onEqChange(band: EqBand, event: Event): void {
    this.engine.setEq(band, Number((event.target as HTMLInputElement).value));
  }

  onRateChange(event: Event): void {
    this.player.setRate(Number((event.target as HTMLInputElement).value));
  }

  /** Lecture d'une entrée de la file, sans changer la file elle-même. */
  playFromQueue(track: Track): void {
    this.player.play(track, this.player.queue());
  }

  /** Décibels signés, pour que « +3 » et « -3 » se distinguent au premier coup d'œil. */
  formatDecibels(value: number): string {
    if (value === 0) return '0 dB';
    return `${value > 0 ? '+' : ''}${value} dB`;
  }
}
