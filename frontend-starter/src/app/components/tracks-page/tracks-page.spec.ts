import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Page } from '../../shared/models/page.model';
import { Track } from '../../shared/models/track.model';
import { PlayerService } from '../../shared/services/player.service';
import { LibraryStore } from '../../shared/services/library.store';
import { TrackMetaService } from '../../shared/services/track-meta.service';
import { TracksPageComponent } from './tracks-page';

const TRACK: Track = {
  id: 'abc123',
  title: 'Blues en La',
  originalName: 'blues.mp3',
  mimeType: 'audio/mpeg',
  size: 2048,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function page(items: Track[], overrides: Partial<Page<Track>> = {}): Page<Track> {
  return { items, page: 1, limit: 5, total: items.length, pages: 1, ...overrides };
}

/*
 * La page ne garde plus que ce qui lui est propre : la suppression et le
 * téléchargement. La liste, la pagination et la lecture vivent dans des
 * services partagés, testés à part (`library.store.spec.ts`,
 * `player.service.spec.ts`). Ces tests vérifient donc l'assemblage : ce qui
 * est réellement rendu, et ce que la page déclenche.
 */
describe('TracksPageComponent', () => {
  let fixture: ComponentFixture<TracksPageComponent>;
  let component: TracksPageComponent;
  let httpTesting: HttpTestingController;
  let store: LibraryStore;
  let player: PlayerService;
  let meta: TrackMetaService;
  const snackBar = { open: vi.fn() };

  beforeEach(() => {
    localStorage.clear();
    snackBar.open.mockClear();

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:piste');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Le SnackBar est remplacé par un double : le test vérifie qu'il est
        // appelé avec le bon message, sans dépendre de son rendu.
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });

    fixture = TestBed.createComponent(TracksPageComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
    store = TestBed.inject(LibraryStore);
    player = TestBed.inject(PlayerService);
    meta = TestBed.inject(TrackMetaService);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  /** Consomme la requête déclenchée par le constructeur du composant. */
  function flushInitialLoad(items: Track[] = [TRACK], overrides: Partial<Page<Track>> = {}) {
    const request = httpTesting.expectOne((r) => r.url === '/api/tracks');
    request.flush(page(items, overrides));
    fixture.detectChanges();
    return request;
  }

  it('charge la première page au démarrage avec page=1 et limit=5', () => {
    const request = httpTesting.expectOne((r) => r.url === '/api/tracks');

    expect(request.request.urlWithParams).toBe('/api/tracks?page=1&limit=5');

    request.flush(page([TRACK], { total: 12, pages: 3 }));
    fixture.detectChanges();

    expect(store.total()).toBe(12);
    expect(fixture.nativeElement.textContent).toContain('Blues en La');
    // Le nom du fichier d'origine est affiché sous le titre.
    expect(fixture.nativeElement.textContent).toContain('blues.mp3');
  });

  it('affiche le message d’erreur du serveur dans une zone annoncée', () => {
    const request = httpTesting.expectOne((r) => r.url === '/api/tracks');

    request.flush({ message: 'Panne serveur' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]');

    expect(alert?.textContent).toContain('Panne serveur');
  });

  it('affiche un état vide explicite quand la bibliothèque est vide', () => {
    flushInitialLoad([], { total: 0, pages: 1 });

    expect(fixture.nativeElement.textContent).toContain('Votre bibliothèque est vide');
  });

  it('le changement de page passe par le store et refait une requête', () => {
    flushInitialLoad([TRACK], { total: 12, pages: 3 });

    // pageIndex 1 (Material, base 0) doit devenir page=2 (API, base 1).
    component.onPageChange({ pageIndex: 1, pageSize: 5, length: 12 });

    const second = httpTesting.expectOne((r) => r.url === '/api/tracks');

    expect(second.request.urlWithParams).toBe('/api/tracks?page=2&limit=5');

    second.flush(page([TRACK], { page: 2, total: 12, pages: 3 }));
  });

  it('une recherche déclenche le chargement complet de la bibliothèque', () => {
    flushInitialLoad([TRACK], { total: 30, pages: 6 });

    component.onSearchInput({ target: { value: 'blues' } } as unknown as Event);

    // Chercher dans la page affichée seulement donnerait un résultat faux.
    const bulk = httpTesting.expectOne((r) => r.url === '/api/tracks');

    expect(bulk.request.urlWithParams).toBe('/api/tracks?page=1&limit=20');

    bulk.flush(page([TRACK], { page: 1, limit: 20, total: 1, pages: 1 }));
    fixture.detectChanges();

    expect(store.mode()).toBe('all');
    // Le paginator disparaît : paginer une liste entièrement chargée n'a pas
    // de sens.
    expect(fixture.nativeElement.querySelector('mat-paginator')).toBeNull();
  });

  it('play() lance la lecture avec la liste visible comme file', () => {
    flushInitialLoad([TRACK]);

    component.play(TRACK);

    const audio = httpTesting.expectOne('/api/tracks/abc123/audio');

    expect(audio.request.responseType).toBe('blob');

    audio.flush(new Blob(['octets'], { type: 'audio/mpeg' }));
    fixture.detectChanges();

    expect(player.current()?.id).toBe('abc123');
    expect(player.queue().length).toBe(1);
  });

  it('un second clic sur la piste en cours met en pause au lieu de recharger', () => {
    flushInitialLoad([TRACK]);
    component.play(TRACK);
    httpTesting.expectOne('/api/tracks/abc123/audio').flush(new Blob(['octets']));

    component.play(TRACK);

    // Aucune nouvelle requête : la piste est déjà en mémoire.
    httpTesting.expectNone('/api/tracks/abc123/audio');
  });

  it('enqueue() ajoute à la file et le signale', () => {
    flushInitialLoad([TRACK]);

    component.enqueue(TRACK);

    expect(player.queue().map((item) => item.id)).toEqual(['abc123']);
    expect(snackBar.open.mock.calls[0][0]).toContain('ajouté à la file');
    httpTesting.expectOne('/api/tracks/abc123/audio').flush(new Blob(['octets']));
  });

  it('la suppression appelle DELETE /api/tracks/:id puis recharge la liste', () => {
    flushInitialLoad([TRACK]);

    component.remove(TRACK);

    const remove = httpTesting.expectOne('/api/tracks/abc123');

    expect(remove.request.method).toBe('DELETE');

    remove.flush(null, { status: 204, statusText: 'No Content' });

    // Rechargement immédiat : l'écran ne doit pas garder la piste supprimée.
    httpTesting.expectOne((r) => r.url === '/api/tracks').flush(page([]));
    fixture.detectChanges();

    expect(store.visible()).toEqual([]);
    expect(component.deletingId()).toBeNull();
    expect(snackBar.open.mock.calls[0][0]).toContain('supprimé');
  });

  it('un 404 à la suppression informe l’utilisateur et resynchronise l’écran', () => {
    flushInitialLoad([TRACK]);

    component.remove(TRACK);

    httpTesting
      .expectOne('/api/tracks/abc123')
      .flush({ message: 'Piste inconnue' }, { status: 404, statusText: 'Not Found' });

    expect(snackBar.open.mock.calls[0][0]).toContain("n'existe plus");

    // Même en erreur 404, la liste est redemandée : l'affichage était périmé.
    httpTesting.expectOne((r) => r.url === '/api/tracks').flush(page([]));

    expect(component.deletingId()).toBeNull();
  });

  it('bloque un second appel pendant une suppression en cours', () => {
    flushInitialLoad([TRACK]);

    component.remove(TRACK);
    component.remove(TRACK);

    const requests = httpTesting.match('/api/tracks/abc123');

    expect(requests.length).toBe(1);

    requests[0].flush(null, { status: 204, statusText: 'No Content' });
    httpTesting.expectOne((r) => r.url === '/api/tracks').flush(page([]));
  });

  it('la suppression oublie aussi les métadonnées locales de la piste', () => {
    flushInitialLoad([TRACK]);
    meta.toggleFavorite(TRACK.id);
    meta.addTag(TRACK.id, 'solo');

    component.remove(TRACK);
    httpTesting
      .expectOne('/api/tracks/abc123')
      .flush(null, { status: 204, statusText: 'No Content' });
    httpTesting.expectOne((r) => r.url === '/api/tracks').flush(page([]));

    // Sans cet oubli, les favoris d'une piste supprimée resteraient
    // indéfiniment dans le stockage du navigateur.
    expect(meta.size()).toBe(0);
  });

  it('la suppression de la piste en cours vide le lecteur', () => {
    flushInitialLoad([TRACK]);
    component.play(TRACK);
    httpTesting.expectOne('/api/tracks/abc123/audio').flush(new Blob(['octets']));

    component.remove(TRACK);
    httpTesting
      .expectOne('/api/tracks/abc123')
      .flush(null, { status: 204, statusText: 'No Content' });
    httpTesting.expectOne((r) => r.url === '/api/tracks').flush(page([]));
    fixture.detectChanges();

    expect(player.current()).toBeNull();
    expect(player.audioUrl()).toBe('');
  });

  it('download() d’une piste non chargée demande son flux au serveur', () => {
    flushInitialLoad([TRACK]);

    component.download(TRACK);

    const request = httpTesting.expectOne('/api/tracks/abc123/audio');

    expect(request.request.responseType).toBe('blob');

    request.flush(new Blob(['octets'], { type: 'audio/mpeg' }));

    // Le Blob doit être publié puis révoqué : le garder retiendrait tout le
    // fichier en mémoire.
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:piste');
    expect(component.downloadingId()).toBeNull();
  });

  it('download() de la piste en cours ne refait aucune requête', () => {
    flushInitialLoad([TRACK]);
    component.play(TRACK);
    httpTesting.expectOne('/api/tracks/abc123/audio').flush(new Blob(['octets']));

    component.download(TRACK);

    httpTesting.expectNone('/api/tracks/abc123/audio');
  });

  it('onUploaded() signale l’ajout et revient en première page', () => {
    flushInitialLoad([], { total: 0, pages: 1 });
    store.changePage(2, 5);
    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush(page([], { page: 3, limit: 5, total: 12, pages: 3 }));

    component.onUploaded(TRACK);

    const reload = httpTesting.expectOne((r) => r.url === '/api/tracks');

    // Les pistes sont triées par date décroissante : la nouvelle est en
    // première page, on y revient donc pour la rendre visible.
    expect(reload.request.urlWithParams).toBe('/api/tracks?page=1&limit=5');

    reload.flush(page([TRACK]));

    expect(snackBar.open.mock.calls[0][0]).toContain('a été ajouté');
  });

  it('le filtre par étiquette se pose depuis une ligne de la liste', () => {
    flushInitialLoad([TRACK]);

    component.onTagSelected('solo');

    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush(page([TRACK], { page: 1, limit: 20, total: 1, pages: 1 }));
    fixture.detectChanges();

    expect(store.tag()).toBe('solo');
    // La piste n'a pas cette étiquette : elle est donc écartée.
    expect(store.visible()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Aucune piste ne correspond');
  });

  it('le raccourci « / » met le focus sur la recherche', () => {
    flushInitialLoad([TRACK]);

    const event = new KeyboardEvent('keydown', { key: '/' });
    document.dispatchEvent(event);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('#library-search');

    expect(document.activeElement).toBe(input);
  });

  it('« / » tapé dans un champ ne déclenche pas le raccourci', () => {
    flushInitialLoad([TRACK]);

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));

    // Le focus reste dans le champ : taper « / » doit écrire une barre.
    expect(document.activeElement).toBe(input);

    input.remove();
  });
});
