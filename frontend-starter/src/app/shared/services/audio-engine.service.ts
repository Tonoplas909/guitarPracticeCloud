import { Injectable, signal } from '@angular/core';

/**
 * Trois bandes d'égalisation, choisies pour le travail d'un instrument :
 * - `low`  : basses (plateau sous 160 Hz) — pour sortir la batterie/basse ;
 * - `mid`  : médiums (cloche autour de 1 kHz) — c'est là que vit la guitare,
 *            donc la bande à creuser pour jouer par-dessus ;
 * - `high` : aigus (plateau au-dessus de 5 kHz) — cymbales et attaques.
 */
export type EqBand = 'low' | 'mid' | 'high';

/** Résultat de l'analyse hors-ligne d'un fichier audio. */
export interface DecodedPeaks {
  /** Amplitude normalisée (0 → 1), une valeur par colonne de forme d'onde. */
  peaks: Float32Array;
  /** Durée exacte lue dans le fichier décodé, en secondes. */
  duration: number;
}

/** Taille de la FFT : 1024 bandes de fréquence, bon compromis coût/finesse. */
const FFT_SIZE = 2048;

/**
 * Le graphe Web Audio de l'application : une seule instance pour toute la
 * session, branchée sur l'unique élément `<audio>` de la barre de lecture.
 *
 *   <audio> ──▶ MediaElementSource ──▶ low ──▶ mid ──▶ high ──▶ analyser ──▶ sortie
 *                                     └──── égaliseur 3 bandes ────┘
 *
 * Deux points qui ne se devinent pas :
 *
 * 1. `createMediaElementSource()` ne peut être appelé QU'UNE FOIS par élément
 *    `<audio>`, et à partir de cet appel le son ne sort plus que par le
 *    graphe. C'est pourquoi l'élément est unique, permanent, et jamais
 *    recréé par un `@if` dans un template.
 * 2. Un `AudioContext` démarre « suspendu » tant que l'utilisateur n'a pas
 *    interagi avec la page (politique de lecture automatique des
 *    navigateurs). Il faut donc appeler `resume()` depuis un vrai geste.
 *
 * Le service est entièrement défensif : dans un environnement sans Web Audio
 * (jsdom des tests, navigateur très ancien), `available` reste `false`, les
 * lectures renvoient des tableaux vides et la lecture audio continue de
 * fonctionner normalement — seul le visualiseur disparaît.
 */
@Injectable({ providedIn: 'root' })
export class AudioEngineService {
  /** Vrai si le navigateur fournit l'API Web Audio ET que le graphe est monté. */
  readonly available = signal(false);

  /** Gains de l'égaliseur en décibels, de -12 à +12. */
  readonly eq = signal<Record<EqBand, number>>({ low: 0, mid: 0, high: 0 });

  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private filters: Record<EqBand, BiquadFilterNode> | null = null;

  /** L'élément déjà branché : rebrancher le même ferait lever une exception. */
  private attachedElement: HTMLAudioElement | null = null;

  /** Tampons réutilisés à chaque image : en allouer un par frame ferait
   *  travailler le ramasse-miettes 60 fois par seconde. */
  private frequencyBuffer = new Uint8Array(0);
  private waveformBuffer = new Uint8Array(0);

  /**
   * Branche l'élément audio sur le graphe. Appeler plusieurs fois avec le
   * même élément est sans effet, ce qui permet d'appeler la méthode depuis un
   * `effect()` sans précaution particulière.
   */
  attach(element: HTMLAudioElement): void {
    if (this.attachedElement === element) return;

    // Un autre élément était branché (déconnexion puis reconnexion, qui
    // détruit et recrée la barre de lecture) : son contexte doit être fermé,
    // sinon les contextes s'accumulent — les navigateurs en limitent le
    // nombre à six environ, après quoi plus aucun son ne sort.
    if (this.attachedElement) this.teardown();

    const AudioContextClass = resolveAudioContext();
    if (!AudioContextClass) {
      console.info("[AudioEngine] Web Audio indisponible : pas de visualiseur ni d'égaliseur");
      return;
    }

    try {
      const context = new AudioContextClass();
      const source = context.createMediaElementSource(element);

      const low = context.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 160;

      const mid = context.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1000;
      mid.Q.value = 0.9;

      const high = context.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 5000;

      const analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      // Lissage temporel : sans lui, les barres du spectre tremblent trop
      // pour être lues ; au-delà de ~0.85 elles deviennent molles.
      analyser.smoothingTimeConstant = 0.78;

      source.connect(low);
      low.connect(mid);
      mid.connect(high);
      high.connect(analyser);
      // L'analyseur est branché sur la sortie : sans ce dernier maillon, le
      // graphe serait complet mais muet.
      analyser.connect(context.destination);

      this.context = context;
      this.analyser = analyser;
      this.source = source;
      this.filters = { low, mid, high };
      this.attachedElement = element;
      this.frequencyBuffer = new Uint8Array(analyser.frequencyBinCount);
      this.waveformBuffer = new Uint8Array(analyser.fftSize);
      this.applyEq();
      this.available.set(true);

      console.debug('[AudioEngine] Graphe audio monté', {
        bandes: analyser.frequencyBinCount,
        etat: context.state,
      });
    } catch (error) {
      // Un échec ici doit rester sans conséquence sur la lecture : on laisse
      // l'élément <audio> jouer seul, sans graphe.
      console.error('[AudioEngine] Montage du graphe impossible', error);
      this.teardown();
    }
  }

  /**
   * Relance le contexte, qui démarre suspendu. À appeler depuis un geste
   * utilisateur (clic sur ▶), sinon le navigateur refuse.
   */
  resume(): void {
    const context = this.context;
    if (!context || context.state !== 'suspended') return;

    void context.resume().catch((error: unknown) => {
      console.debug('[AudioEngine] Reprise du contexte refusée', error);
    });
  }

  /** Nombre de bandes de fréquence disponibles (0 si pas de graphe). */
  get bandCount(): number {
    return this.analyser?.frequencyBinCount ?? 0;
  }

  /**
   * Spectre instantané, valeurs 0→255 par bande de fréquence.
   * Le tampon renvoyé est réutilisé d'une image à l'autre : le consommateur
   * doit le lire tout de suite, pas le conserver.
   */
  readFrequencies(): Uint8Array {
    if (!this.analyser) return this.frequencyBuffer;
    this.analyser.getByteFrequencyData(this.frequencyBuffer);
    return this.frequencyBuffer;
  }

  /** Forme d'onde instantanée, valeurs 0→255 centrées sur 128 (silence). */
  readWaveform(): Uint8Array {
    if (!this.analyser) return this.waveformBuffer;
    this.analyser.getByteTimeDomainData(this.waveformBuffer);
    return this.waveformBuffer;
  }

  /** Règle une bande de l'égaliseur, en décibels (borné à ±12). */
  setEq(band: EqBand, decibels: number): void {
    const clamped = Math.max(-12, Math.min(12, decibels));
    this.eq.update((current) => ({ ...current, [band]: clamped }));
    this.applyEq();
  }

  /** Remet l'égaliseur à plat. */
  resetEq(): void {
    this.eq.set({ low: 0, mid: 0, high: 0 });
    this.applyEq();
  }

  /**
   * Décode le fichier déjà téléchargé pour en extraire une forme d'onde.
   *
   * Aucune requête supplémentaire n'est faite : le Blob vient du
   * `GET /api/tracks/:id/audio` que la lecture a déjà effectué. On n'analyse
   * donc pas « en plus », on réutilise ce qui est en mémoire.
   *
   * Renvoie `null` si Web Audio est absent ou si le fichier est illisible —
   * la barre de progression retombe alors sur un simple rail.
   */
  async computePeaks(blob: Blob, buckets = 480): Promise<DecodedPeaks | null> {
    const context = this.context ?? createDetachedContext();
    if (!context) return null;

    try {
      const raw = await blob.arrayBuffer();
      // `decodeAudioData` neutralise l'ArrayBuffer qu'on lui passe : on lui
      // donne une copie, sinon le Blob d'origine deviendrait inutilisable.
      const decoded = await context.decodeAudioData(raw.slice(0));
      return { peaks: reduceToPeaks(decoded, buckets), duration: decoded.duration };
    } catch (error) {
      console.warn("[AudioEngine] Analyse de la forme d'onde impossible", error);
      return null;
    }
  }

  /** Reporte les gains courants sur les filtres du graphe. */
  private applyEq(): void {
    const filters = this.filters;
    if (!filters) return;

    const values = this.eq();
    filters.low.gain.value = values.low;
    filters.mid.gain.value = values.mid;
    filters.high.gain.value = values.high;
  }

  /** Libère les références après un échec de montage. */
  private teardown(): void {
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.analyser = null;
    this.source = null;
    this.filters = null;
    this.attachedElement = null;
    this.available.set(false);
  }
}

/** Constructeur d'`AudioContext`, préfixé sur les anciens Safari. */
function resolveAudioContext(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;

  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  return typeof candidate === 'function' ? candidate : null;
}

/**
 * Contexte créé uniquement pour décoder un fichier, quand le graphe de
 * lecture n'est pas monté (visualiseur indisponible mais forme d'onde
 * encore utile).
 */
function createDetachedContext(): AudioContext | null {
  const AudioContextClass = resolveAudioContext();
  if (!AudioContextClass) return null;

  try {
    return new AudioContextClass();
  } catch (error) {
    console.warn('[AudioEngine] Contexte de décodage impossible', error);
    return null;
  }
}

/**
 * Réduit un fichier décodé (des millions d'échantillons) à quelques centaines
 * de valeurs d'amplitude, une par colonne dessinée.
 *
 * On garde le MAXIMUM absolu de chaque tranche, et non la moyenne : la
 * moyenne d'un signal audio centré tend vers zéro et donnerait une forme
 * d'onde plate. Les canaux sont parcourus ensemble pour que le pic d'un seul
 * côté du stéréo reste visible.
 */
function reduceToPeaks(buffer: AudioBuffer, buckets: number): Float32Array {
  const peaks = new Float32Array(buckets);
  const channels = Math.min(buffer.numberOfChannels, 2);
  const samplesPerBucket = Math.max(1, Math.floor(buffer.length / buckets));

  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel);

    for (let bucket = 0; bucket < buckets; bucket += 1) {
      const start = bucket * samplesPerBucket;
      const end = Math.min(start + samplesPerBucket, data.length);
      let max = peaks[bucket];

      // Sous-échantillonnage : au-delà de ~512 échantillons par colonne, en
      // lire un sur deux ne change rien au pic visible et divise le coût.
      const step = samplesPerBucket > 512 ? 2 : 1;
      for (let index = start; index < end; index += step) {
        const value = Math.abs(data[index]);
        if (value > max) max = value;
      }

      peaks[bucket] = max;
    }
  }

  // Normalisation sur le pic global : un enregistrement faible reste lisible,
  // et un fichier déjà saturé n'est pas écrasé contre le bord.
  let loudest = 0;
  for (const value of peaks) if (value > loudest) loudest = value;
  if (loudest > 0) for (let i = 0; i < peaks.length; i += 1) peaks[i] /= loudest;

  return peaks;
}
