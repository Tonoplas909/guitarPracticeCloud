import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ThemeChoice } from '../../shared/models/playback.model';
import { formatDate } from '../../shared/formatting';
import { AuthService } from '../../shared/services/auth.service';
import { ThemeService } from '../../shared/services/theme.service';
import { TrackMetaService } from '../../shared/services/track-meta.service';
import { IconComponent } from '../icon/icon';

/** Les trois choix de thème, comme dans le panneau d'aide. */
const THEMES: readonly { value: ThemeChoice; label: string; icon: 'sun' | 'moon' | 'auto' }[] = [
  { value: 'jour', label: 'Jour', icon: 'sun' },
  { value: 'nuit', label: 'Nuit', icon: 'moon' },
  { value: 'auto', label: 'Système', icon: 'auto' },
];

/**
 * Page de profil : l'identité renvoyée par l'API, le seul champ que le
 * contrat permet de modifier (le nom), et les réglages qui vivent dans le
 * navigateur.
 *
 * Elle sert aussi de page de transparence : elle dit explicitement ce qui est
 * stocké sur le serveur et ce qui ne l'est pas. Les favoris, étiquettes et
 * compteurs d'écoute n'ont aucune route dans `API_CONTRACT.md` : ils restent
 * donc locaux, et l'utilisateur doit le savoir plutôt que de le découvrir en
 * changeant d'appareil.
 */
@Component({
  imports: [ReactiveFormsModule, IconComponent],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly meta = inject(TrackMetaService);
  private readonly snackBar = inject(MatSnackBar);

  readonly themes = THEMES;
  readonly formatDate = formatDate;

  readonly saving = signal(false);
  readonly loadFailed = signal(false);

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  /** Nombre de pistes ayant des métadonnées locales. */
  readonly localCount = computed(() => Object.keys(this.meta.all()).length);

  readonly localFavorites = computed(
    () => Object.values(this.meta.all()).filter((entry) => entry.favorite).length,
  );

  readonly localPlays = computed(() =>
    Object.values(this.meta.all()).reduce((sum, entry) => sum + entry.plays, 0),
  );

  readonly localTags = computed(() => {
    this.meta.all();
    return this.meta.knownTags().length;
  });

  /** Initiale affichée en guise d'avatar : aucune image à charger. */
  readonly initial = computed(() => this.auth.currentUser()?.name.charAt(0).toUpperCase() ?? '?');

  constructor() {
    this.load();
  }

  load(): void {
    this.loadFailed.set(false);

    this.auth.profile().subscribe({
      next: (user) => {
        console.debug('[ProfilePage] Profil chargé', user.id);
        this.form.setValue({ name: user.name });
      },
      error: (error) => {
        console.error('[ProfilePage] Chargement impossible', error);
        this.loadFailed.set(true);
      },
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.saving()) return;

    this.saving.set(true);

    this.auth.update(this.form.getRawValue().name).subscribe({
      next: (user) => {
        console.debug('[ProfilePage] Profil enregistré', user.id);
        this.saving.set(false);
        this.snackBar.open('Nom mis à jour.', 'Fermer', { duration: 3000 });
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[ProfilePage] Enregistrement impossible', error);
        this.saving.set(false);
        this.snackBar.open(
          error.error?.message ?? "L'enregistrement a échoué. Réessayez.",
          'Fermer',
          { duration: 5000 },
        );
      },
    });
  }

  /** Demande de confirmation avant d'effacer les données locales. */
  readonly confirmingWipe = signal(false);

  wipeLocalData(): void {
    this.meta.clearAll();
    this.confirmingWipe.set(false);
    this.snackBar.open('Favoris, étiquettes et compteurs locaux effacés.', 'Fermer', {
      duration: 4000,
    });
  }
}
