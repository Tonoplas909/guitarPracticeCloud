import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Track } from '../models/track.model';
import { SortKey } from '../models/playback.model';
import { formatAudioType } from '../audio-constraints';
import { TrackService } from './track.service';
import { TrackMetaService } from './track-meta.service';

/** Tailles de page proposées : le backend refuse tout `limit` supérieur à 20. */
export const PAGE_SIZE_OPTIONS = [5, 10, 20];

/** Taille utilisée pour aspirer la bibliothèque : le maximum autorisé. */
const BULK_LIMIT = 20;

/**
 * Deux façons de regarder la bibliothèque :
 * - `pages` : une page à la fois, découpée par le serveur. C'est le mode par
 *   défaut, et celui qui correspond au contrat HTTP du TP ;
 * - `all`   : toute la bibliothèque en mémoire, nécessaire dès qu'on veut
 *   chercher ou trier sur l'ENSEMBLE des pistes et non sur la page affichée.
 */
export type LibraryMode = 'pages' | 'all';

/** Filtre de format : les quatre formats acceptés, ou tous. */
export type FormatFilter = 'all' | 'MP3' | 'WAV' | 'OGG' | 'M4A';

/**
 * L'état de la bibliothèque, sorti des composants.
 *
 * Pourquoi un service et non la page : la barre de lecture a besoin de la
 * liste visible (pour « piste suivante »), la page a besoin de la pagination,
 * et le panneau de statistiques a besoin du total. Trois consommateurs, donc
 * une seule source de vérité.
 *
 * Point important sur la recherche : chercher uniquement dans la page
 * affichée donnerait des résultats faux (« rien trouvé » alors que la piste
 * est page 3). Dès qu'un filtre ou une recherche est posé, le store bascule
 * donc en mode `all` et récupère toutes les pages l'une après l'autre. Quand
 * tous les filtres sont retirés, il revient à la pagination serveur.
 */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly service = inject(TrackService);
  private readonly meta = inject(TrackMetaService);

  // ------------------------------------------------- pagination serveur
  readonly mode = signal<LibraryMode>('pages');
  readonly page = signal(1);
  readonly limit = signal(PAGE_SIZE_OPTIONS[0]);
  readonly total = signal(0);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');

  /** Pistes de la page courante, telles que le serveur les a renvoyées. */
  private readonly pageItems = signal<Track[]>([]);

  /** Bibliothèque complète, remplie seulement en mode `all`. */
  private readonly allItems = signal<Track[]>([]);

  // --------------------------------------------------- filtres et tri
  readonly search = signal('');
  readonly sort = signal<SortKey>('recent');
  readonly format = signal<FormatFilter>('all');
  readonly favoritesOnly = signal(false);
  readonly tag = signal<string | null>(null);

  /** Vrai dès qu'un critère restreint l'affichage. */
  readonly filtered = computed(
    () =>
      this.search().trim() !== '' ||
      this.format() !== 'all' ||
      this.favoritesOnly() ||
      this.tag() !== null,
  );

  /** Pistes effectivement chargées, selon le mode courant. */
  readonly loaded = computed(() => (this.mode() === 'all' ? this.allItems() : this.pageItems()));

  /** Pistes affichées : les pistes chargées, filtrées puis triées. */
  readonly visible = computed(() => this.sortTracks(this.filterTracks(this.loaded())));

  /** Nombre de pistes écartées par les filtres, pour l'indiquer à l'écran. */
  readonly hiddenCount = computed(() => this.loaded().length - this.visible().length);

  // ------------------------------------------------------ statistiques
  /** Répartition par format, pour le graphique part-à-tout. */
  readonly formatBreakdown = computed(() => {
    const counts = new Map<string, number>();
    for (const track of this.loaded()) {
      const label = formatAudioType(track.mimeType);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return counts;
  });

  /** Poids cumulé des pistes chargées, en octets. */
  readonly loadedSize = computed(() =>
    this.loaded().reduce((sum, track) => sum + track.size, 0),
  );

  /** Nombre d'écoutes cumulées, d'après les compteurs locaux. */
  readonly totalPlays = computed(() => {
    const all = this.meta.all();
    return this.loaded().reduce((sum, track) => sum + (all[track.id]?.plays ?? 0), 0);
  });

  readonly favoriteCount = computed(() => {
    const all = this.meta.all();
    return this.loaded().filter((track) => all[track.id]?.favorite).length;
  });

  // =====================================================================
  // Chargement
  // =====================================================================

  /** Recharge selon le mode courant. */
  refresh(): void {
    if (this.mode() === 'all') this.loadAll();
    else this.loadPage();
  }

  /**
   * Demande au serveur la page courante. Chaque appel produit une requête
   * `GET /api/tracks?page=...&limit=...` : c'est le serveur qui découpe, pas
   * Angular.
   */
  loadPage(): void {
    this.loading.set(true);
    this.error.set('');

    this.service.list(this.page(), this.limit()).subscribe({
      next: (response) => {
        console.debug('[LibraryStore] Page chargée', response.page, response.items.length);
        this.pageItems.set(response.items);
        // Le backend borne `page` et `limit` : on réaligne l'état local sur ce
        // qu'il a réellement appliqué, sinon l'affichage mentirait.
        this.page.set(response.page);
        this.limit.set(response.limit);
        this.total.set(response.total);
        this.pages.set(response.pages);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[LibraryStore] Chargement impossible', error);
        this.pageItems.set([]);
        this.error.set(error.error?.message ?? 'Impossible de charger la bibliothèque.');
        this.loading.set(false);
      },
    });
  }

  /**
   * Récupère toute la bibliothèque, page après page. Les requêtes sont
   * enchaînées et non parallélisées : le nombre de pages n'est connu qu'après
   * la première réponse.
   */
  loadAll(): void {
    this.mode.set('all');
    this.loading.set(true);
    this.error.set('');

    const collected: Track[] = [];
    const fetchFrom = (page: number): void => {
      this.service.list(page, BULK_LIMIT).subscribe({
        next: (response) => {
          collected.push(...response.items);
          this.total.set(response.total);

          if (response.page < response.pages) {
            fetchFrom(response.page + 1);
            return;
          }

          console.debug('[LibraryStore] Bibliothèque complète chargée', collected.length);
          this.allItems.set(collected);
          this.pages.set(response.pages);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          console.error('[LibraryStore] Chargement complet impossible', error);
          this.error.set(error.error?.message ?? 'Impossible de charger la bibliothèque.');
          this.loading.set(false);
          // Les pages déjà reçues sont conservées : mieux vaut une liste
          // partielle annoncée qu'un écran vide.
          this.allItems.set(collected);
        },
      });
    };

    fetchFrom(1);
  }

  /** Revient à la pagination serveur. */
  usePages(): void {
    this.mode.set('pages');
    this.allItems.set([]);
    this.page.set(1);
    this.loadPage();
  }

  /**
   * Le Paginator Material est indexé à partir de 0 (`pageIndex`) alors que
   * l'API compte à partir de 1 (`page`) : la conversion se fait ici.
   */
  changePage(pageIndex: number, pageSize: number): void {
    this.page.set(pageIndex + 1);
    this.limit.set(pageSize);
    this.loadPage();
  }

  // =====================================================================
  // Filtres
  // =====================================================================

  /**
   * Tout changement de critère passe par ici, pour garantir l'invariant :
   * un critère actif exige la bibliothèque complète, sinon la recherche ne
   * verrait que la page affichée.
   */
  private applyCriteria(change: () => void): void {
    change();

    if (this.filtered()) {
      if (this.mode() !== 'all') this.loadAll();
      return;
    }

    // Plus aucun critère : la pagination serveur reprend la main.
    if (this.mode() === 'all') this.usePages();
  }

  setSearch(term: string): void {
    this.applyCriteria(() => this.search.set(term));
  }

  setFormat(format: FormatFilter): void {
    this.applyCriteria(() => this.format.set(format));
  }

  toggleFavoritesOnly(): void {
    this.applyCriteria(() => this.favoritesOnly.update((value) => !value));
  }

  setTag(tag: string | null): void {
    this.applyCriteria(() => this.tag.set(tag));
  }

  /**
   * Le tri ne restreint rien, mais trier une seule page donnerait un ordre
   * faux à l'échelle de la bibliothèque : tout tri autre que celui du serveur
   * (le plus récent d'abord) demande donc aussi la liste complète.
   */
  setSort(sort: SortKey): void {
    this.sort.set(sort);
    if (sort !== 'recent' && this.mode() !== 'all') this.loadAll();
  }

  resetFilters(): void {
    this.search.set('');
    this.format.set('all');
    this.favoritesOnly.set(false);
    this.tag.set(null);
    this.sort.set('recent');
    this.usePages();
  }

  // =====================================================================
  // Mutations locales
  // =====================================================================

  /**
   * Retire une piste des listes en mémoire. Appelé après un `204` du serveur
   * pour que l'écran soit juste immédiatement, sans attendre le rechargement.
   */
  dropLocally(trackId: string): void {
    this.pageItems.update((items) => items.filter((item) => item.id !== trackId));
    this.allItems.update((items) => items.filter((item) => item.id !== trackId));
    this.total.update((value) => Math.max(0, value - 1));
  }

  /**
   * Remet l'affichage en cohérence après une suppression : si la page devient
   * vide alors qu'il en existe une précédente, on y recule pour ne pas
   * afficher un écran vide trompeur.
   */
  reloadAfterDelete(): void {
    if (this.mode() === 'all') {
      this.loadAll();
      return;
    }

    if (this.pageItems().length === 0 && this.page() > 1) {
      this.page.update((value) => value - 1);
    }

    this.loadPage();
  }

  /** Après un envoi réussi : la nouvelle piste est en première page. */
  afterUpload(): void {
    if (this.mode() === 'all') {
      this.loadAll();
      return;
    }

    this.page.set(1);
    this.loadPage();
  }

  // =====================================================================
  // Interne
  // =====================================================================

  private filterTracks(tracks: Track[]): Track[] {
    const term = this.search().trim().toLocaleLowerCase('fr-FR');
    const format = this.format();
    const favoritesOnly = this.favoritesOnly();
    const tag = this.tag();
    const meta = this.meta.all();

    return tracks.filter((track) => {
      if (format !== 'all' && formatAudioType(track.mimeType) !== format) return false;

      const entry = meta[track.id];
      if (favoritesOnly && !entry?.favorite) return false;
      if (tag && !entry?.tags.includes(tag)) return false;

      if (!term) return true;
      // La recherche porte sur le titre ET le nom de fichier d'origine :
      // l'utilisateur se souvient parfois de l'un, parfois de l'autre.
      const haystack = `${track.title} ${track.originalName}`.toLocaleLowerCase('fr-FR');
      return haystack.includes(term);
    });
  }

  private sortTracks(tracks: Track[]): Track[] {
    const meta = this.meta.all();
    // Copie défensive : `sort()` trie sur place, et trier le tableau d'un
    // Signal reviendrait à le modifier en dehors de son setter.
    const sorted = [...tracks];

    switch (this.sort()) {
      case 'oldest':
        return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      case 'title':
        return sorted.sort((a, b) => a.title.localeCompare(b.title, 'fr-FR'));
      case 'size':
        return sorted.sort((a, b) => b.size - a.size);
      case 'plays':
        return sorted.sort((a, b) => (meta[b.id]?.plays ?? 0) - (meta[a.id]?.plays ?? 0));
      case 'recent':
      default:
        return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }
}
