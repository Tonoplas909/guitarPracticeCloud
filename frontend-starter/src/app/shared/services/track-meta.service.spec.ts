import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TrackMetaService } from './track-meta.service';

/*
 * Ce service ne parle pas au réseau : il range dans `localStorage` ce que le
 * contrat HTTP du projet ne sait pas stocker (favoris, étiquettes, écoutes).
 * Les tests vérifient donc la persistance et la robustesse à un stockage
 * abîmé — un cas réel, puisque n'importe qui peut modifier ces valeurs depuis
 * les outils du navigateur.
 */
describe('TrackMetaService', () => {
  let meta: TrackMetaService;

  function create(): TrackMetaService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(TrackMetaService);
  }

  beforeEach(() => {
    localStorage.clear();
    meta = create();
  });

  afterEach(() => localStorage.clear());

  it('renvoie des valeurs par défaut pour une piste inconnue', () => {
    expect(meta.meta('inconnue')).toEqual({
      favorite: false,
      plays: 0,
      lastPlayedAt: null,
      tags: [],
    });
  });

  it('toggleFavorite() bascule et renvoie le nouvel état', () => {
    expect(meta.toggleFavorite('a')).toBe(true);
    expect(meta.isFavorite('a')).toBe(true);

    expect(meta.toggleFavorite('a')).toBe(false);
    expect(meta.isFavorite('a')).toBe(false);
  });

  it('registerPlay() incrémente le compteur et horodate', () => {
    meta.registerPlay('a');
    meta.registerPlay('a');

    expect(meta.meta('a').plays).toBe(2);
    expect(meta.meta('a').lastPlayedAt).toBeTypeOf('string');
  });

  it('normalise les étiquettes et refuse les doublons', () => {
    meta.addTag('a', '  Blues  ');
    meta.addTag('a', 'BLUES');
    meta.addTag('a', 'solo');

    // Minuscules et espaces retirés : « Blues » et « BLUES » sont la même
    // étiquette, sinon les filtres se dédoubleraient.
    expect(meta.meta('a').tags).toEqual(['blues', 'solo']);
  });

  it('ignore une étiquette vide', () => {
    meta.addTag('a', '   ');

    expect(meta.meta('a').tags).toEqual([]);
  });

  it('knownTags() renvoie toutes les étiquettes triées', () => {
    meta.addTag('a', 'solo');
    meta.addTag('b', 'blues');
    meta.addTag('b', 'solo');

    expect(meta.knownTags()).toEqual(['blues', 'solo']);
  });

  it('removeTag() retire une seule étiquette', () => {
    meta.addTag('a', 'solo');
    meta.addTag('a', 'blues');

    meta.removeTag('a', 'solo');

    expect(meta.meta('a').tags).toEqual(['blues']);
  });

  it('persiste dans localStorage et relit au démarrage suivant', () => {
    meta.toggleFavorite('a');
    meta.registerPlay('a');
    meta.addTag('a', 'solo');

    // Une nouvelle instance simule un rechargement de la page.
    const reloaded = create();

    expect(reloaded.isFavorite('a')).toBe(true);
    expect(reloaded.meta('a').plays).toBe(1);
    expect(reloaded.meta('a').tags).toEqual(['solo']);
  });

  it('forget() oublie une piste supprimée', () => {
    meta.toggleFavorite('a');
    meta.toggleFavorite('b');

    meta.forget('a');

    expect(meta.isFavorite('a')).toBe(false);
    expect(meta.isFavorite('b')).toBe(true);
    expect(meta.size()).toBe(1);
  });

  it('clearAll() efface tout', () => {
    meta.toggleFavorite('a');
    meta.addTag('b', 'solo');

    meta.clearAll();

    expect(meta.size()).toBe(0);
    expect(create().size()).toBe(0);
  });

  it('repart à vide si le stockage contient du JSON invalide', () => {
    localStorage.setItem('gpc_track_meta', '{ ceci nest pas du json');

    expect(create().size()).toBe(0);
  });

  it('nettoie les champs d’une entrée modifiée à la main', () => {
    localStorage.setItem(
      'gpc_track_meta',
      JSON.stringify({
        a: { favorite: 'oui', plays: -5, lastPlayedAt: 42, tags: ['ok', 7, null] },
      }),
    );

    const reloaded = create();

    // Chaque champ est vérifié plutôt que supposé : une valeur aberrante est
    // ramenée à son défaut, sans faire échouer le chargement.
    expect(reloaded.meta('a')).toEqual({
      favorite: false,
      plays: 0,
      lastPlayedAt: null,
      tags: ['ok'],
    });
  });
});
