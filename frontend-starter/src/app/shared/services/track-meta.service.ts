import { Injectable, signal } from '@angular/core';
import { EMPTY_TRACK_META, TrackMeta } from '../models/playback.model';

const STORAGE_KEY = 'gpc_track_meta';

/** Longueur maximale d'une étiquette, pour éviter les libellés illisibles. */
const MAX_TAG_LENGTH = 24;

/**
 * Favoris, compteur d'écoutes et étiquettes — côté navigateur.
 *
 * Pourquoi en local et pas sur le serveur : le contrat HTTP du TP
 * (`API_CONTRACT.md`) ne prévoit aucune route pour ces informations, et
 * `backend/` ne doit pas être modifié. Ces métadonnées sont donc rangées dans
 * `localStorage`, ce qui a deux conséquences assumées et documentées dans
 * l'interface : elles ne suivent pas l'utilisateur d'un appareil à l'autre, et
 * vider les données du navigateur les efface.
 *
 * Une seule entrée de stockage suffit, indexée par identifiant de piste : le
 * backend ne renvoie à chacun que ses propres pistes, donc deux comptes
 * utilisés depuis le même navigateur ne peuvent pas voir les entrées de
 * l'autre, faute de connaître leurs identifiants.
 */
@Injectable({ providedIn: 'root' })
export class TrackMetaService {
  /** Table complète : un Signal unique, pour que les vues se recalculent. */
  private readonly entries = signal<Record<string, TrackMeta>>(readEntries());

  /** Lecture seule, consommée par les `computed()` des composants. */
  readonly all = this.entries.asReadonly();

  /** Métadonnées d'une piste, valeurs par défaut si elle est inconnue. */
  meta(trackId: string): TrackMeta {
    return this.entries()[trackId] ?? EMPTY_TRACK_META;
  }

  isFavorite(trackId: string): boolean {
    return this.meta(trackId).favorite;
  }

  /** Bascule le favori et renvoie le nouvel état, pour le message affiché. */
  toggleFavorite(trackId: string): boolean {
    const next = !this.meta(trackId).favorite;
    this.patch(trackId, { favorite: next });
    return next;
  }

  /** Incrémente le compteur d'écoutes et horodate la dernière lecture. */
  registerPlay(trackId: string): void {
    const current = this.meta(trackId);
    this.patch(trackId, {
      plays: current.plays + 1,
      lastPlayedAt: new Date().toISOString(),
    });
  }

  /** Ajoute une étiquette normalisée (sans doublon, sans casse variable). */
  addTag(trackId: string, rawTag: string): void {
    const tag = rawTag.trim().toLocaleLowerCase('fr-FR').slice(0, MAX_TAG_LENGTH);
    if (!tag) return;

    const tags = this.meta(trackId).tags;
    if (tags.includes(tag)) return;

    this.patch(trackId, { tags: [...tags, tag] });
  }

  removeTag(trackId: string, tag: string): void {
    const tags = this.meta(trackId).tags.filter((entry) => entry !== tag);
    this.patch(trackId, { tags });
  }

  /** Toutes les étiquettes connues, triées, pour alimenter les filtres. */
  knownTags(): string[] {
    const unique = new Set<string>();
    for (const meta of Object.values(this.entries())) {
      for (const tag of meta.tags) unique.add(tag);
    }
    return [...unique].sort((a, b) => a.localeCompare(b, 'fr-FR'));
  }

  /** Oublie une piste supprimée, pour ne pas accumuler des entrées mortes. */
  forget(trackId: string): void {
    const current = this.entries();
    if (!(trackId in current)) return;

    const next = { ...current };
    delete next[trackId];
    this.entries.set(next);
    this.persist(next);
  }

  /**
   * Efface toutes les métadonnées locales. Proposé dans le profil : ces
   * données vivent dans le navigateur, l'utilisateur doit donc pouvoir les
   * reprendre en main sans vider lui-même le stockage du site.
   */
  clearAll(): void {
    this.entries.set({});
    this.persist({});
    console.debug('[TrackMetaService] Métadonnées locales effacées');
  }

  /** Nombre de pistes ayant au moins une information locale enregistrée. */
  size(): number {
    return Object.keys(this.entries()).length;
  }

  /** Applique une modification partielle et persiste la table entière. */
  private patch(trackId: string, change: Partial<TrackMeta>): void {
    const next = {
      ...this.entries(),
      [trackId]: { ...this.meta(trackId), ...change },
    };

    this.entries.set(next);
    this.persist(next);
  }

  private persist(entries: Record<string, TrackMeta>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      // Quota dépassé ou stockage refusé : l'application continue avec les
      // valeurs en mémoire, seule la persistance est perdue.
      console.warn('[TrackMetaService] Métadonnées non persistées', error);
    }
  }
}

/**
 * Relit le stockage en se méfiant de son contenu : il peut avoir été écrit
 * par une version antérieure, ou modifié à la main dans les outils du
 * navigateur. Chaque champ est donc vérifié plutôt que supposé.
 */
function readEntries(): Record<string, TrackMeta> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: Record<string, TrackMeta> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const entry = value as Partial<TrackMeta> | null;
      if (!entry || typeof entry !== 'object') continue;

      result[key] = {
        favorite: entry.favorite === true,
        plays: typeof entry.plays === 'number' && entry.plays >= 0 ? Math.floor(entry.plays) : 0,
        lastPlayedAt: typeof entry.lastPlayedAt === 'string' ? entry.lastPlayedAt : null,
        tags: Array.isArray(entry.tags)
          ? entry.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
      };
    }

    return result;
  } catch (error) {
    console.warn('[TrackMetaService] Stockage local illisible, repart à vide', error);
    return {};
  }
}
