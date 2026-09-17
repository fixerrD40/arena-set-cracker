import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { BackendService } from './backend.service';
import { UserProfileService } from './user-profile.service';
import { emptyCommunity, SetCommunity } from '../../shared/models/discovery/set-community';

@Injectable({
  providedIn: 'root'
})
export class CommunityService {
  private readonly backend = inject(BackendService);
  private readonly profile = inject(UserProfileService);

  private readonly documentSubject = new BehaviorSubject<SetCommunity | null>(null);
  public readonly community$: Observable<SetCommunity | null> = this.documentSubject.asObservable();

  public load(setId: string): void {
    if (!this.profile.getSnapshot()?.sessionToken) {
      this.documentSubject.next(emptyCommunity(setId));
      return;
    }
    this.backend
      .fetchSetCommunity(setId)
      .pipe(catchError(() => of(emptyCommunity(setId))))
      .subscribe((document) => this.documentSubject.next(document));
  }
}
