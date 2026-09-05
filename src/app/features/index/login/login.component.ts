import { Component, inject, ChangeDetectionStrategy } from '@angular/core';

import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { switchMap } from 'rxjs/operators';
import { UserProfileService } from '../../../core/services/user-profile.service';
import { AuthService } from '../../../core/services/auth.service';
import { SetService } from '../../../core/services/set.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule
],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './login.html'
})
export class LoginComponent {
  private readonly userProfileService = inject(UserProfileService);
  private readonly authService = inject(AuthService);
  private readonly setService = inject(SetService);
  private readonly router = inject(Router);

  public readonly form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', Validators.required)
  });

  public error: string | null = null;
  public isLoading = false;

  public login(): void {
    if (this.form.invalid) return;

    this.error = null;
    this.isLoading = true;

    const { email, password } = this.form.value;

    this.authService.login({ email: email!, password: password! }).subscribe({
      next: (response: { token: string; displayName: string }) => {
        this.userProfileService.restoreCloudIdentity({
          token: response.token,
          name: response.displayName
        }).pipe(
          switchMap(() => this.setService.hydrateFromCloudOnce())
        ).subscribe({
          next: () => {
            this.isLoading = false;
            this.router.navigate(['/library']);
          },
          error: (dbErr) => {
            this.isLoading = false;
            console.error('[Login] SQLite configuration ingestion failed:', dbErr);
            this.error = 'Failed to write your cloud secure configuration. Please try again.';
          }
        });
      },
      error: (err) => {
        this.isLoading = false;
        this.error = err.message || 'Invalid email address or password configuration.';
      }
    });
  }
}
