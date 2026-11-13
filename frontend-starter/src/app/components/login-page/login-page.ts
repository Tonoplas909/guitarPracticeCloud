import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { AuthShellComponent } from '../auth-shell/auth-shell';

@Component({
  imports: [ReactiveFormsModule, RouterLink, AuthShellComponent],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');

  /** Bloque une seconde soumission pendant que la requête est en vol. */
  readonly submitting = signal(false);

  /** Arguments affichés sur l'affiche de gauche. */
  readonly highlights = [
    'Lecteur avec visualiseur et forme d’onde',
    'Boucle A → B et vitesse réglable',
    'Vos fichiers restent sur votre serveur',
  ];

  readonly form = new FormGroup({
    email: new FormControl('demo@example.com', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('Demo1234!', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  submit(): void {
    if (this.form.invalid) {
      // Sans ce marquage, les messages d'erreur ne s'afficheraient pas : ils
      // dépendent de `touched`, et un champ jamais visité ne l'est pas.
      this.form.markAllAsTouched();
      return;
    }

    if (this.submitting()) return;

    this.submitting.set(true);
    this.error.set('');

    const values = this.form.getRawValue();
    this.auth.login(values.email, values.password).subscribe({
      next: () => {
        console.debug('[LoginPage] Connexion réussie');
        this.submitting.set(false);
        void this.router.navigateByUrl('/tracks');
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[LoginPage] Échec de connexion', error);
        this.submitting.set(false);
        this.error.set(error.error?.message ?? 'Erreur de connexion');
      },
    });
  }
}
