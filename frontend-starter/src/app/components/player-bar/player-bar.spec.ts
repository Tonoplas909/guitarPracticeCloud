import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Track } from '../../shared/models/track.model';
import { PlayerService } from '../../shared/services/player.service';
import { TrackMetaService } from '../../shared/services/track-meta.service';
import { PlayerBarComponent } from './player-bar';

const TRACK: Track = {
  id: 'abc123',
  title: 'Blues en La',
  originalName: 'blues.mp3',
  mimeType: 'audio/mpeg',
  size: 2048,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/*
 * La barre de lecture contient l'unique élément `<audio>` de l'application,
 * et monte le visualiseur et la forme d'onde — deux composants qui dessinent
 * sur un `<canvas>`. jsdom ne fournit pas de contexte 2D : ces tests
 * vérifient donc justement que leur absence ne casse rien, et que la barre
 * reste utilisable dans son état vide.
 */
describe('PlayerBarComponent', () => {
  let fixture: ComponentFixture<PlayerBarComponent>;
  let player: PlayerService;
  let meta: TrackMetaService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:piste');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    fixture = TestBed.createComponent(PlayerBarComponent);
    player = TestBed.inject(PlayerService);
    meta = TestBed.inject(TrackMetaService);
    httpTesting = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('s’affiche même sans piste en cours, commandes inertes', () => {
    const bar = fixture.nativeElement.querySelector('.bar');

    // « Toujours affichée » : la barre existe dès le premier rendu…
    expect(bar).not.toBeNull();
    // …dans son état vide, et son bouton principal est désactivé.
    expect(bar.classList.contains('is-idle')).toBe(true);
    expect(bar.textContent).toContain('Aucune lecture en cours');
    expect(bar.querySelector('.play').disabled).toBe(true);
  });

  it('l’élément audio existe dès le départ et n’a aucun attribut src', () => {
    const audio = fixture.nativeElement.querySelector('audio');

    // Il est toujours présent, car `createMediaElementSource()` ne peut être
    // appelé qu'une fois par élément : un élément recréé couperait le
    // visualiseur. Et son `src` est ABSENT plutôt que vide — un `src=""`
    // serait résolu comme l'URL de la page et déclencherait une erreur.
    expect(audio).not.toBeNull();
    expect(audio.hasAttribute('src')).toBe(false);
  });

  it('branche l’élément audio sur le service de lecture', () => {
    player.setVolume(0.42);

    const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;

    // Le volume a été reporté sur l'élément : la barre l'a donc bien
    // enregistré auprès du service.
    expect(audio.volume).toBeCloseTo(0.42);
  });

  it('affiche la piste en cours après le chargement du flux', () => {
    player.play(TRACK);
    httpTesting
      .expectOne('/api/tracks/abc123/audio')
      .flush(new Blob(['octets'], { type: 'audio/mpeg' }));
    fixture.detectChanges();

    const bar = fixture.nativeElement.querySelector('.bar');

    expect(bar.classList.contains('is-idle')).toBe(false);
    expect(bar.textContent).toContain('Blues en La');
    expect(bar.querySelector('.play').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('audio').getAttribute('src')).toBe('blob:piste');
  });

  it('le bouton favori reflète et modifie l’état local', () => {
    player.play(TRACK);
    httpTesting.expectOne('/api/tracks/abc123/audio').flush(new Blob(['octets']));
    fixture.detectChanges();

    const favourite = fixture.nativeElement.querySelector('.fav') as HTMLButtonElement;

    expect(favourite.getAttribute('aria-pressed')).toBe('false');

    favourite.click();
    fixture.detectChanges();

    expect(meta.isFavorite('abc123')).toBe(true);
    expect(favourite.getAttribute('aria-pressed')).toBe('true');
  });

  it('cycleVisualizer() fait tourner les trois rendus', () => {
    const component = fixture.componentInstance;

    expect(component.visualizerMode()).toBe('bars');

    component.cycleVisualizer();
    expect(component.visualizerMode()).toBe('wave');

    component.cycleVisualizer();
    expect(component.visualizerMode()).toBe('groove');

    component.cycleVisualizer();
    expect(component.visualizerMode()).toBe('bars');
  });

  it('expose la boucle A → B sous forme de texte, pas seulement de couleur', () => {
    player.play(TRACK);
    httpTesting.expectOne('/api/tracks/abc123/audio').flush(new Blob(['octets']));

    player.currentTime.set(10);
    player.markLoopStart();
    player.currentTime.set(25);
    player.markLoopEnd();
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector('.loop-chip');

    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain('0:10');
    expect(chip.textContent).toContain('0:25');
  });

  it('les commandes icôniques portent un libellé qui suit leur état', () => {
    player.play(TRACK);
    httpTesting.expectOne('/api/tracks/abc123/audio').flush(new Blob(['octets']));
    fixture.detectChanges();

    const play = fixture.nativeElement.querySelector('.play');

    expect(play.getAttribute('aria-label')).toBe('Reprendre la lecture');

    player.isPlaying.set(true);
    fixture.detectChanges();

    expect(play.getAttribute('aria-label')).toBe('Mettre en pause');
  });

  it('la forme d’onde est un curseur accessible au clavier', () => {
    const waveform = fixture.nativeElement.querySelector('app-waveform');

    expect(waveform.getAttribute('role')).toBe('slider');
    expect(waveform.getAttribute('tabindex')).toBe('0');
    expect(waveform.getAttribute('aria-label')).toBe('Position dans le morceau');
    // Sans piste, le curseur est annoncé comme désactivé.
    expect(waveform.getAttribute('aria-disabled')).toBe('true');
  });
});
