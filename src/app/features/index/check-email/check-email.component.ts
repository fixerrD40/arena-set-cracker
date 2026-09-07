import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-check-email',
  standalone: true,
  imports: [RouterModule, MatCardModule, MatButtonModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './check-email.html'
})
export class CheckEmailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  public readonly email = this.route.snapshot.queryParamMap.get('email') || '';
  /** Set when login returned 403 — confirm before signing in; do not auto-resend. */
  public readonly fromUnverifiedLogin =
    this.route.snapshot.queryParamMap.get('reason') === 'unverified';
  public isLoading = false;
  public resent = false;
  public error: string | null = null;

  public resend(): void {
    if (!this.email) {
      this.error = 'Missing email address. Open the link from your inbox, or sign in after you confirm.';
      return;
    }
    this.error = null;
    this.resent = false;
    this.isLoading = true;
    this.auth.resendVerification(this.email).subscribe({
      next: () => {
        this.isLoading = false;
        this.resent = true;
      },
      error: (err) => {
        this.isLoading = false;
        this.error = err.message || 'Could not resend verification email.';
      }
    });
  }
}
