import { inject } from '@angular/core';
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpEvent,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { UserProfileService } from '../services/user-profile.service';

/** Attaches Bearer token; clears cloud session on /api 401 when we had sent one. */
export const tokenInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
): Observable<HttpEvent<any>> => {
  const userProfileService = inject(UserProfileService);
  const sessionToken = userProfileService.getSnapshot()?.sessionToken;

  const authReq = sessionToken
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${sessionToken}`
        }
      })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      const sentBearer = !!sessionToken;
      const isApi = req.url.includes('/api/');
      // Login/register 403 (unverified) must not clear a session.
      if (sentBearer && isApi && err.status === 401) {
        return userProfileService.clearExpiredCloudSession().pipe(
          switchMap(() => throwError(() => err))
        );
      }
      return throwError(() => err);
    })
  );
};
