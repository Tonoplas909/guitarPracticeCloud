import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Track } from '../models/track.model';
import { PlayerService } from './player.service';
import { TrackMetaService } from './track-meta.service';

function track(id: string): Track {
  return {
    id,
    title: `Piste ${id}`,
    originalName: `${id}.mp3`,
    mimeType: 'audio/mpeg',
    size: 2048,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * Double de l'élément `<audio>`.
 *
 * On ne monte pas de vrai élément : jsdom ne sait pas décoder de son, et
 * `play()` y lève une exception « non implémenté ». Ce double expose
 * exactement la surface que `PlayerService` utilise, ce qui rend les tests
 * déterministes et permet de vérifier ce que le service écrit réellement sur
 * l'élément (volume, vitesse, position).
 */
function fakeAudio(): HTMLAudioElement & { paused: boolean } {
  const element = {
    paused: true,
    volume: 1,
    playbackRate: 1,
    preservesPitch: false,
    currentTime: 0,
    duration: 120,
    play: () => {
      element.paused = false;
    },
    pause: () => {
      element.paused = true;
    },
  };

  return element as unknown as HTMLAudioElement & { paused: boolean };
}

describe('PlayerService', () => {
  let player: PlayerService;
  let meta: TrackMetaService;
  let httpTesting: HttpTestingController;
  let element: HTMLAudioElement & { paused: boolean };

  beforeEach(() => {
    localStorage.clear();

    // jsdom n'implémente pas la publication d'URL de Blob : on la simule, et
    // on vérifie au passage que le service révoque bien ce qu'il publie.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:piste');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    player = TestBed.inject(PlayerService);
    meta = TestBed.inject(TrackMetaService);
    httpTesting = TestBed.inject(HttpTestingController);

    element = fakeAudio();
    player.registerElement(element);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  /** Joue une piste et fournit le Blob attendu par la requête. */
  function playAndFlush(item: Track, context: Track[] = [item]): void {
    player.play(item, context);
    const request = httpTesting.expectOne(`/api/tracks/${item.id}/audio`);

    expect(request.request.responseType).toBe('blob');

    request.flush(new Blob(['octets'], { type: 'audio/mpeg' }));
  }

  it('play() télécharge le flux protégé puis publie une ObjectURL', () => {
    playAndFlush(track('a'));

    expect(player.current()?.id).toBe('a');
    expect(player.audioUrl()).toBe('blob:piste');
    expect(player.loadingId()).toBeNull();
  });

  it('play() constitue la file avec la liste visible passée en contexte', () => {
    const list = [track('a'), track('b'), track('c')];

    playAndFlush(list[1], list);

    expect(player.queue().length).toBe(3);
    expect(player.index()).toBe(1);
    expect(player.canGoNext()).toBe(true);
  });

  it('compte une écoute dans les métadonnées locales', () => {
    playAndFlush(track('a'));

    expect(meta.meta('a').plays).toBe(1);
    expect(meta.meta('a').lastPlayedAt).not.toBeNull();
  });

  it('révoque l’URL précédente avant d’en publier une nouvelle', () => {
    const list = [track('a'), track('b')];
    playAndFlush(list[0], list);

    playAndFlush(list[1], list);

    // Sans cette révocation, chaque écoute laisserait un Blob complet en
    // mémoire jusqu'au rechargement de la page.
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:piste');
  });

  it('affiche un message compréhensible quand la piste a disparu', () => {
    player.play(track('a'));

    httpTesting.expectOne('/api/tracks/a/audio').flush(
      new Blob([JSON.stringify({ message: 'Piste inconnue' })], { type: 'application/json' }),
      { status: 404, statusText: 'Not Found' },
    );

    expect(player.error()).toContain("n'existe plus");
    expect(player.loadingId()).toBeNull();
  });

  it('next() avance dans la file et télécharge la piste suivante', () => {
    const list = [track('a'), track('b')];
    playAndFlush(list[0], list);

    player.next(true);

    httpTesting.expectOne('/api/tracks/b/audio').flush(new Blob(['x']));

    expect(player.current()?.id).toBe('b');
  });

  it('en fin de file sans répétition, next() ne demande rien de plus', () => {
    const list = [track('a'), track('b')];
    playAndFlush(list[0], list);
    player.next(true);
    httpTesting.expectOne('/api/tracks/b/audio').flush(new Blob(['x']));

    player.next(true);

    // Aucune requête : la file est terminée.
    httpTesting.expectNone((r) => r.url.startsWith('/api/tracks/'));
    expect(player.current()?.id).toBe('b');
  });

  it('en répétition « file », next() boucle sur la première piste', () => {
    const list = [track('a'), track('b')];
    playAndFlush(list[1], list);

    player.cycleRepeat(); // off -> all
    expect(player.repeat()).toBe('all');

    player.next(true);
    httpTesting.expectOne('/api/tracks/a/audio').flush(new Blob(['x']));

    expect(player.current()?.id).toBe('a');
  });

  it('onEnded() en répétition « une piste » relance sans nouvelle requête', () => {
    playAndFlush(track('a'));
    player.cycleRepeat();
    player.cycleRepeat(); // off -> all -> one

    expect(player.repeat()).toBe('one');

    element.currentTime = 90;
    player.onEnded();

    // La piste est déjà en mémoire : elle repart de zéro sans retéléchargement.
    httpTesting.expectNone((r) => r.url.startsWith('/api/tracks/'));
    expect(element.currentTime).toBe(0);
    expect(element.paused).toBe(false);
  });

  it('previous() revient au début du morceau s’il est déjà entamé', () => {
    const list = [track('a'), track('b')];
    playAndFlush(list[1], list);

    player.currentTime.set(12);
    player.previous();

    // Comportement des lecteurs du marché : le premier appui rembobine.
    httpTesting.expectNone((r) => r.url.startsWith('/api/tracks/'));
    expect(player.current()?.id).toBe('b');
    expect(player.currentTime()).toBe(0);
  });

  it('enqueue() ajoute en fin de file sans couper la lecture', () => {
    playAndFlush(track('a'));

    player.enqueue(track('b'));

    expect(player.queue().map((item) => item.id)).toEqual(['a', 'b']);
    expect(player.current()?.id).toBe('a');
    httpTesting.expectNone((r) => r.url.startsWith('/api/tracks/'));
  });

  it('enqueue() sur une file vide démarre la lecture', () => {
    player.enqueue(track('a'));

    httpTesting.expectOne('/api/tracks/a/audio').flush(new Blob(['x']));

    expect(player.current()?.id).toBe('a');
  });

  it('removeFromQueue() garde une piste jouable', () => {
    const list = [track('a'), track('b')];
    playAndFlush(list[0], list);

    player.removeFromQueue('a');

    // La piste courante a disparu : la suivante prend sa place.
    httpTesting.expectOne('/api/tracks/b/audio').flush(new Blob(['x']));
    expect(player.current()?.id).toBe('b');
  });

  it('onLoadedMetadata() lit la durée et applique volume et vitesse', () => {
    playAndFlush(track('a'));

    player.setVolume(0.3);
    player.setRate(0.75);
    player.onLoadedMetadata();

    expect(player.duration()).toBe(120);
    expect(element.volume).toBeCloseTo(0.3);
    expect(element.playbackRate).toBe(0.75);
    // La hauteur des notes est préservée quand on ralentit.
    expect(element.preservesPitch).toBe(true);
  });

  it('ignore une durée infinie annoncée par le navigateur', () => {
    playAndFlush(track('a'));

    (element as unknown as { duration: number }).duration = Number.POSITIVE_INFINITY;
    player.onLoadedMetadata();

    expect(player.duration()).toBe(0);
  });

  it('toggleMute() coupe le son sans perdre le niveau choisi', () => {
    playAndFlush(track('a'));
    player.setVolume(0.6);

    player.toggleMute();

    expect(element.volume).toBe(0);
    expect(player.volume()).toBeCloseTo(0.6);

    player.toggleMute();

    expect(element.volume).toBeCloseTo(0.6);
  });

  it('seek() borne la position à la durée connue', () => {
    playAndFlush(track('a'));
    player.onLoadedMetadata();

    player.seek(500);

    expect(player.currentTime()).toBe(120);

    player.seekBy(-1000);

    expect(player.currentTime()).toBe(0);
  });

  it('seekToRatio() convertit une fraction de forme d’onde en secondes', () => {
    playAndFlush(track('a'));
    player.onLoadedMetadata();

    player.seekToRatio(0.25);

    expect(player.currentTime()).toBe(30);
  });

  it('refuse un point B trop proche du point A', () => {
    playAndFlush(track('a'));

    player.currentTime.set(10);
    player.markLoopStart();
    player.currentTime.set(10.2);
    player.markLoopEnd();

    // Une boucle de 0,2 s bloquerait la lecture sur place.
    expect(player.loopEnd()).toBeNull();
    expect(player.hasLoop()).toBe(false);
  });

  it('la boucle A → B ramène la lecture au point A', () => {
    playAndFlush(track('a'));

    player.currentTime.set(10);
    player.markLoopStart();
    player.currentTime.set(20);
    player.markLoopEnd();

    expect(player.hasLoop()).toBe(true);

    // Le navigateur dépasse le point B : le service doit rembobiner.
    element.currentTime = 20.5;
    player.onTimeUpdate();

    expect(element.currentTime).toBe(10);
    expect(player.currentTime()).toBe(10);
  });

  it('un point A postérieur au point B invalide la boucle', () => {
    playAndFlush(track('a'));

    player.currentTime.set(5);
    player.markLoopStart();
    player.currentTime.set(15);
    player.markLoopEnd();

    player.currentTime.set(30);
    player.markLoopStart();

    expect(player.loopStart()).toBe(30);
    expect(player.loopEnd()).toBeNull();
  });

  it('forget() vide le lecteur quand la piste supprimée était seule', () => {
    playAndFlush(track('a'));

    player.forget('a');

    expect(player.current()).toBeNull();
    expect(player.audioUrl()).toBe('');
    expect(player.queue()).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('la lecture aléatoire parcourt toute la file avant de recommencer', () => {
    const list = [track('a'), track('b'), track('c')];
    playAndFlush(list[0], list);

    player.toggleShuffle();
    expect(player.shuffle()).toBe(true);

    const seen = new Set<string>([list[0].id]);

    for (let step = 0; step < 2; step += 1) {
      player.next(true);
      const request = httpTesting.expectOne((r) => r.url.endsWith('/audio'));
      request.flush(new Blob(['x']));
      seen.add(player.current()!.id);
    }

    // Un tirage à chaque appel pourrait rejouer deux fois la même piste ;
    // l'ordre mémorisé garantit un passage unique.
    expect(seen.size).toBe(3);
  });

  it('toggleStage() ne fait rien tant qu’aucune piste n’est chargée', () => {
    player.toggleStage();

    expect(player.stageOpen()).toBe(false);
  });
});
