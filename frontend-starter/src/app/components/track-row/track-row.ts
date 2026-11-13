import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Track } from '../../shared/models/track.model';
import { TrackMeta } from '../../shared/models/playback.model';
import { formatAudioType, formatSize } from '../../shared/audio-constraints';
import { formatDate, formatRelativeDate } from '../../shared/formatting';
import { TrackMetaService } from '../../shared/services/track-meta.service';
import { IconComponent } from '../icon/icon';

/**
 * Une ligne de la bibliothèque.
 *
 * Le composant ne décide de rien : il reçoit la piste et son état d'affichage,
 * et remonte les intentions de l'utilisateur par des `output()`. C'est la page
 * qui parle au serveur — c'est elle qui connaît la liste visible (donc la file
 * de lecture à constituer) et qui gère les erreurs HTTP.
 *
 * Seule exception : les métadonnées locales (favori, étiquettes, écoutes) sont
 * lues et écrites directement via `TrackMetaService`. Elles ne passent par
 * aucune requête, et les faire remonter à la page n'ajouterait que du
 * câblage.
 */
@Component({
  selector: 'app-track-row',
  imports: [IconComponent],
  templateUrl: './track-row.html',
  styleUrl: './track-row.css',
})
export class TrackRowComponent {
  private readonly meta = inject(TrackMetaService);

  readonly track = input.required<Track>();

  /** Vrai si cette piste est celle du lecteur. */
  readonly isCurrent = input(false);

  /** Vrai si le lecteur joue effectivement cette piste (et n'est pas en pause). */
  readonly isPlaying = input(false);

  /** Vrai pendant le téléchargement du flux audio de cette piste. */
  readonly isLoading = input(false);

  /** Vrai pendant la requête DELETE de cette piste. */
  readonly isDeleting = input(false);

  /** Vrai si une suppression est en cours, quelle que soit la piste. */
  readonly deleteLocked = input(false);

  readonly play = output<Track>();
  readonly enqueue = output<Track>();
  readonly remove = output<Track>();
  readonly download = output<Track>();

  /** Clic sur une étiquette : la page s'en sert pour filtrer la bibliothèque. */
  readonly tagSelected = output<string>();

  /** Demande de confirmation de suppression, propre à cette ligne. */
  readonly confirming = signal(false);

  /** Affichage du champ d'ajout d'étiquette. */
  readonly tagging = signal(false);

  readonly formatSize = formatSize;
  readonly formatAudioType = formatAudioType;
  readonly formatDate = formatDate;
  readonly formatRelativeDate = formatRelativeDate;

  /**
   * Métadonnées locales de cette piste, recalculées à chaque changement.
   *
   * Le type est annoté explicitement : l'accès par index renvoie `TrackMeta`
   * pour TypeScript alors qu'il vaut `undefined` à l'exécution pour une piste
   * jamais annotée. Sans cette annotation, le compilateur croirait la valeur
   * toujours présente et signalerait les `?.` du template comme inutiles.
   */
  readonly localMeta = computed<TrackMeta | null>(
    () => this.meta.all()[this.track().id] ?? null,
  );

  readonly favorite = computed(() => this.localMeta()?.favorite ?? false);
  readonly plays = computed(() => this.localMeta()?.plays ?? 0);
  readonly tags = computed(() => this.localMeta()?.tags ?? []);

  toggleFavorite(): void {
    this.meta.toggleFavorite(this.track().id);
  }

  /** Premier clic : la ligne bascule en demande de confirmation. */
  askDelete(): void {
    this.confirming.set(true);
  }

  cancelDelete(): void {
    this.confirming.set(false);
  }

  /** Second clic : la suppression part réellement vers l'API, via la page. */
  confirmDelete(): void {
    this.remove.emit(this.track());
  }

  addTag(input: HTMLInputElement): void {
    const value = input.value.trim();
    if (!value) {
      this.tagging.set(false);
      return;
    }

    this.meta.addTag(this.track().id, value);
    input.value = '';
    // Le champ reste ouvert : on pose souvent deux ou trois étiquettes d'affilée.
  }

  removeTag(tag: string): void {
    this.meta.removeTag(this.track().id, tag);
  }
}
