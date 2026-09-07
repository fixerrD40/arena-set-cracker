import { Component, inject, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { UserProfileService } from '../../../core/services/user-profile.service';
import { SetService } from '../../../core/services/set.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [
    FormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ],
  templateUrl: './welcome.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './welcome.css'
})
export class WelcomeComponent {
  private readonly router = inject(Router);
  private readonly userProfile = inject(UserProfileService);
  private readonly setService = inject(SetService);

  public username = '';

  public configureApp(): void {
    const trimmedName = this.username.trim();
    if (!trimmedName) return;

    this.userProfile.establishIdentity(trimmedName).subscribe({
      next: () => {
        console.log('WelcomeComponent: Identity confirmed. Hydrating local workspace caches...');
        this.setService.syncInstalledCache();
        this.router.navigate(['/library']);
      },
      error: (err) => {
        console.error('Failed to initialize local workspace:', err);
      }
    });
  }
}
