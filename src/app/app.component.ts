import { Component, inject, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterOutlet, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { from, fromEvent, Subscription, switchMap, finalize } from 'rxjs';
import { UserProfileService } from './core/services/user-profile.service';
import { SetService } from './core/services/set.service';
import { DeckService } from './core/services/deck.service';
import { VAULT_ENGINE_TOKEN } from './core/vault/vault.engine';
import { BrowserVaultEngine } from './core/sqlite/browser.vault.engine';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterModule,
    MatToolbarModule, MatTabsModule, MatButtonModule, MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./app.css']
})
export class AppComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly vaultEngine = inject(VAULT_ENGINE_TOKEN);
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

  /** True while logout waits on cloud drain before wiping. */
  protected logoutBusy = false;
  /** Drain blocked: Retry (push+wipe) or Abort (drop session, keep local vault). */
  protected logoutNeedsChoice = false;

  /** While held for choice: push on reconnect, never auto-checkout. */
  private logoutReconnectSub?: Subscription;

  public ngOnDestroy(): void {
    this.logoutReconnectSub?.unsubscribe();
  }

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

  /**
   * Browser-only: drain to cloud, then wipe for a clean checkout.
   * On failure, stay signed in until Retry or Abort (reconnect syncs, does not checkout).
   */
  public logout(): void {
    if (this.logoutBusy) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.enterLogoutChoice();
      return;
    }

    this.logoutBusy = true;
    this.logoutNeedsChoice = false;

    this.setService
      .pushLocalDocumentsToCloud()
      .pipe(
        switchMap(() => {
          const wipe$ =
            this.vaultEngine instanceof BrowserVaultEngine
              ? from(this.vaultEngine.wipeLocalData())
              : from(Promise.resolve());
          return wipe$;
        }),
        switchMap(() => this.userProfileService.clearConfig()),
        switchMap(() => {
          this.setService.clearLocalCaches();
          this.deckService.clearActiveDeck();
          return this.userProfileService.ensureWorkspaceAccess();
        }),
        finalize(() => {
          this.logoutBusy = false;
        })
      )
      .subscribe({
        next: () => {
          this.clearLogoutChoice();
          this.setService.syncInstalledCache();
          this.router.navigate(['/library']);
        },
        error: (err) => {
          console.error('[App] Logout drain failed; still signed in:', err);
          this.enterLogoutChoice();
        }
      });
  }

  /** Same as Logout when the choice banner is up. */
  public retryLogout(): void {
    this.logout();
  }

  /**
   * Drop the cloud session without wiping. Local sets/decks stay as a stale copy.
   */
  public abortLogoutKeepLocal(): void {
    if (this.logoutBusy) return;

    this.logoutBusy = true;
    this.userProfileService
      .clearConfig()
      .pipe(
        switchMap(() => this.userProfileService.ensureWorkspaceAccess()),
        finalize(() => {
          this.logoutBusy = false;
        })
      )
      .subscribe({
        next: () => {
          this.clearLogoutChoice();
          this.setService.clearLocalCaches();
          this.deckService.clearActiveDeck();
          this.setService.syncInstalledCache();
          this.router.navigate(['/library']);
        },
        error: (err) => {
          console.error('[App] Abort logout failed:', err);
          this.enterLogoutChoice();
        }
      });
  }

  private enterLogoutChoice(): void {
    this.logoutNeedsChoice = true;
    if (this.logoutReconnectSub && !this.logoutReconnectSub.closed) return;

    this.logoutReconnectSub = fromEvent(window, 'online').subscribe(() => {
      this.setService.pushLocalDocumentsToCloud().subscribe({
        error: (err) =>
          console.error('[App] Reconnect sync while held for logout choice failed:', err)
      });
    });
  }

  private clearLogoutChoice(): void {
    this.logoutNeedsChoice = false;
    this.logoutReconnectSub?.unsubscribe();
    this.logoutReconnectSub = undefined;
  }
}
