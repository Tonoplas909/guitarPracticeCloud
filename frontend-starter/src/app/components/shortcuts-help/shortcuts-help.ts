import {
  Component,
  ElementRef,
  afterNextRender,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { ThemeChoice } from '../../shared/models/playback.model';
import { ThemeService } from '../../shared/services/theme.service';
import { IconComponent } from '../icon/icon';

/** Un raccourci : les touches, et ce qu'elles font. */
interface Shortcut {
  readonly keys: readonly string[];
  readonly label: string;
}

/**
 * Les raccourcis sont déclarés ici, et c'est aussi ce tableau qui documente
 * l'interface : si un raccourci change dans la coquille, l'oubli se voit tout
 * de suite puisque l'aide et le code sont côte à côte dans la même revue.
 */
const SHORTCUTS: readonly { title: string; items: readonly Shortcut[] }[] = [
  {
    title: 'Lecture',
    items: [
      { keys: ['Espace'], label: 'Lecture / pause' },
      { keys: ['K'], label: 'Lecture / pause' },
      { keys: ['←', 'J'], label: 'Reculer de 5 secondes' },
      { keys: ['→', 'L'], label: 'Avancer de 5 secondes' },
      { keys: ['N'], label: 'Piste suivante' },
      { keys: ['P'], label: 'Piste précédente' },
      { keys: ['M'], label: 'Couper / rétablir le son' },
    ],
  },
  {
    title: 'Travail du morceau',
    items: [
      { keys: ['A'], label: 'Poser le début de la boucle' },
      { keys: ['B'], label: 'Poser la fin de la boucle' },
      { keys: ['S'], label: 'Lecture aléatoire' },
      { keys: ['R'], label: 'Mode de répétition' },
      { keys: ['F'], label: 'Ouvrir / fermer la scène' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { keys: ['/'], label: 'Rechercher dans la bibliothèque' },
      { keys: ['?'], label: 'Afficher cette aide' },
      { keys: ['Échap'], label: 'Fermer la scène ou cette aide' },
    ],
  },
];

/** Les trois choix de thème proposés. */
const THEMES: readonly { value: ThemeChoice; label: string; icon: 'sun' | 'moon' | 'auto' }[] = [
  { value: 'jour', label: 'Jour', icon: 'sun' },
  { value: 'nuit', label: 'Nuit', icon: 'moon' },
  { value: 'auto', label: 'Système', icon: 'auto' },
];

/**
 * Panneau d'aide : les raccourcis clavier, et le choix du thème.
 *
 * Il sert deux buts à la fois. D'abord rendre l'application utilisable sans
 * souris — des raccourcis qui n'existent nulle part dans l'interface ne sont
 * utilisés par personne. Ensuite donner au mode « système » du thème un
 * endroit où exister : la bascule de la barre de titre ne fait qu'alterner
 * jour et nuit, ce troisième choix a besoin d'un vrai menu.
 */
@Component({
  selector: 'app-shortcuts-help',
  imports: [IconComponent],
  templateUrl: './shortcuts-help.html',
  styleUrl: './shortcuts-help.css',
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Raccourcis clavier et apparence',
  },
})
export class ShortcutsHelpComponent {
  readonly theme = inject(ThemeService);

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  readonly groups = SHORTCUTS;
  readonly themes = THEMES;

  /** Fermeture demandée : c'est la coquille qui retire le composant. */
  readonly close = output<void>();

  constructor() {
    // Le focus entre dans la boîte de dialogue dès qu'elle est rendue, sinon
    // la tabulation continuerait dans la page située derrière.
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }
}
