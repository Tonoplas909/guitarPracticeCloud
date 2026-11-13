import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Track } from '../models/track.model';
import { validateAudioFile } from '../audio-constraints';
import { TrackService } from './track.service';

/**
 * Les quatre états d'un envoi, demandés par la mission 6 du TP3. Un seul
 * champ les porte, ce qui rend impossible une combinaison incohérente
 * (par exemple « en cours » et « réussi » en même temps).
 */
export type UploadState = 'pending' | 'uploading' | 'success' | 'error';

/** Une ligne de la file d'envoi. */
export interface UploadItem {
  /** Identifiant local, uniquement pour le suivi dans la vue (`@for`). */
  readonly localId: string;
  readonly file: File;
  title: string;
  state: UploadState;
  /** Pourcentage transmis, ou `null` si la taille totale est inconnue. */
  progress: number | null;
  message: string;
}

/**
 * File d'envoi : plusieurs fichiers déposés d'un coup, envoyés l'un après
 * l'autre.
 *
 * L'API n'accepte qu'un fichier par requête (`upload.single("audio")` côté
 * Multer). Le traitement par lot est donc entièrement côté client : une
 * requête par fichier, séquentiellement et non en parallèle, pour deux
 * raisons concrètes — la barre de progression d'un seul envoi est lisible
 * alors que six barres simultanées ne le sont pas, et un envoi à la fois
 * évite de saturer le lien montant de l'utilisateur.
 */
@Injectable({ providedIn: 'root' })
export class UploadQueueService {
  private readonly service = inject(TrackService);

  readonly items = signal<UploadItem[]>([]);

  /** Dernière piste acceptée par le serveur, pour le message de succès. */
  readonly lastSuccess = signal<Track | null>(null);

  /** Vrai pendant qu'un envoi est en cours : bloque une seconde soumission. */
  readonly uploading = computed(() => this.items().some((item) => item.state === 'uploading'));

  readonly pendingCount = computed(
    () => this.items().filter((item) => item.state === 'pending').length,
  );

  readonly successCount = computed(
    () => this.items().filter((item) => item.state === 'success').length,
  );

  /** Progression globale du lot, pour la barre de résumé. */
  readonly overallProgress = computed(() => {
    const items = this.items();
    if (items.length === 0) return 0;

    const done = items.reduce((sum, item) => {
      if (item.state === 'success') return sum + 100;
      if (item.state === 'uploading') return sum + (item.progress ?? 0);
      return sum;
    }, 0);

    return Math.round(done / items.length);
  });

  /**
   * Ajoute des fichiers à la file. Les fichiers refusés par la validation
   * locale y entrent aussi, en état `error` : l'utilisateur doit voir
   * lequel de ses six fichiers a été écarté, et pourquoi.
   *
   * Renvoie le nombre de fichiers réellement envoyables.
   */
  add(files: readonly File[]): number {
    const existing = this.items();
    const additions: UploadItem[] = [];

    for (const file of files) {
      // Déposer deux fois le même fichier est une maladresse courante quand on
      // glisse un dossier : on l'ignore silencieusement.
      const duplicate =
        existing.some((item) => sameFile(item.file, file)) ||
        additions.some((item) => sameFile(item.file, file));
      if (duplicate) continue;

      const problem = validateAudioFile(file);
      additions.push({
        localId: createLocalId(),
        file,
        title: stripExtension(file.name),
        state: problem ? 'error' : 'pending',
        progress: null,
        message: problem ?? '',
      });
    }

    if (additions.length > 0) this.items.set([...existing, ...additions]);

    const sendable = additions.filter((item) => item.state === 'pending').length;
    console.debug('[UploadQueue] Fichiers ajoutés', additions.length, 'dont envoyables', sendable);
    return sendable;
  }

  /** Modifie le titre affiché d'un fichier en attente. */
  setTitle(localId: string, title: string): void {
    this.patch(localId, { title });
  }

  /** Retire une ligne de la file (impossible pendant son envoi). */
  remove(localId: string): void {
    const item = this.items().find((entry) => entry.localId === localId);
    if (!item || item.state === 'uploading') return;

    this.items.update((items) => items.filter((entry) => entry.localId !== localId));
  }

  /** Vide les lignes terminées, en gardant ce qui reste à faire. */
  clearFinished(): void {
    this.items.update((items) =>
      items.filter((item) => item.state === 'pending' || item.state === 'uploading'),
    );
  }

  clear(): void {
    if (this.uploading()) return;
    this.items.set([]);
  }

  /**
   * Démarre (ou reprend) le traitement de la file.
   *
   * `onUploaded` est appelé après chaque succès : c'est la page qui décide
   * quoi en faire — ici, rafraîchir la bibliothèque — pour que ce service ne
   * dépende pas de l'affichage.
   */
  start(onUploaded?: (track: Track) => void): void {
    // Double protection : le bouton est déjà désactivé dans le template, mais
    // un double clic rapide ou un appel programmatique ne doit pas passer.
    if (this.uploading()) return;

    const next = this.items().find((item) => item.state === 'pending');
    if (!next) return;

    this.sendOne(next, onUploaded);
  }

  /** Relance un fichier dont l'envoi avait échoué côté serveur. */
  retry(localId: string, onUploaded?: (track: Track) => void): void {
    const item = this.items().find((entry) => entry.localId === localId);
    if (!item || item.state !== 'error') return;

    // Un fichier refusé par la validation locale ne devient pas valide en
    // réessayant : on ne le remet en attente que s'il passe la validation.
    const problem = validateAudioFile(item.file);
    if (problem) {
      this.patch(localId, { message: problem });
      return;
    }

    this.patch(localId, { state: 'pending', progress: null, message: '' });
    this.start(onUploaded);
  }

  /**
   * Envoie un fichier et enchaîne sur le suivant, quel que soit le résultat :
   * un fichier refusé ne doit pas bloquer les cinq autres.
   */
  private sendOne(item: UploadItem, onUploaded?: (track: Track) => void): void {
    this.patch(item.localId, { state: 'uploading', progress: null, message: '' });

    const title = item.title.trim() || item.file.name;

    /*
     * Cet Observable émet PLUSIEURS valeurs (une par événement HTTP),
     * contrairement à un appel classique qui n'en émet qu'une : c'est
     * `observe: 'events'` + `reportProgress: true` dans TrackService. Il faut
     * donc trier les événements par leur `type` au lieu de traiter la valeur
     * reçue comme la réponse du serveur.
     */
    this.service.upload(item.file, title).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          // `total` est absent quand la taille de la requête est inconnue :
          // on affiche alors une barre indéterminée plutôt qu'un faux 0 %.
          this.patch(item.localId, {
            progress: event.total ? Math.round((100 * event.loaded) / event.total) : null,
          });
          return;
        }

        if (event.type === HttpEventType.Response) {
          const track = event.body!;
          console.debug('[UploadQueue] Piste envoyée', track.id);
          this.patch(item.localId, { state: 'success', progress: 100, message: track.title });
          this.lastSuccess.set(track);
          onUploaded?.(track);
          this.start(onUploaded);
        }
      },
      error: (error: HttpErrorResponse) => {
        console.error('[UploadQueue] Envoi impossible', item.file.name, error);
        this.patch(item.localId, {
          state: 'error',
          progress: null,
          // Le message vient du backend quand il en fournit un (« Format
          // audio non accepté », « File too large »…).
          message: error.error?.message ?? "L'envoi a échoué. Réessayez.",
        });
        this.start(onUploaded);
      },
    });
  }

  /** Remplace une ligne par une copie modifiée (les Signals exigent une
   *  nouvelle référence pour notifier leurs lecteurs). */
  private patch(localId: string, change: Partial<UploadItem>): void {
    this.items.update((items) =>
      items.map((item) => (item.localId === localId ? { ...item, ...change } : item)),
    );
  }
}

/** Deux fichiers sont considérés identiques s'ils ont mêmes nom et taille. */
function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size;
}

/** Retire l'extension pour proposer un titre par défaut présentable. */
function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/** Identifiant local. `randomUUID` n'existe pas partout (http non sécurisé). */
function createLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
