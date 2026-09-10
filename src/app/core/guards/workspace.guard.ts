import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { SetService } from '../services/set.service';
import { DeckService } from '../services/deck.service';
import { VaultStore } from '../services/vault/vault.store';
import { decks } from '../sqlite/sqlite.schema';
import { MtgDeck } from '../../shared/models/deck/deck';

/**
 * Saturates the active set workspace from `set/:id` before any child under that set mounts.
 * Missing / unknown ids bounce to the library.
 */
export const setWorkspaceGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot
): Observable<boolean | UrlTree> => {
  const setService = inject(SetService);
  const router = inject(Router);
  const setId = route.paramMap.get('id');

  if (!setId) {
    return of(router.createUrlTree(['/library']));
  }

  return setService.ensureSetWorkspace(setId).pipe(
    map((workspace) => {
      if (workspace) return true;
      console.warn(`[SetWorkspaceGuard] Set "${setId}" is not installed locally.`);
      return router.createUrlTree(['/library']);
    })
  );
};

/**
 * Activates a deck from the already-saturated parent set workspace.
 * Does not switch catalogs if the deck belongs to a different set.
 */
export const deckWorkspaceGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot
): boolean | UrlTree => {
  const setService = inject(SetService);
  const deckService = inject(DeckService);
  const router = inject(Router);
  const deckId = route.paramMap.get('deckId');
  const setId = route.parent?.paramMap.get('id');

  if (!deckId || !setId) {
    return router.createUrlTree(['/library']);
  }

  const workspace = setService.currentWorkspaceSnapshot;
  if (!workspace || workspace.setInfo.id !== setId) {
    return router.createUrlTree(['/library']);
  }

  if (setService.catalogIsStale(workspace.cards)) {
    return router.createUrlTree(['/set', setId]);
  }

  const deck = workspace.decks.find((d) => String(d.id) === String(deckId));
  if (!deck) {
    console.warn(`[DeckWorkspaceGuard] Deck "${deckId}" is not in set "${setId}".`);
    return router.createUrlTree(['/set', setId]);
  }

  deckService.setActiveDeck(deck);
  return true;
};

/** Old flat `/add-deck` → focused set with create overlay, or library if nothing is focused. */
export const legacyAddDeckRedirectGuard: CanActivateFn = (): UrlTree => {
  const setService = inject(SetService);
  const router = inject(Router);
  const setId = setService.currentWorkspaceSnapshot?.setInfo.id;
  return setId
    ? router.createUrlTree(['/set', setId], { queryParams: { createDeck: '1' } })
    : router.createUrlTree(['/library']);
};

/** Nested `/set/:id/add-deck` → set board with create overlay open. */
export const createDeckOverlayRedirectGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot
): UrlTree => {
  const router = inject(Router);
  const setId = route.parent?.paramMap.get('id');
  if (!setId) {
    return router.createUrlTree(['/library']);
  }
  return router.createUrlTree(['/set', setId], { queryParams: { createDeck: '1' } });
};

/** Old flat `/deck/:id` → `/set/:setId/deck/:id`. */
export const legacyDeckRedirectGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot
): Observable<UrlTree> => {
  const vault = inject(VaultStore);
  const router = inject(Router);
  const deckId = route.paramMap.get('id');

  if (!deckId) {
    return of(router.createUrlTree(['/library']));
  }

  return vault.fetchRecord<MtgDeck>(decks, deckId).pipe(
    map((row) =>
      row
        ? router.createUrlTree(['/set', row.setId, 'deck', deckId])
        : router.createUrlTree(['/library'])
    )
  );
};
