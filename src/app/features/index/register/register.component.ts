import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UserProfileService } from '../../../core/services/user-profile.service';
import { AuthService } from '../../../core/services/auth.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-set-register',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './register.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './register.css'
})
export class RegisterComponent implements OnInit {
  private readonly userProfileService = inject(UserProfileService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  public readonly form = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    displayName: new FormControl(''),
    password: new FormControl('', Validators.required)
  });

  public hasLocalProfile = false;
  public errorMessage: string | null = null;
  public isLoading = false;

  public ngOnInit(): void {
    this.userProfileService.config$.subscribe({
      next: (profile) => {
        this.hasLocalProfile = profile !== null;
        const name = profile?.displayName?.trim();
        // Skip the silent browser placeholder; anything else is a real local label.
        if (name && name !== 'Anonymous') {
          this.form.patchValue({ displayName: name });
        }
      }
    });
  }

  public register(): void {
    if (this.form.invalid) return;

    this.errorMessage = null;
    this.isLoading = true;

    const { email, password, displayName } = this.form.getRawValue();
    const chosenName = (displayName || '').trim();

    this.authService
      .claimOfflineAccount({
        email: email!,
        password: password!,
        ...(chosenName ? { username: chosenName } : {})
      })
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.router.navigate(['/check-email'], {
            queryParams: { email: email! }
          });
        },
        error: (err) => {
          this.isLoading = false;
          console.error('[Register] Failed to establish cloud account:', err);
          this.errorMessage =
            err?.message || 'Registration request failed. Please verify your credentials.';
        }
      });
  }
}
