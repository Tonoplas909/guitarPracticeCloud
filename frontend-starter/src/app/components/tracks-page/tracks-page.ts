import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Track } from '../../shared/models/track.model';
import { SortKey } from '../../shared/models/playback.model';
import { TrackService } from '../../shared/services/track.service';
import {
  FormatFilter,
  LibraryStore,
  PAGE_SIZE_OPTIONS,
} from '../../shared/services/library.store';
import { PlayerService } from '../../shared/services/player.service';
import { TrackMetaService } from '../../shared/services/track-meta.service';
import { IconComponent } from '../icon/icon';
import { LibraryStatsComponent } from '../library-stats/library-stats';
import { TrackRowComponent } from '../track-row/track-row';
import { UploadPanelComponent } from '../upload-panel/upload-panel';

/** Libellés des tris proposés, dans l'ordre du menu. */
const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Plus récentes',
  oldest: 'Plus anciennes',
  title: 'Titre (A → Z)',
  size: 'Plus lourdes',
  plays: 'Plus écoutées',
};

/** Formats proposés au filtre, dans l'ordre fixe de la palette. */
const FORMAT_FILTERS: readonly FormatFilter[] = ['all', 'MP3', 'WAV', 'OGG', 'M4A'];

/**
 * La bibliothèque : import, recherche, écoute et suppression.
 *
 * La page ne garde que ce qui lui est propre : l'état des requêtes de
 * suppression et de téléchargement. Tout le reste est délégué —
 * `LibraryStore` pour la liste et la pagination, `PlayerService` pour la
 * lecture, `UploadQueueService` pour les envois. C'est ce découpage qui
 * permet à la musique de continuer quand on quitte cette page.
 */
@Component({
  imports: [
    MatPaginatorModule,
    IconComponent,
    LibraryStatsComponent,
    TrackRowComponent,
    UploadPanelComponent,
  ],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
  host: {
    // Raccourci « / » : poser le focus sur la recherche, comme dans la plupart
    // des applications de bibliothèque. Les autres raccourcis sont dans la
    // coquille, parce qu'ils pilotent le lecteur et non cette page.
    '(document:keydown)': 'onDocumentKeyDown($event)',
  },
})
export class TracksPageComponent {
  readonly store = inject(LibraryStore);
  readonly player = inject(PlayerService);
  private readonly service = inject(TrackService);
  private readonly meta = inject(TrackMetaService);
  private readonly snackBar = inject(MatSnackBar);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  readonly sortLabels = SORT_LABELS;
  readonly sortKeys = Object.keys(SORT_LABELS) as SortKey[];
  readonly formatFilters = FORMAT_FILTERS;

  /** Tableau constant : le déclarer ici évite de recréer une collection à
   *  chaque détection de changement. */
  readonly skeletons = [1, 2, 3, 4];

  /** Identifiant de la piste dont la suppression est en cours. */
  readonly deletingId = signal<string | null>(null);

  /** Identifiant de la piste en cours de téléchargement explicite. */
  readonly downloadingId = signal<string | null>(null);

  /** Étiquettes connues, pour alimenter le filtre. */
  readonly tags = computed(() => {
    // Dépendance explicite à la table des métadonnées : sans cette lecture,
    // le `computed` ne serait pas réévalué après l'ajout d'une étiquette.
    this.meta.all();
    return this.meta.knownTags();
  });

  constructor() {
    this.store.refresh();
  }

  // =====================================================================
  // Lecture
  // =====================================================================

  /**
   * Lance la lecture — ou met en pause si c'est déjà la piste courante.
   *
   * La liste VISIBLE est passée comme contexte : la file de lecture est donc
   * exactement ce que l'utilisateur a sous les yeux, filtres et tri compris.
   */
  play(track: Track): void {
    if (this.player.current()?.id === track.id) {
      this.player.toggle();
      return;
    }

    this.player.play(track, this.store.visible());
  }

  enqueue(track: Track): void {
    this.player.enqueue(track);
    this.snackBar.open(`« ${track.title} » ajouté à la file.`, 'Fermer', { duration: 3000 });
  }

  // =====================================================================
  // Téléchargement
  // =====================================================================

  /**
   * Enregistre une piste sur le disque de l'utilisateur.
   *
   * Si c'est la piste en cours, le Blob est déjà en mémoire : aucune requête.
   * Sinon il faut le demander, car le flux est protégé par le JWT — une
   * simple balise `<a href="/api/tracks/.../audio">` partirait sans en-tête
   * `Authorization` et recevrait un 401.
   */
  download(track: Track): void {
    if (this.player.current()?.id === track.id && this.player.audioUrl()) {
      this.player.downloadCurrent();
      return;
    }

    if (this.downloadingId()) return;
    this.downloadingId.set(track.id);

    this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Téléchargement prêt', track.id);
        this.downloadingId.set(null);
        this.saveBlob(blob, track);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Téléchargement impossible', error);
        this.downloadingId.set(null);
        this.snackBar.open('Téléchargement impossible.', 'Fermer', { duration: 4000 });
      },
    });
  }

  // =====================================================================
  // Suppression (TP3 mission 5)
  // =====================================================================

  /**
   * La confirmation a été donnée dans la ligne : la requête part. Le composant
   * n'appelle pas `HttpClient` lui-même, il passe par `TrackService`.
   */
  remove(track: Track): void {
    // Une suppression déjà en cours bloque toute nouvelle soumission.
    if (this.deletingId()) return;

    this.deletingId.set(track.id);

    this.service.remove(track.id).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée', track.id);
        this.deletingId.set(null);
        this.snackBar.open(`« ${track.title} » a été supprimé.`, 'Fermer', { duration: 4000 });
        this.afterDelete(track);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Suppression impossible', error);
        this.deletingId.set(null);

        if (error.status === 404) {
          // La piste a disparu entre son affichage et le clic (autre onglet,
          // autre session), ou elle appartient à quelqu'un d'autre : le
          // backend ne distingue pas les deux cas, pour ne pas révéler son
          // existence. L'écran est périmé dans les deux cas.
          this.snackBar.open("Cette piste n'existe plus ou ne vous appartient pas.", 'Fermer', {
            duration: 5000,
          });
          this.afterDelete(track);
          return;
        }

        this.snackBar.open(
          error.error?.message ?? 'La suppression a échoué. Réessayez.',
          'Fermer',
          { duration: 5000 },
        );
      },
    });
  }

  /** Remet lecteur, métadonnées locales et liste en cohérence. */
  private afterDelete(track: Track): void {
    this.player.forget(track.id);
    // Sans cet oubli, les favoris et compteurs d'une piste supprimée
    // resteraient indéfiniment dans le stockage du navigateur.
    this.meta.forget(track.id);
    this.store.dropLocally(track.id);
    this.store.reloadAfterDelete();
  }

  // =====================================================================
  // Import
  // =====================================================================

  /** Appelé après chaque fichier accepté par le serveur. */
  onUploaded(track: Track): void {
    this.snackBar.open(`« ${track.title} » a été ajouté.`, 'Fermer', { duration: 3000 });
    this.store.afterUpload();
  }

  // =====================================================================
  // Filtres
  // =====================================================================

  onSearchInput(event: Event): void {
    this.store.setSearch((event.target as HTMLInputElement).value);
  }

  onSortChange(event: Event): void {
    this.store.setSort((event.target as HTMLSelectElement).value as SortKey);
  }

  onFormatChange(event: Event): void {
    this.store.setFormat((event.target as HTMLSelectElement).value as FormatFilter);
  }

  onTagChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.setTag(value === '' ? null : value);
  }

  /** Clic sur une étiquette dans une ligne : elle devient le filtre actif. */
  onTagSelected(tag: string): void {
    this.store.setTag(tag);
  }

  /** Le Paginator Material compte à partir de 0, l'API à partir de 1. */
  onPageChange(event: PageEvent): void {
    this.store.changePage(event.pageIndex, event.pageSize);
  }

  // =====================================================================
  // Clavier
  // =====================================================================

  onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    // Ne jamais voler la frappe à un champ : taper « / » dans la recherche
    // doit écrire une barre oblique.
    if (isTypingTarget(event.target)) return;

    event.preventDefault();
    this.searchInput()?.nativeElement.focus();
  }

  // =====================================================================
  // Interne
  // =====================================================================

  /** Déclenche l'enregistrement d'un Blob sous le nom d'origine du fichier. */
  private saveBlob(blob: Blob, track: Track): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = track.originalName || `${track.title}.mp3`;
    anchor.click();
    // L'URL est révoquée dès le clic traité : la garder retiendrait tout le
    // fichier en mémoire jusqu'au rechargement de la page.
    URL.revokeObjectURL(url);
  }
}

/** Vrai si l'événement vient d'un champ de saisie. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
