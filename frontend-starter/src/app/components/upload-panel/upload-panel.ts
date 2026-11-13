import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Track } from '../../shared/models/track.model';
import { MAX_AUDIO_SIZE, formatSize } from '../../shared/audio-constraints';
import { UploadItem, UploadQueueService } from '../../shared/services/upload-queue.service';
import { IconComponent } from '../icon/icon';

/**
 * Panneau d'import : zone de dépôt et file d'envoi.
 *
 * Il accepte PLUSIEURS fichiers d'un coup, alors que l'API n'en prend qu'un
 * par requête : le lot est donc découpé côté client par `UploadQueueService`,
 * qui envoie les fichiers l'un après l'autre. Chaque ligne garde sa propre
 * barre de progression, son propre message d'erreur et son propre bouton de
 * reprise — un fichier refusé ne fait pas échouer les autres.
 *
 * La validation locale (format, taille) est faite avant tout envoi pour ne pas
 * consommer la bande passante de l'utilisateur, mais elle ne remplace jamais
 * celle du serveur : lui seul décide, et il refuse de son côté avec un 400.
 */
@Component({
  selector: 'app-upload-panel',
  imports: [IconComponent, MatProgressBarModule],
  templateUrl: './upload-panel.html',
  styleUrl: './upload-panel.css',
})
export class UploadPanelComponent {
  readonly queue = inject(UploadQueueService);

  /**
   * Un `<input type="file">` ne se vide pas en remettant un Signal à zéro :
   * il faut remettre à zéro la valeur de l'élément du DOM lui-même, sinon
   * redéposer le même fichier n'émettrait plus d'événement `change`.
   */
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /** Émis après chaque pièce acceptée par le serveur. */
  readonly uploaded = output<Track>();

  /** Vrai pendant qu'un fichier est survolé au-dessus de la zone de dépôt. */
  readonly dragging = signal(false);

  readonly maxSizeLabel = formatSize(MAX_AUDIO_SIZE);
  readonly formatSize = formatSize;

  /** Sélection via le sélecteur de fichiers natif. */
  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.accept(input.files);
    // Remise à zéro : redéposer le même fichier doit redéclencher `change`.
    input.value = '';
  }

  // --- Glisser-déposer : même chemin de validation que le sélecteur natif ---

  onDragOver(event: DragEvent): void {
    // Sans `preventDefault`, le navigateur ouvrirait le fichier dans un onglet.
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.accept(event.dataTransfer?.files ?? null);
  }

  /** Lance l'envoi de tout ce qui est en attente. */
  send(): void {
    this.queue.start((track) => this.uploaded.emit(track));
  }

  retry(item: UploadItem): void {
    this.queue.retry(item.localId, (track) => this.uploaded.emit(track));
  }

  onTitleInput(item: UploadItem, event: Event): void {
    this.queue.setTitle(item.localId, (event.target as HTMLInputElement).value);
  }

  /**
   * Point d'entrée unique de la sélection, quelle que soit son origine (clic
   * sur le sélecteur ou glisser-déposer) : les mêmes règles sont vérifiées, et
   * il n'y a donc qu'un seul chemin de validation à maintenir.
   */
  private accept(files: FileList | null): void {
    if (!files || files.length === 0) return;

    const added = this.queue.add([...files]);
    console.debug('[UploadPanel] Fichiers reçus', files.length, 'envoyables', added);

    // Un seul fichier valide déposé : on le part tout de suite, c'est le geste
    // attendu. Plusieurs fichiers : on laisse l'utilisateur relire ses titres
    // avant d'envoyer.
    if (added === 1 && files.length === 1) this.send();
  }

  /** Remet le sélecteur natif à zéro quand la file entière est vidée. */
  clearAll(): void {
    this.queue.clear();
    const input = this.fileInput();
    if (input) input.nativeElement.value = '';
  }
}
