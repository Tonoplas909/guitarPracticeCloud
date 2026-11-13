import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Page } from '../models/page.model';
import { Track } from '../models/track.model';
import { LibraryStore } from './library.store';
import { TrackMetaService } from './track-meta.service';

/*
 * Ces tests n'ont besoin ni du backend ni de MongoDB : `provideHttpClientTesting`
 * remplace le transport HTTP par un faux transport que le test pilote. On
 * vérifie donc les requêtes émises (URL, paramètres) et la façon dont l'état
 * du store réagit aux réponses simulées.
 */

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: `Piste ${id}`,
    originalName: `${id}.mp3`,
    mimeType: 'audio/mpeg',
    size: 1024,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function page(items: Track[], overrides: Partial<Page<Track>> = {}): Page<Track> {
  return { items, page: 1, limit: 5, total: items.length, pages: 1, ...overrides };
}

describe('LibraryStore', () => {
  let store: LibraryStore;
  let meta: TrackMetaService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    store = TestBed.inject(LibraryStore);
    meta = TestBed.inject(TrackMetaService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Échoue si une requête attendue n'a pas été consommée par le test.
    httpTesting.verify();
    localStorage.clear();
  });

  it('loadPage() demande la première page avec page=1 et limit=5', () => {
    store.loadPage();

    const request = httpTesting.expectOne((r) => r.url === '/api/tracks');

    expect(request.request.urlWithParams).toBe('/api/tracks?page=1&limit=5');

    request.flush(page([track('a')], { total: 12, pages: 3 }));

    expect(store.visible().length).toBe(1);
    expect(store.total()).toBe(12);
    expect(store.pages()).toBe(3);
    expect(store.loading()).toBe(false);
  });

  it("réaligne page et limit sur ce que le serveur a réellement appliqué", () => {
    // Le backend borne `limit` à 20 : demander 500 doit laisser l'affichage
    // cohérent avec ce qu'il a vraiment renvoyé.
    store.changePage(0, 500);

    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush(page([track('a')], { page: 1, limit: 20, total: 1, pages: 1 }));

    expect(store.limit()).toBe(20);
    expect(store.page()).toBe(1);
  });

  it('changePage() convertit un index Material (base 0) en page API (base 1)', () => {
    store.changePage(2, 10);

    const request = httpTesting.expectOne((r) => r.url === '/api/tracks');

    expect(request.request.urlWithParams).toBe('/api/tracks?page=3&limit=10');

    request.flush(page([], { page: 3, limit: 10, total: 25, pages: 3 }));
  });

  it('expose le message du serveur après un échec de chargement', () => {
    store.loadPage();

    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush({ message: 'Panne serveur' }, { status: 500, statusText: 'Server Error' });

    expect(store.error()).toBe('Panne serveur');
    expect(store.visible()).toEqual([]);
    expect(store.loading()).toBe(false);
  });

  it('une recherche charge TOUTE la bibliothèque, page après page', () => {
    store.loadPage();
    httpTesting.expectOne((r) => r.url === '/api/tracks').flush(page([track('a')], { total: 3, pages: 1 }));

    // Chercher dans la seule page affichée donnerait un résultat faux : le
    // store doit donc aspirer toutes les pages avant de filtrer.
    store.setSearch('solo');

    const first = httpTesting.expectOne((r) => r.url === '/api/tracks');

    expect(first.request.urlWithParams).toBe('/api/tracks?page=1&limit=20');

    first.flush(
      page([track('a', { title: 'Solo lent' })], { page: 1, limit: 20, total: 2, pages: 2 }),
    );

    const second = httpTesting.expectOne((r) => r.url === '/api/tracks');

    expect(second.request.urlWithParams).toBe('/api/tracks?page=2&limit=20');

    second.flush(
      page([track('b', { title: 'Blues rapide' })], { page: 2, limit: 20, total: 2, pages: 2 }),
    );

    expect(store.mode()).toBe('all');
    expect(store.loaded().length).toBe(2);
    // Seule la piste dont le titre contient « solo » reste visible.
    expect(store.visible().map((item) => item.id)).toEqual(['a']);
    expect(store.hiddenCount()).toBe(1);
  });

  it('la recherche porte aussi sur le nom de fichier d’origine', () => {
    store.setSearch('live');

    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush(
        page(
          [
            track('a', { title: 'Sans rapport', originalName: 'repet-live.mp3' }),
            track('b', { title: 'Autre', originalName: 'studio.mp3' }),
          ],
          { page: 1, limit: 20, total: 2, pages: 1 },
        ),
      );

    expect(store.visible().map((item) => item.id)).toEqual(['a']);
  });

  it('filtre par format sans tenir compte de la variante du type MIME', () => {
    store.setFormat('WAV');

    httpTesting.expectOne((r) => r.url === '/api/tracks').flush(
      page(
        [
          track('a', { mimeType: 'audio/mpeg' }),
          track('b', { mimeType: 'audio/x-wav' }),
          track('c', { mimeType: 'audio/wav' }),
        ],
        { page: 1, limit: 20, total: 3, pages: 1 },
      ),
    );

    // `audio/wav` et `audio/x-wav` désignent le même format : les deux doivent
    // passer le filtre « WAV ».
    expect(store.visible().map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('le filtre « favoris » s’appuie sur les métadonnées locales', () => {
    meta.toggleFavorite('b');

    store.toggleFavoritesOnly();

    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush(page([track('a'), track('b')], { page: 1, limit: 20, total: 2, pages: 1 }));

    expect(store.visible().map((item) => item.id)).toEqual(['b']);
  });

  it('trie par titre sans modifier la liste chargée', () => {
    store.setSort('title');

    httpTesting.expectOne((r) => r.url === '/api/tracks').flush(
      page(
        [track('a', { title: 'Zèbre' }), track('b', { title: 'Accord' })],
        { page: 1, limit: 20, total: 2, pages: 1 },
      ),
    );

    expect(store.visible().map((item) => item.title)).toEqual(['Accord', 'Zèbre']);
    // La source n'est pas réordonnée en place : `sort()` trie sur place, donc
    // le store doit travailler sur une copie.
    expect(store.loaded().map((item) => item.title)).toEqual(['Zèbre', 'Accord']);
  });

  it('resetFilters() revient à la pagination serveur', () => {
    store.setSearch('solo');
    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush(page([track('a')], { page: 1, limit: 20, total: 1, pages: 1 }));

    expect(store.mode()).toBe('all');

    store.resetFilters();

    const back = httpTesting.expectOne((r) => r.url === '/api/tracks');

    expect(back.request.urlWithParams).toBe('/api/tracks?page=1&limit=5');

    back.flush(page([track('a')]));

    expect(store.mode()).toBe('pages');
    expect(store.filtered()).toBe(false);
  });

  it('effacer le dernier critère suffit à revenir à la pagination', () => {
    store.setSearch('solo');
    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush(page([track('a')], { page: 1, limit: 20, total: 1, pages: 1 }));

    store.setSearch('');

    httpTesting.expectOne((r) => r.url === '/api/tracks').flush(page([track('a')]));

    expect(store.mode()).toBe('pages');
  });

  it('dropLocally() retire la piste et décrémente le total sans requête', () => {
    store.loadPage();
    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush(page([track('a'), track('b')], { total: 2, pages: 1 }));

    store.dropLocally('a');

    expect(store.visible().map((item) => item.id)).toEqual(['b']);
    expect(store.total()).toBe(1);
  });

  it('reloadAfterDelete() recule d’une page quand la page devient vide', () => {
    store.changePage(1, 5);
    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush(page([track('a')], { page: 2, limit: 5, total: 6, pages: 2 }));

    store.dropLocally('a');
    store.reloadAfterDelete();

    const reload = httpTesting.expectOne((r) => r.url === '/api/tracks');

    // La page 2 est désormais vide : afficher un écran vide serait trompeur,
    // on revient donc page 1.
    expect(reload.request.urlWithParams).toBe('/api/tracks?page=1&limit=5');

    reload.flush(page([track('b')], { page: 1, limit: 5, total: 5, pages: 1 }));
  });

  it('calcule la répartition par format sur les pistes chargées', () => {
    store.loadPage();
    httpTesting.expectOne((r) => r.url === '/api/tracks').flush(
      page(
        [
          track('a', { mimeType: 'audio/mpeg', size: 1000 }),
          track('b', { mimeType: 'audio/mpeg', size: 2000 }),
          track('c', { mimeType: 'audio/ogg', size: 3000 }),
        ],
        { total: 3, pages: 1 },
      ),
    );

    expect(store.formatBreakdown().get('MP3')).toBe(2);
    expect(store.formatBreakdown().get('OGG')).toBe(1);
    expect(store.loadedSize()).toBe(6000);
  });

  it('conserve les pages déjà reçues si le chargement complet échoue', () => {
    store.setSearch('a');

    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush(page([track('a')], { page: 1, limit: 20, total: 40, pages: 2 }));

    httpTesting
      .expectOne((r) => r.url === '/api/tracks')
      .flush({ message: 'Coupure' }, { status: 500, statusText: 'Server Error' });

    // Mieux vaut une liste partielle annoncée qu'un écran vide.
    expect(store.loaded().length).toBe(1);
    expect(store.error()).toBe('Coupure');
    expect(store.loading()).toBe(false);
  });
});
