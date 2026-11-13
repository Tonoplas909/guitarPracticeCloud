import { Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { REPEAT_LABELS, VISUALIZER_LABELS, VisualizerMode } from '../../shared/models/playback.model';
import { formatAudioType, formatSize } from '../../shared/audio-constraints';
import { formatRate, formatTime } from '../../shared/formatting';
import { PLAYBACK_RATES, PlayerService } from '../../shared/services/player.service';
import { AudioEngineService } from '../../shared/services/audio-engine.service';
import { TrackMetaService } from '../../shared/services/track-meta.service';
import { IconComponent } from '../icon/icon';
import { VisualizerComponent } from '../visualizer/visualizer';
import { WaveformComponent } from '../waveform/waveform';

/**
 * Barre de lecture fixée en bas de l'écran, et SEUL endroit de l'application
 * où vit un élément `<audio>`.
 *
 * Elle est montée par la coquille applicative, au-dessus du `router-outlet` :
 * changer de page ne la détruit donc pas, et la musique continue. Tout son
 * état vient de `PlayerService` ; ce composant n'est qu'un tableau de bord,
 * il ne détient rien.
 *
 * La pochette est le visualiseur en mode « sillon » : plutôt qu'une image
 * qu'on n'a pas, on montre le son lui-même.
 */
@Component({
  selector: 'app-player-bar',
  imports: [IconComponent, VisualizerComponent, WaveformComponent],
  templateUrl: './player-bar.html',
  styleUrl: './player-bar.css',
})
export class PlayerBarComponent {
  readonly player = inject(PlayerService);
  readonly engine = inject(AudioEngineService);
  private readonly meta = inject(TrackMetaService);

  /**
   * L'élément audio est déclaré dans ce template et jamais dans un `@if` :
   * `createMediaElementSource()` ne peut être appelé qu'une fois par élément,
   * donc un élément recréé couperait le visualiseur et l'égaliseur.
   */
  private readonly audioRef = viewChild<ElementRef<HTMLAudioElement>>('audio');

  readonly rates = PLAYBACK_RATES;
  readonly repeatLabels = REPEAT_LABELS;
  readonly visualizerLabels = VISUALIZER_LABELS;

  readonly formatTime = formatTime;
  readonly formatRate = formatRate;
  readonly formatSize = formatSize;
  readonly formatAudioType = formatAudioType;

  constructor() {
    // Branchement unique : la requête de vue est un Signal, l'effect se
    // déclenche donc dès que l'élément existe, sans `setTimeout` ni
    // `AfterViewInit`.
    effect(() => {
      const element = this.audioRef()?.nativeElement;
      if (element) this.player.registerElement(element);
    });
  }

  /** Mode du visualiseur, partagé avec la scène plein écran. */
  readonly visualizerMode = this.player.visualizerMode;

  isFavorite(): boolean {
    const track = this.player.current();
    return track ? this.meta.isFavorite(track.id) : false;
  }

  toggleFavorite(): void {
    const track = this.player.current();
    if (track) this.meta.toggleFavorite(track.id);
  }

  cycleVisualizer(): void {
    const order: VisualizerMode[] = ['bars', 'wave', 'groove'];
    const next = order[(order.indexOf(this.visualizerMode()) + 1) % order.length];
    this.visualizerMode.set(next);
  }

  /** Le `<select>` renvoie une chaîne : la vitesse doit être reconvertie. */
  onRateChange(event: Event): void {
    this.player.setRate(Number((event.target as HTMLSelectElement).value));
  }

  onVolumeChange(event: Event): void {
    this.player.setVolume(Number((event.target as HTMLInputElement).value));
  }

  /** Icône de répétition : le mode « une piste » a son propre pictogramme. */
  repeatIcon(): 'repeat' | 'repeat-one' {
    return this.player.repeat() === 'one' ? 'repeat-one' : 'repeat';
  }
}
