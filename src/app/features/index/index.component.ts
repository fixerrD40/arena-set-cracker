import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { SetService } from '../../core/services/set.service';
import { UserProfileService } from '../../core/services/user-profile.service';

@Component({
  selector: 'app-index',
  standalone: true,
  templateUrl: './index.html',
  styleUrls: ['./index.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule
  ]
})
export class IndexComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly userProfile = inject(UserProfileService);
  private readonly setService = inject(SetService);

  public readonly showDefaultAction = signal<boolean>(false);

  public ngOnInit(): void {
    this.userProfile.ensureWorkspaceAccess().subscribe((ready) => {
      if (ready) {
        this.setService.syncInstalledCache();
        this.router.navigate(['/library']);
        return;
      }
      this.showDefaultAction.set(true);
    });
  }

  public handleGetStartedClick(): void {
    this.userProfile.ensureWorkspaceAccess().subscribe((ready) => {
      if (ready) {
        this.setService.syncInstalledCache();
        this.router.navigate(['/library']);
        return;
      }
      this.router.navigate([this.userProfile.onboardingTargetRoute]);
    });
  }
}
