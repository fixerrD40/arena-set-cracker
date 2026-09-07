import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { UserProfileService } from '../../../core/services/user-profile.service';
import { SetService } from '../../../core/services/set.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [RouterModule, MatCardModule, MatButtonModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './verify-email.html'
})
export class VerifyEmailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly userProfileService = inject(UserProfileService);
  private readonly setService = inject(SetService);

  public error: string | null = null;
  public isLoading = true;

  public ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.isLoading = false;
      this.error = 'Invalid or missing confirmation link.';
      return;
    }

    this.auth.verifyEmail(token).pipe(
      switchMap((response) =>
        this.userProfileService.restoreCloudIdentity({
          token: response.token,
          name: response.displayName
        }).pipe(switchMap(() => this.setService.hydrateFromCloudOnce()))
      )
    ).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/library']);
      },
      error: (err) => {
        this.isLoading = false;
        this.error = err.message || 'Confirmation link is invalid or expired.';
      }
    });
  }
}
