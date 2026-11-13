import { Injectable, computed, effect, signal } from '@angular/core';
import { ThemeChoice } from '../models/playback.model';

/** Même clé que le script de pré-rendu d'`index.html`. */
const STORAGE_KEY = 'gpc_theme';

/**
 * Gère les deux thèmes de la charte (« jour » papier, « nuit » encre) et le
 * mode `auto` qui suit la préférence du système.
 *
 * Le thème est porté par l'attribut `data-theme` sur `<html>` : c'est le seul
 * point de contact avec le DOM, tout le reste est du CSS (voir `styles.css`,
 * section 2). `index.html` applique déjà la valeur stockée avant le premier
 * rendu pour éviter un flash de thème clair ; ce service reprend ensuite la
 * main et reste la source de vérité.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** Choix de l'utilisateur, `auto` par défaut. */
  readonly choice = signal<ThemeChoice>(readStoredChoice());

  /** Préférence du système, suivie en direct quand le choix est `auto`. */
  private readonly systemPrefersDark = signal(prefersDark());

  /** Thème réellement appliqué : jamais `auto`, toujours une valeur concrète. */
  readonly resolved = computed<'jour' | 'nuit'>(() => {
    const choice = this.choice();
    if (choice !== 'auto') return choice;
    return this.systemPrefersDark() ? 'nuit' : 'jour';
  });

  constructor() {
    this.watchSystemPreference();

    // Un effect plutôt qu'un appel dans chaque setter : il n'existe qu'un
    // seul endroit où le DOM est touché, quelle que soit l'origine du
    // changement (clic, restauration au démarrage, bascule système).
    effect(() => {
      const choice = this.choice();
      const root = document.documentElement;

      if (choice === 'auto') {
        // Attribut retiré : le CSS repasse sous `prefers-color-scheme`.
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', choice);
      }
    });
  }

  /** Enregistre un choix explicite et le persiste. */
  select(choice: ThemeChoice): void {
    console.debug('[ThemeService] Thème demandé', choice);
    this.choice.set(choice);

    try {
      if (choice === 'auto') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, choice);
    } catch (error) {
      // Navigation privée ou stockage refusé : le thème reste appliqué pour
      // la session en cours, il ne sera simplement pas retenu.
      console.warn('[ThemeService] Thème non persisté', error);
    }
  }

  /** Bascule jour ↔ nuit depuis le thème réellement affiché. */
  toggle(): void {
    this.select(this.resolved() === 'nuit' ? 'jour' : 'nuit');
  }

  /**
   * Suit `prefers-color-scheme` pour que le mode `auto` réagisse quand le
   * système passe en sombre sans recharger la page.
   */
  private watchSystemPreference(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    // `addEventListener` n'existe pas sur MediaQueryList dans les anciens
    // Safari, qui n'ont que `addListener`. L'absence des deux n'est pas une
    // erreur : le thème sera simplement figé à sa valeur de départ.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));
    }
  }
}

/** Lit le choix persisté, en tolérant une valeur absente ou corrompue. */
function readStoredChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'jour' || stored === 'nuit' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

/** Préférence système, `false` si l'environnement ne la connaît pas (tests). */
function prefersDark(): boolean {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}
