import { Component, computed, inject } from '@angular/core';
import { AUDIO_FORMATS, audioFormatColor, formatSize } from '../../shared/audio-constraints';
import { formatCount } from '../../shared/formatting';
import { LibraryStore } from '../../shared/services/library.store';
import { IconComponent } from '../icon/icon';

/** Une part du graphique de répartition par format. */
interface FormatSlice {
  readonly label: string;
  readonly count: number;
  readonly percent: number;
  /** Variable CSS de la teinte du format — jamais une couleur en dur. */
  readonly color: string;
}

/**
 * Tableau de bord de la bibliothèque : quatre chiffres clés et la répartition
 * par format.
 *
 * Choix de formes, dans cet ordre :
 * - quatre valeurs isolées → des TUILES, pas un graphique en barres. Un
 *   histogramme de quatre barres sans rapport entre elles se lit moins vite
 *   que quatre nombres ;
 * - une répartition part-à-tout → une BARRE EMPILÉE unique, horizontale.
 *
 * La barre empilée porte quatre séries : les couleurs viennent donc d'une
 * palette catégorielle validée (bande de clarté, plancher de chroma,
 * séparation sous daltonisme, contraste sur la surface), et l'identité n'est
 * jamais portée par la seule couleur — la légende donne le nom, le nombre et
 * le pourcentage de chaque format, et sert aussi de vue tabulaire.
 */
@Component({
  selector: 'app-library-stats',
  imports: [IconComponent],
  templateUrl: './library-stats.html',
  styleUrl: './library-stats.css',
})
export class LibraryStatsComponent {
  readonly store = inject(LibraryStore);

  readonly formatSize = formatSize;
  readonly formatCount = formatCount;

  /** Nombre de pistes réellement prises en compte par les chiffres affichés. */
  readonly sampleSize = computed(() => this.store.loaded().length);

  /**
   * Les parts, dans l'ordre FIXE des formats (et non du plus fréquent au moins
   * fréquent) : une couleur suit le format, jamais son rang. Les formats
   * absents sont écartés pour ne pas afficher une légende de zéros.
   */
  readonly slices = computed<FormatSlice[]>(() => {
    const counts = this.store.formatBreakdown();
    const total = this.sampleSize();
    if (total === 0) return [];

    return AUDIO_FORMATS.filter((label) => (counts.get(label) ?? 0) > 0).map((label) => {
      const count = counts.get(label) ?? 0;
      return {
        label,
        count,
        percent: Math.round((count / total) * 100),
        color: audioFormatColor(label),
      };
    });
  });

  /** Formats hors contrat (un type MIME inattendu renvoyé par le serveur). */
  readonly otherCount = computed(() => {
    const known = this.slices().reduce((sum, slice) => sum + slice.count, 0);
    return Math.max(0, this.sampleSize() - known);
  });
}
