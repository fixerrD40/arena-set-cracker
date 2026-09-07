import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';

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
  private readonly setService = inject(SetService);
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
        if (name && name !== 'Local') {
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
      .pipe(
        switchMap((response: { token: string; displayName: string }) => {
          const cloudName = (response.displayName || chosenName).trim();
          const link$ = this.hasLocalProfile
            ? this.userProfileService.linkLocalProfileToCloud(
                response.token,
                cloudName || undefined
              )
            : this.userProfileService.restoreCloudIdentity({
                token: response.token,
                name: cloudName || email!.split('@')[0] || 'Player'
              });
          return link$.pipe(switchMap(() => this.setService.hydrateFromCloudOnce()));
        })
      )
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.router.navigate(['/library']);
        },
        error: (err) => {
          this.isLoading = false;
          console.error('[Register] Failed to establish cloud session:', err);
          this.errorMessage =
            err?.message || 'Registration request failed. Please verify your credentials.';
        }
      });
  }
}
