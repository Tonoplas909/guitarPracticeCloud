import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Track } from '../models/track.model';
import { RepeatMode, VisualizerMode } from '../models/playback.model';
import { TrackService } from './track.service';
import { AudioEngineService } from './audio-engine.service';
import { TrackMetaService } from './track-meta.service';

/** Vitesses proposées, utiles pour déchiffrer un passage rapide. */
export const PLAYBACK_RATES = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5] as const;

/** Pas de déplacement du saut avant/arrière, en secondes. */
const SEEK_STEP = 5;

/**
 * Le lecteur de l'application : un service, et non un composant.
 *
 * C'est le choix d'architecture central de cette version. Avant, l'élément
 * `<audio>` et tout son état vivaient dans la page de bibliothèque : changer
 * d'onglet détruisait le composant, donc coupait la musique. En déplaçant
 * l'état ici (`providedIn: 'root'`), la lecture survit à la navigation, et
 * trois vues différentes — la barre de lecture, la scène plein écran et les
 * lignes de la bibliothèque — lisent exactement le même état.
 *
 * L'élément `<audio>` reste le moteur réel du son : il est enregistré une
 * fois par la barre de lecture (`registerElement`), et ce service ne fait que
 * le piloter puis refléter ses événements dans des Signals.
 */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly tracks = inject(TrackService);
  private readonly engine = inject(AudioEngineService);
  private readonly meta = inject(TrackMetaService);

  // ---------------------------------------------------------------- file
  /** File de lecture : les pistes dans l'ordre où elles seront jouées. */
  readonly queue = signal<Track[]>([]);

  /** Position dans la file, -1 quand rien n'est chargé. */
  readonly index = signal(-1);

  /** Piste courante, dérivée de la file et de la position. */
  readonly current = computed<Track | null>(() => this.queue()[this.index()] ?? null);

  // ------------------------------------------------------------ lecture
  readonly audioUrl = signal('');
  readonly isPlaying = signal(false);
  readonly currentTime = signal(0);
  readonly duration = signal(0);
  readonly volume = signal(0.9);
  readonly muted = signal(false);
  readonly rate = signal(1);

  readonly repeat = signal<RepeatMode>('off');
  readonly shuffle = signal(false);

  /** Identifiant de la piste en cours de téléchargement, pour le spinner. */
  readonly loadingId = signal<string | null>(null);
  readonly error = signal('');

  // ------------------------------------------------- forme d'onde (pics)
  /** Amplitudes normalisées de la piste courante, ou `null` si non analysée. */
  readonly peaks = signal<Float32Array | null>(null);
  readonly analysing = signal(false);

  // --------------------------------------------------------- présentation
  /**
   * Rendu du visualiseur et ouverture de la scène plein écran.
   *
   * Ces deux états sont ici, et non dans un composant, parce qu'ils sont
   * partagés : la barre de lecture et la scène montrent le même visualiseur,
   * et la scène peut être ouverte depuis la barre comme depuis le clavier.
   */
  readonly visualizerMode = signal<VisualizerMode>('bars');
  readonly stageOpen = signal(false);

  // ------------------------------------------------------- boucle A → B
  readonly loopStart = signal<number | null>(null);
  readonly loopEnd = signal<number | null>(null);
  readonly hasLoop = computed(() => this.loopStart() !== null && this.loopEnd() !== null);

  /** Progression 0 → 1, utilisée par la forme d'onde et la scène. */
  readonly progress = computed(() => {
    const total = this.duration();
    return total > 0 ? Math.min(1, this.currentTime() / total) : 0;
  });

  readonly canGoNext = computed(() => this.queue().length > 1 || this.repeat() !== 'off');
  readonly canGoPrevious = computed(() => this.queue().length > 1);

  private element: HTMLAudioElement | null = null;

  /** Blob de la piste courante, conservé pour le téléchargement hors-ligne. */
  private currentBlob: Blob | null = null;

  /**
   * Identifiant de la piste réellement branchée sur l'élément audio.
   *
   * Il ne peut pas être déduit de `current()` : au moment où l'on décide s'il
   * faut télécharger, `index` a déjà été déplacé sur la nouvelle piste. Sans
   * ce champ, demander une autre piste de la même file relancerait la piste
   * précédente au lieu de charger la bonne.
   */
  private loadedTrackId: string | null = null;

  /** Ordre tiré au sort, reconstruit à chaque activation de l'aléatoire. */
  private shuffledOrder: number[] = [];

  /** Vrai quand le chargement vient d'un geste utilisateur : on peut jouer. */
  private autoplayWanted = false;

  /**
   * Enregistre l'unique élément `<audio>` de l'application et le branche sur
   * le graphe Web Audio. Appelé par la barre de lecture au premier rendu.
   */
  registerElement(element: HTMLAudioElement): void {
    this.element = element;
    element.volume = this.effectiveVolume();
    element.playbackRate = this.rate();
    // `preservesPitch` évite l'effet « voix de dessin animé » quand on ralentit :
    // indispensable si la vitesse sert à déchiffrer un passage à l'oreille.
    element.preservesPitch = true;
    this.engine.attach(element);
  }

  // =====================================================================
  // Commandes
  // =====================================================================

  /**
   * Joue une piste. `context` est la liste affichée au moment du clic : elle
   * devient la file de lecture, pour que « suivant » enchaîne sur ce que
   * l'utilisateur voit à l'écran et non sur un ordre caché.
   */
  play(track: Track, context: Track[] = [track]): void {
    const queue = context.some((item) => item.id === track.id) ? context : [track];
    const index = queue.findIndex((item) => item.id === track.id);

    this.queue.set([...queue]);
    this.index.set(index);
    this.rebuildShuffle();

    // Rejouer la piste déjà branchée ne doit pas la retélécharger.
    if (this.loadedTrackId === track.id && this.audioUrl() && this.element) {
      this.restart();
      return;
    }

    this.loadCurrent();
  }

  /** Ajoute une piste à la fin de la file sans interrompre la lecture. */
  enqueue(track: Track): void {
    if (this.queue().some((item) => item.id === track.id)) return;

    this.queue.update((queue) => [...queue, track]);
    this.rebuildShuffle();

    // File vide auparavant : la piste ajoutée devient la piste courante.
    if (this.index() === -1) {
      this.index.set(0);
      this.loadCurrent();
    }
  }

  /** Retire une entrée de la file, en gardant la piste courante jouable. */
  removeFromQueue(trackId: string): void {
    const queue = this.queue();
    const position = queue.findIndex((item) => item.id === trackId);
    if (position === -1) return;

    const wasCurrent = position === this.index();
    const next = queue.filter((item) => item.id !== trackId);
    this.queue.set(next);
    this.rebuildShuffle();

    if (next.length === 0) {
      this.stop();
      return;
    }

    if (wasCurrent) {
      this.index.set(Math.min(position, next.length - 1));
      this.loadCurrent();
      return;
    }

    // Retirer une piste située avant la courante décale sa position.
    if (position < this.index()) this.index.update((value) => value - 1);
  }

  /** Lecture / pause sur l'élément audio. */
  toggle(): void {
    const element = this.element;
    if (!element || !this.current()) return;

    if (element.paused) {
      this.engine.resume();
      this.requestPlay(element);
    } else {
      element.pause();
    }
  }

  /** Piste suivante, en tenant compte de l'aléatoire et de la répétition. */
  next(manual = false): void {
    const queue = this.queue();
    if (queue.length === 0) return;

    // « Répéter la piste » ne s'applique qu'à la fin naturelle d'un morceau :
    // un clic explicite sur « suivant » doit vraiment changer de piste.
    if (this.repeat() === 'one' && !manual) {
      this.restart();
      return;
    }

    const position = this.nextPosition();
    if (position === null) {
      this.isPlaying.set(false);
      return;
    }

    this.index.set(position);
    this.loadCurrent();
  }

  /**
   * Piste précédente. Comme sur les lecteurs du marché, un premier appui
   * revient au début du morceau si on l'a déjà bien entamé.
   */
  previous(): void {
    if (this.currentTime() > 3) {
      this.seek(0);
      return;
    }

    const queue = this.queue();
    if (queue.length === 0) return;

    const position = this.shuffle()
      ? this.stepShuffle(-1)
      : (this.index() - 1 + queue.length) % queue.length;

    if (position === null) return;

    this.index.set(position);
    this.loadCurrent();
  }

  /** Déplacement absolu dans le morceau. */
  seek(seconds: number): void {
    const element = this.element;
    const total = this.duration();
    if (!element || !Number.isFinite(seconds)) return;

    const clamped = Math.max(0, total > 0 ? Math.min(seconds, total) : seconds);
    element.currentTime = clamped;
    this.currentTime.set(clamped);
  }

  /** Déplacement relatif, utilisé par les flèches du clavier. */
  seekBy(delta: number = SEEK_STEP): void {
    this.seek(this.currentTime() + delta);
  }

  /** Déplacement depuis une position relative 0 → 1 (forme d'onde). */
  seekToRatio(ratio: number): void {
    const total = this.duration();
    if (total > 0) this.seek(ratio * total);
  }

  setVolume(level: number): void {
    const clamped = Math.max(0, Math.min(1, level));
    this.volume.set(clamped);
    // Régler le volume sort du silence : c'est le geste d'un utilisateur qui
    // veut entendre quelque chose.
    if (clamped > 0) this.muted.set(false);
    this.applyVolume();
  }

  toggleMute(): void {
    this.muted.update((value) => !value);
    this.applyVolume();
  }

  setRate(rate: number): void {
    this.rate.set(rate);
    const element = this.element;
    if (element) element.playbackRate = rate;
  }

  cycleRepeat(): void {
    const order: RepeatMode[] = ['off', 'all', 'one'];
    this.repeat.set(order[(order.indexOf(this.repeat()) + 1) % order.length]);
  }

  toggleShuffle(): void {
    this.shuffle.update((value) => !value);
    this.rebuildShuffle();
  }

  // ------------------------------------------------------- boucle A → B
  /** Pose le point A à la position courante. */
  markLoopStart(): void {
    const start = this.currentTime();
    this.loopStart.set(start);

    // Un point B antérieur au nouveau A n'a plus de sens.
    const end = this.loopEnd();
    if (end !== null && end <= start) this.loopEnd.set(null);
  }

  /** Pose le point B à la position courante. */
  markLoopEnd(): void {
    const end = this.currentTime();
    const start = this.loopStart();

    // Une boucle d'une durée nulle bloquerait la lecture : on exige un
    // demi-seconde d'écart au minimum.
    if (start === null || end - start < 0.5) {
      console.debug('[Player] Point B refusé : boucle trop courte ou point A absent');
      return;
    }

    this.loopEnd.set(end);
  }

  clearLoop(): void {
    this.loopStart.set(null);
    this.loopEnd.set(null);
  }

  /** Ouvre ou ferme la scène plein écran (sans effet si rien ne joue). */
  toggleStage(): void {
    if (!this.current()) return;
    this.stageOpen.update((open) => !open);
  }

  closeStage(): void {
    this.stageOpen.set(false);
  }

  // =====================================================================
  // Événements de l'élément <audio>
  // =====================================================================

  /**
   * La durée n'est connue qu'une fois les métadonnées lues. C'est aussi le
   * moment où démarrer la lecture : le clic qui a déclenché le chargement
   * compte comme geste utilisateur, les navigateurs l'autorisent donc.
   */
  onLoadedMetadata(): void {
    const element = this.element;
    if (!element) return;

    // Un Blob de durée inconnue renvoie Infinity ou NaN : on garde 0 et on
    // attendra la durée exacte du décodage de la forme d'onde.
    this.duration.set(Number.isFinite(element.duration) ? element.duration : 0);
    element.volume = this.effectiveVolume();
    element.playbackRate = this.rate();

    if (this.autoplayWanted) {
      this.autoplayWanted = false;
      this.engine.resume();
      this.requestPlay(element);
    }
  }

  onTimeUpdate(): void {
    const element = this.element;
    if (!element) return;

    const time = element.currentTime;
    this.currentTime.set(time);

    // Boucle A → B : c'est ici qu'elle est refermée. `timeupdate` n'est émis
    // que quatre fois par seconde environ, le retour est donc approximatif à
    // quelques dizaines de millisecondes près — suffisant pour travailler un
    // passage, et sans la charge d'une boucle d'animation dédiée.
    const start = this.loopStart();
    const end = this.loopEnd();
    if (start !== null && end !== null && time >= end) {
      element.currentTime = start;
      this.currentTime.set(start);
    }
  }

  onEnded(): void {
    this.isPlaying.set(false);
    this.currentTime.set(0);

    // Fin naturelle : c'est le seul cas où « répéter la piste » s'applique.
    if (this.repeat() === 'one') {
      this.restart();
      return;
    }

    this.next();
  }

  onAudioError(): void {
    console.error('[Player] Le navigateur a rejeté le flux audio');
    this.isPlaying.set(false);
    this.error.set('Le navigateur ne parvient pas à lire ce fichier audio.');
  }

  // =====================================================================
  // Divers
  // =====================================================================

  /**
   * Oublie une piste supprimée : elle sort de la file, et si elle était en
   * cours de lecture, le lecteur revient à son état vide.
   */
  forget(trackId: string): void {
    if (this.current()?.id === trackId) {
      const queue = this.queue().filter((item) => item.id !== trackId);
      if (queue.length === 0) {
        this.stop();
        this.queue.set([]);
        return;
      }
    }

    this.removeFromQueue(trackId);
  }

  /**
   * Enregistre la piste courante sur le disque de l'utilisateur. Aucune
   * requête : le Blob est déjà en mémoire depuis la lecture.
   */
  downloadCurrent(): void {
    const track = this.current();
    const url = this.audioUrl();
    if (!track || !url) return;

    // L'ancre est créée en TypeScript plutôt que posée dans le template :
    // un `href` en `blob:` lié dans une vue traverserait le désinfecteur
    // d'URL d'Angular, qui n'a aucune raison de connaître cette URL éphémère.
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = track.originalName || `${track.title}.mp3`;
    anchor.click();
    console.debug('[Player] Téléchargement local déclenché', track.id);
  }

  /** Vide complètement le lecteur. */
  stop(): void {
    this.element?.pause();
    this.releaseUrl();
    this.audioUrl.set('');
    this.currentBlob = null;
    this.loadedTrackId = null;
    this.index.set(-1);
    this.isPlaying.set(false);
    this.currentTime.set(0);
    this.duration.set(0);
    this.peaks.set(null);
    this.clearLoop();
    // Une scène plein écran sans piste n'aurait rien à montrer.
    this.stageOpen.set(false);
  }

  clearQueue(): void {
    this.stop();
    this.queue.set([]);
  }

  // =====================================================================
  // Interne
  // =====================================================================

  /**
   * Télécharge la piste courante de façon authentifiée, puis la branche sur
   * l'élément audio.
   *
   * Le flux audio est protégé par le JWT : on ne peut donc pas poser l'URL de
   * l'API directement dans `src`, car le navigateur enverrait cette requête
   * sans passer par `HttpClient` ni par l'intercepteur. On télécharge donc le
   * Blob, puis on en publie une URL locale.
   */
  private loadCurrent(): void {
    const track = this.current();
    if (!track) return;

    this.error.set('');
    this.loadingId.set(track.id);
    this.autoplayWanted = true;
    this.clearLoop();
    this.peaks.set(null);

    this.tracks.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[Player] Audio téléchargé', track.id, blob.size);
        this.loadingId.set(null);

        // L'URL précédente est révoquée avant d'en publier une nouvelle :
        // sans cela, chaque écoute laisserait un Blob complet en mémoire
        // jusqu'au rechargement de la page.
        this.releaseUrl();
        this.currentBlob = blob;
        this.loadedTrackId = track.id;
        this.audioUrl.set(URL.createObjectURL(blob));
        this.currentTime.set(0);
        this.duration.set(0);
        this.meta.registerPlay(track.id);
        this.analysePeaks(blob, track.id);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[Player] Lecture impossible', error);
        this.loadingId.set(null);
        this.autoplayWanted = false;
        this.error.set(
          error.status === 404
            ? "Cette piste n'existe plus ou ne vous appartient pas."
            : 'Lecture impossible pour le moment.',
        );
      },
    });
  }

  /**
   * Calcule la forme d'onde en tâche de fond. L'identifiant est revérifié à
   * l'arrivée : l'analyse dure quelques centaines de millisecondes, et
   * l'utilisateur peut avoir changé de piste entre-temps.
   */
  private analysePeaks(blob: Blob, trackId: string): void {
    this.analysing.set(true);

    void this.engine.computePeaks(blob).then((result) => {
      this.analysing.set(false);
      if (!result || this.current()?.id !== trackId) return;

      this.peaks.set(result.peaks);
      // Le décodage donne la durée exacte, y compris pour les flux dont
      // l'élément <audio> annonce une durée infinie.
      if (this.duration() === 0 && result.duration > 0) this.duration.set(result.duration);
    });
  }

  /** Remet la piste courante à zéro et la relance. */
  private restart(): void {
    const element = this.element;
    if (!element) return;

    element.currentTime = this.loopStart() ?? 0;
    this.currentTime.set(element.currentTime);
    this.engine.resume();
    this.requestPlay(element);
  }

  /**
   * `play()` renvoie une Promise qui peut être rejetée (politique de lecture
   * automatique, flux illisible). Ne pas la traiter laisserait une erreur non
   * capturée dans la console.
   *
   * Le retour est vérifié avant d'être enchaîné : les implémentations
   * anciennes — et celles des environnements de test — renvoient `undefined`.
   */
  private requestPlay(element: HTMLAudioElement): void {
    try {
      const started = element.play() as Promise<void> | undefined;
      void started?.catch((error: unknown) => {
        console.debug('[Player] Lecture refusée par le navigateur', error);
        this.isPlaying.set(false);
      });
    } catch (error) {
      // jsdom, et certains navigateurs sans codec, lèvent de façon synchrone.
      console.debug('[Player] play() a échoué de façon synchrone', error);
      this.isPlaying.set(false);
    }
  }

  private applyVolume(): void {
    const element = this.element;
    if (element) element.volume = this.effectiveVolume();
  }

  private effectiveVolume(): number {
    return this.muted() ? 0 : this.volume();
  }

  private releaseUrl(): void {
    const previous = this.audioUrl();
    if (!previous) return;

    URL.revokeObjectURL(previous);
    console.debug('[Player] ObjectURL révoquée');
  }

  /**
   * Position suivante dans la file. Renvoie `null` quand la file est finie et
   * qu'aucune répétition n'est demandée.
   */
  private nextPosition(): number | null {
    const queue = this.queue();
    if (this.shuffle()) return this.stepShuffle(1);

    const next = this.index() + 1;
    if (next < queue.length) return next;
    return this.repeat() === 'all' ? 0 : null;
  }

  /**
   * Avance dans l'ordre tiré au sort. Un ordre mémorisé (et non un tirage à
   * chaque fois) garantit que toutes les pistes passent une fois avant qu'une
   * seule ne repasse, et que « précédent » revient bien sur la piste écoutée
   * juste avant.
   */
  private stepShuffle(direction: 1 | -1): number | null {
    const queue = this.queue();
    if (queue.length === 0) return null;
    if (this.shuffledOrder.length !== queue.length) this.rebuildShuffle();

    const position = this.shuffledOrder.indexOf(this.index());
    const target = position + direction;

    if (target < 0) return this.shuffledOrder[this.shuffledOrder.length - 1] ?? null;

    if (target >= this.shuffledOrder.length) {
      if (this.repeat() === 'off') return null;
      // Nouveau tour : on retire au sort pour ne pas rejouer la même suite.
      this.rebuildShuffle();
      return this.shuffledOrder[0] ?? null;
    }

    return this.shuffledOrder[target] ?? null;
  }

  /** Mélange de Fisher-Yates, la piste courante placée en tête. */
  private rebuildShuffle(): void {
    const length = this.queue().length;
    const order = Array.from({ length }, (_, i) => i);

    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    const current = this.index();
    if (current >= 0) {
      const position = order.indexOf(current);
      if (position > 0) [order[0], order[position]] = [order[position], order[0]];
    }

    this.shuffledOrder = order;
  }
}
