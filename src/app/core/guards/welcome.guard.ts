import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserProfileService } from '../services/user-profile.service';
import { SetService } from '../services/set.service';

/**
 * Boot gate: durable hosts need welcome personalization; browser gets a silent
 * local row and can enter features. Configured sessions skip the landing root.
 */
export const welcomeGuard: CanActivateFn = (
  _,
  state: RouterStateSnapshot
): Observable<boolean | UrlTree> => {
  const userProfile = inject(UserProfileService);
  const setService = inject(SetService);
  const router = inject(Router);

  return userProfile.ensureWorkspaceAccess().pipe(
    map((isConfigured: boolean) => {
      if (isConfigured) {
        setService.syncInstalledCache();

        if (state.url === '/' || state.url === '') {
          return router.createUrlTree(['/library']);
        }

        if (state.url.startsWith('/welcome')) {
          return router.createUrlTree(['/library']);
        }

        return true;
      }

      if (state.url === '/' || state.url === '') {
        return true;
      }

      if (state.url.startsWith('/welcome')) {
        return true;
      }

      console.warn(`[WelcomeGuard] Unconfigured workspace blocked accessing deep route: ${state.url}`);
      return router.createUrlTree([userProfile.onboardingTargetRoute]);
    })
  );
};
