import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { AuthShellComponent } from '../auth-shell/auth-shell';

@Component({
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly submitting = signal(false);

  readonly highlights = [
    'Jusqu’à 25 Mo par fichier, en MP3, WAV, OGG ou M4A',
    'Favoris et étiquettes pour classer vos morceaux',
    'Raccourcis clavier pour tout piloter sans souris',
  ];

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      // 8 caractères : la même règle que le backend, pour que l'utilisateur
      // ne découvre pas la contrainte après un aller-retour réseau.
      validators: [Validators.required, Validators.minLength(8)],
    }),
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.submitting()) return;

    this.submitting.set(true);
    this.error.set('');

    const values = this.form.getRawValue();
    this.auth.register(values.name, values.email, values.password).subscribe({
      next: () => {
        console.debug('[RegisterPage] Inscription réussie');
        this.submitting.set(false);
        void this.router.navigateByUrl('/tracks');
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[RegisterPage] Échec de l’inscription', error);
        this.submitting.set(false);
        this.error.set(error.error?.message ?? 'Erreur d’inscription');
      },
    });
  }
}
