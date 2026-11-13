import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { PlayerService } from '../../shared/services/player.service';
import { ThemeService } from '../../shared/services/theme.service';
import { IconComponent } from '../icon/icon';
import { PlayerBarComponent } from '../player-bar/player-bar';
import { ShortcutsHelpComponent } from '../shortcuts-help/shortcuts-help';
import { StageComponent } from '../stage/stage';

@Component({
  selector: 'app-root',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    IconComponent,
    PlayerBarComponent,
    ShortcutsHelpComponent,
    StageComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    // Les raccourcis sont écoutés sur le document, et non sur un élément
    // précis : ils doivent fonctionner où que soit le focus — sauf dans un
    // champ de saisie, ce que vérifie `handleShortcut`.
    '(document:keydown)': 'handleShortcut($event)',
  },
})
export class AppComponent {
  readonly auth = inject(AuthService);
  readonly player = inject(PlayerService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  /** Panneau d'aide des raccourcis clavier. */
  readonly helpOpen = signal(false);

  logout(): void {
    // La musique s'arrête : continuer à jouer la piste d'un compte déconnecté
    // n'aurait aucun sens, et le Blob doit être libéré.
    this.player.clearQueue();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  /** Bascule jour ↔ nuit. Le mode « auto » est proposé dans le menu. */
  toggleTheme(): void {
    this.theme.toggle();
  }

  /**
   * Raccourcis clavier globaux.
   *
   * Deux règles qui évitent les mauvaises surprises :
   * - rien ne se déclenche quand l'utilisateur écrit dans un champ, ni quand
   *   une combinaison système est en cours (Ctrl, Cmd, Alt) ;
   * - la barre d'espace est ignorée lorsque le focus est sur un bouton ou un
   *   curseur, car elle y a déjà un sens (activer, déplacer).
   *
   * Les flèches haut/bas sont volontairement laissées au navigateur : les
   * détourner pour le volume casserait le défilement de la page.
   */
  handleShortcut(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    const key = event.key;

    if (key === 'Escape') {
      if (this.helpOpen()) this.helpOpen.set(false);
      else this.player.closeStage();
      return;
    }

    if (key === '?') {
      event.preventDefault();
      this.helpOpen.update((open) => !open);
      return;
    }

    if (key === ' ' || key === 'k' || key === 'K') {
      if (key === ' ' && isActivatableTarget(event.target)) return;
      event.preventDefault();
      this.player.toggle();
      return;
    }

    switch (key) {
      case 'ArrowLeft':
      case 'j':
      case 'J':
        event.preventDefault();
        this.player.seekBy(-5);
        break;
      case 'ArrowRight':
      case 'l':
      case 'L':
        event.preventDefault();
        this.player.seekBy(5);
        break;
      case 'n':
      case 'N':
        this.player.next(true);
        break;
      case 'p':
      case 'P':
        this.player.previous();
        break;
      case 'm':
      case 'M':
        this.player.toggleMute();
        break;
      case 's':
      case 'S':
        this.player.toggleShuffle();
        break;
      case 'r':
      case 'R':
        this.player.cycleRepeat();
        break;
      case 'f':
      case 'F':
        this.player.toggleStage();
        break;
      case 'a':
      case 'A':
        this.player.markLoopStart();
        break;
      case 'b':
      case 'B':
        this.player.markLoopEnd();
        break;
      default:
        break;
    }
  }
}

/** Vrai si l'événement vient d'un champ de saisie. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Vrai pour les éléments où la barre d'espace a déjà une signification. */
function isActivatableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'BUTTON' ||
    target.tagName === 'A' ||
    target.getAttribute('role') === 'slider'
  );
}
