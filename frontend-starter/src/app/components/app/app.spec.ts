import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Track } from '../../shared/models/track.model';
import { PlayerService } from '../../shared/services/player.service';
import { ThemeService } from '../../shared/services/theme.service';
import { AppComponent } from './app';

const TRACK: Track = {
  id: 'abc123',
  title: 'Blues en La',
  originalName: 'blues.mp3',
  mimeType: 'audio/mpeg',
  size: 2048,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/*
 * La coquille porte trois choses qui ne sont visibles nulle part ailleurs :
 * les raccourcis clavier globaux, la bascule de thème, et le fait que la
 * barre de lecture et la scène vivent AU-DESSUS du router-outlet — c'est ce
 * qui permet à la musique de survivre à un changement de page.
 */
describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let player: PlayerService;
  let theme: ThemeService;
  let httpTesting: HttpTestingController;

  /** Simule une session ouverte : le guard et la coquille lisent ce token. */
  function signIn(): void {
    localStorage.setItem('gpc_token', 'jeton-de-test');
  }

  function build(): void {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    player = TestBed.inject(PlayerService);
    theme = TestBed.inject(ThemeService);
    httpTesting = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:piste');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('affiche la marque et un lien d’évitement', () => {
    build();

    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Guitar Practice Cloud');
    expect(fixture.nativeElement.querySelector('.skip-link')?.getAttribute('href')).toBe(
      '#contenu',
    );
  });

  it('masque la navigation et la barre de lecture hors session', () => {
    build();

    expect(fixture.nativeElement.querySelector('nav a')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-player-bar')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Connexion');
  });

  it('monte la barre de lecture dès qu’une session est ouverte', () => {
    signIn();
    build();

    // La barre est un frère du router-outlet, pas un enfant d'une page :
    // changer de route ne la détruit donc pas.
    expect(fixture.nativeElement.querySelector('app-player-bar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('nav a')).not.toBeNull();
  });

  it('la bascule de thème écrit l’attribut data-theme sur <html>', () => {
    build();

    expect(theme.resolved()).toBe('jour');

    component.toggleTheme();
    fixture.detectChanges();

    expect(theme.choice()).toBe('nuit');
    expect(document.documentElement.getAttribute('data-theme')).toBe('nuit');
    // Le choix est retenu pour la prochaine visite.
    expect(localStorage.getItem('gpc_theme')).toBe('nuit');

    component.toggleTheme();
    fixture.detectChanges();

    expect(document.documentElement.getAttribute('data-theme')).toBe('jour');
  });

  it('le mode « système » retire l’attribut pour laisser faire le CSS', () => {
    build();

    theme.select('nuit');
    fixture.detectChanges();
    theme.select('auto');
    fixture.detectChanges();

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('gpc_theme')).toBeNull();
  });

  it('« ? » ouvre l’aide et Échap la referme', () => {
    build();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
    fixture.detectChanges();

    expect(component.helpOpen()).toBe(true);
    const help = fixture.nativeElement.querySelector('app-shortcuts-help');
    expect(help).not.toBeNull();
    expect(help.getAttribute('role')).toBe('dialog');
    expect(help.getAttribute('aria-modal')).toBe('true');
    // Le panneau documente réellement les raccourcis.
    expect(help.textContent).toContain('Lecture / pause');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(component.helpOpen()).toBe(false);
  });

  it('la barre d’espace déclenche la lecture, sauf dans un champ', () => {
    build();

    const toggle = vi.spyOn(player, 'toggle');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    expect(toggle).toHaveBeenCalledTimes(1);

    // Dans un champ de saisie, la frappe appartient à l'utilisateur.
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(toggle).toHaveBeenCalledTimes(1);

    input.remove();
  });

  it('les raccourcis de travail pilotent le lecteur', () => {
    build();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    expect(player.shuffle()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    expect(player.repeat()).toBe('all');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    expect(player.muted()).toBe(true);
  });

  it('une combinaison système n’est jamais interceptée', () => {
    build();

    const toggle = vi.spyOn(player, 'toggle');

    // Ctrl+Espace appartient au système d'exploitation ou au navigateur.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', ctrlKey: true }));

    expect(toggle).not.toHaveBeenCalled();
  });

  it('« F » ouvre la scène quand une piste est chargée', () => {
    signIn();
    build();

    player.play(TRACK);
    httpTesting
      .expectOne('/api/tracks/abc123/audio')
      .flush(new Blob(['octets'], { type: 'audio/mpeg' }));
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    fixture.detectChanges();

    const stage = fixture.nativeElement.querySelector('app-stage');

    expect(stage).not.toBeNull();
    expect(stage.getAttribute('role')).toBe('dialog');
    expect(stage.textContent).toContain('Blues en La');
    // Les outils de travail du morceau sont dans la scène, pas dans la barre.
    expect(stage.textContent).toContain('Boucle A → B');
    expect(stage.textContent).toContain('Égaliseur');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-stage')).toBeNull();
  });

  it('la déconnexion arrête la musique et libère le Blob', () => {
    signIn();
    build();

    player.play(TRACK);
    httpTesting.expectOne('/api/tracks/abc123/audio').flush(new Blob(['octets']));
    fixture.detectChanges();

    // La redirection est neutralisée : le routeur de test n'a aucune route,
    // et ce test porte sur l'état libéré, pas sur la navigation.
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    component.logout();
    fixture.detectChanges();

    expect(player.current()).toBeNull();
    expect(player.queue()).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:piste');
    expect(localStorage.getItem('gpc_token')).toBeNull();
  });
});
