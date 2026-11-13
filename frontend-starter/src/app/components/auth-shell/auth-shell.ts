import { Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon';

/**
 * Mise en page commune aux pages de connexion et d'inscription : une affiche
 * à gauche, le formulaire à droite.
 *
 * Les deux pages partageaient exactement la même structure. Plutôt que de
 * recopier soixante lignes de HTML et de CSS dans chacune, la structure vit
 * ici et chaque page n'apporte que son formulaire, projeté par `<ng-content>`.
 * Changer l'affiche se fait donc une seule fois.
 */
@Component({
  selector: 'app-auth-shell',
  imports: [IconComponent],
  templateUrl: './auth-shell.html',
  styleUrl: './auth-shell.css',
})
export class AuthShellComponent {
  /** Surtitre de la page (« Bon retour », « Premier accord »…). */
  readonly eyebrow = input('');

  /** Titre principal. */
  readonly heading = input.required<string>();

  /** Phrase d'introduction sous le titre. */
  readonly lede = input('');

  /** Trois arguments affichés sur l'affiche, à gauche. */
  readonly highlights = input<readonly string[]>([]);
}
