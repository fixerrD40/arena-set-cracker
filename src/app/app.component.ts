import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterOutlet, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UserProfileService } from './core/services/user-profile.service';
import { SetService } from './core/services/set.service';
import { DeckService } from './core/services/deck.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterModule,
    MatToolbarModule, MatTabsModule, MatButtonModule, MatIconModule
  ],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./app.css']
})
export class AppComponent {
  private readonly router = inject(Router);
  protected readonly setService = inject(SetService);
  protected readonly deckService = inject(DeckService);
  public readonly userProfileService = inject(UserProfileService);

  protected readonly profile$ = this.userProfileService.config$;
  protected readonly workspace$ = this.setService.activeContext$;
  protected readonly activeDeck$ = this.deckService.activeDeck$;

  /** Electron / Capacitor: durable local vault; Save to Cloud in the bar, no logout. */
  protected readonly isDurableClient = this.userProfileService.requiresPersonalOnboarding;
  /** Browser: volatile vault; banner points at Save to Cloud / register. */
  protected readonly isBrowserClient = !this.isDurableClient;

  protected isCurrentRouteDeck(): boolean {
    return this.router.url.includes('/deck/');
  }

  public navigateToSetLayer(setId: string): void {
    this.router.navigate(['/set', setId]);
  }

  public navigateToLibraryLayer(): void {
    this.setService.unloadWorkspace();
    this.router.navigate(['/library']);
  }

  public handleHomeClick(): void {
    if (this.setService.currentWorkspaceSnapshot) {
      this.navigateToLibraryLayer();
    } else {
      this.setService.syncInstalledCache();
      this.router.navigate(['/']);
    }
  }

  /** Browser-only: drop session/profile; silent Anonymous row comes back via ensure. */
  public logout(): void {
    this.userProfileService.clearConfig().subscribe(() => {
      this.setService.unloadWorkspace();
      this.userProfileService.ensureWorkspaceAccess().subscribe(() => {
        this.setService.syncInstalledCache();
        this.router.navigate(['/library']);
      });
    });
  }
}
