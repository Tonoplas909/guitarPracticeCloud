import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpEventType, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Track } from '../models/track.model';
import { UploadQueueService } from './upload-queue.service';

const TRACK: Track = {
  id: 'abc123',
  title: 'Blues en La',
  originalName: 'blues.mp3',
  mimeType: 'audio/mpeg',
  size: 2048,
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** Fichier audio acceptable par la validation locale. */
function audioFile(name = 'blues.mp3'): File {
  return new File(['audio'], name, { type: 'audio/mpeg' });
}

describe('UploadQueueService', () => {
  let queue: UploadQueueService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    queue = TestBed.inject(UploadQueueService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('refuse un format non audio sans émettre la moindre requête', () => {
    const added = queue.add([new File(['%PDF'], 'partition.pdf', { type: 'application/pdf' })]);

    expect(added).toBe(0);
    // Le fichier reste dans la file, en erreur : l'utilisateur doit voir
    // lequel de ses fichiers a été écarté, et pourquoi.
    expect(queue.items()[0].state).toBe('error');
    expect(queue.items()[0].message).toContain('Format non accepté');

    queue.start();

    httpTesting.expectNone('/api/tracks');
  });

  it('refuse un fichier trop volumineux sans requête', () => {
    // 26 Mo : au-dessus de la limite de 25 Mo appliquée par le backend.
    const big = new File([new Uint8Array(26 * 1024 * 1024)], 'long.mp3', { type: 'audio/mpeg' });

    expect(queue.add([big])).toBe(0);
    expect(queue.items()[0].message).toContain('trop volumineux');

    queue.start();

    httpTesting.expectNone('/api/tracks');
  });

  it('propose un titre par défaut sans l’extension du fichier', () => {
    queue.add([audioFile('impro-en-sol.mp3')]);

    expect(queue.items()[0].title).toBe('impro-en-sol');
  });

  it('ignore un fichier déjà présent dans la file', () => {
    queue.add([audioFile()]);

    expect(queue.add([audioFile()])).toBe(0);
    expect(queue.items().length).toBe(1);
  });

  it('envoie le fichier en multipart avec les champs audio et title', () => {
    queue.add([audioFile()]);
    queue.setTitle(queue.items()[0].localId, 'Blues en La');
    queue.start();

    const request = httpTesting.expectOne('/api/tracks');
    const body = request.request.body as FormData;

    expect(request.request.method).toBe('POST');
    expect(body.get('title')).toBe('Blues en La');
    expect(body.get('audio')).toBeInstanceOf(File);
    // Aucun Content-Type posé à la main : le navigateur doit le générer
    // lui-même, car il doit y ajouter la « boundary » des parties.
    expect(request.request.headers.get('Content-Type')).toBeNull();

    request.flush(TRACK);
  });

  it('met à jour la progression puis l’état de succès', () => {
    queue.add([audioFile()]);
    queue.start();

    expect(queue.uploading()).toBe(true);

    const request = httpTesting.expectOne('/api/tracks');

    request.event({ type: HttpEventType.UploadProgress, loaded: 512, total: 1024 });

    expect(queue.items()[0].progress).toBe(50);
    expect(queue.items()[0].state).toBe('uploading');

    request.flush(TRACK);

    expect(queue.items()[0].state).toBe('success');
    expect(queue.items()[0].progress).toBe(100);
    expect(queue.lastSuccess()?.id).toBe('abc123');
  });

  it('reste en barre indéterminée quand la taille totale est inconnue', () => {
    queue.add([audioFile()]);
    queue.start();

    const request = httpTesting.expectOne('/api/tracks');

    // `total` absent : afficher « 0 % » serait faux, on n'affiche pas de
    // pourcentage du tout.
    request.event({ type: HttpEventType.UploadProgress, loaded: 512 });

    expect(queue.items()[0].progress).toBeNull();

    request.flush(TRACK);
  });

  it('enchaîne les fichiers un par un, et non en parallèle', () => {
    queue.add([audioFile('un.mp3'), audioFile('deux.mp3'), audioFile('trois.mp3')]);
    queue.start();

    // `expectOne` échouerait si deux requêtes partaient en même temps : c'est
    // lui qui vérifie ici le caractère séquentiel de la file.
    const first = httpTesting.expectOne('/api/tracks');
    first.flush(TRACK);

    const second = httpTesting.expectOne('/api/tracks');
    second.flush(TRACK);

    const third = httpTesting.expectOne('/api/tracks');
    third.flush(TRACK);

    expect(queue.successCount()).toBe(3);
    expect(queue.uploading()).toBe(false);
  });

  it('un fichier refusé par le serveur ne bloque pas les suivants', () => {
    queue.add([audioFile('un.mp3'), audioFile('deux.mp3')]);
    queue.start();

    httpTesting
      .expectOne('/api/tracks')
      .flush({ message: 'Format audio non accepté' }, { status: 400, statusText: 'Bad Request' });

    expect(queue.items()[0].state).toBe('error');
    expect(queue.items()[0].message).toBe('Format audio non accepté');

    // Le second part quand même.
    httpTesting.expectOne('/api/tracks').flush(TRACK);

    expect(queue.items()[1].state).toBe('success');
  });

  it('bloque une seconde soumission pendant un envoi en cours', () => {
    queue.add([audioFile()]);
    queue.start();
    // Deuxième clic immédiat : il ne doit produire aucune requête de plus.
    queue.start();

    const requests = httpTesting.match('/api/tracks');

    expect(requests.length).toBe(1);

    requests[0].flush(TRACK);
  });

  it('appelle le rappel de succès pour chaque fichier accepté', () => {
    const onUploaded = vi.fn();
    queue.add([audioFile('un.mp3'), audioFile('deux.mp3')]);
    queue.start(onUploaded);

    httpTesting.expectOne('/api/tracks').flush(TRACK);
    httpTesting.expectOne('/api/tracks').flush(TRACK);

    expect(onUploaded).toHaveBeenCalledTimes(2);
  });

  it('retry() relance un envoi échoué côté serveur', () => {
    queue.add([audioFile()]);
    queue.start();
    httpTesting
      .expectOne('/api/tracks')
      .flush({ message: 'Coupure' }, { status: 500, statusText: 'Server Error' });

    queue.retry(queue.items()[0].localId);

    httpTesting.expectOne('/api/tracks').flush(TRACK);

    expect(queue.items()[0].state).toBe('success');
  });

  it('retry() ne relance pas un fichier refusé par la validation locale', () => {
    queue.add([new File(['%PDF'], 'partition.pdf', { type: 'application/pdf' })]);

    queue.retry(queue.items()[0].localId);

    // Un fichier invalide ne devient pas valide en réessayant.
    httpTesting.expectNone('/api/tracks');
    expect(queue.items()[0].state).toBe('error');
  });

  it('clearFinished() garde ce qui reste à envoyer', () => {
    queue.add([audioFile('un.mp3'), audioFile('deux.mp3')]);
    queue.start();
    httpTesting.expectOne('/api/tracks').flush(TRACK);
    httpTesting
      .expectOne('/api/tracks')
      .flush({ message: 'Coupure' }, { status: 500, statusText: 'Server Error' });

    queue.add([audioFile('trois.mp3')]);
    queue.clearFinished();

    expect(queue.items().length).toBe(1);
    expect(queue.items()[0].file.name).toBe('trois.mp3');
  });

  it('overallProgress() moyenne la progression du lot', () => {
    queue.add([audioFile('un.mp3'), audioFile('deux.mp3')]);
    queue.start();

    const first = httpTesting.expectOne('/api/tracks');
    first.flush(TRACK);

    const second = httpTesting.expectOne('/api/tracks');
    second.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });

    // Un fichier à 100 %, un à 50 % → 75 %.
    expect(queue.overallProgress()).toBe(75);

    second.flush(TRACK);
  });
});
