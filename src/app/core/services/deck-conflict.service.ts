import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { concatMap, map, switchMap, tap, toArray } from 'rxjs/operators';
import { VaultStore } from './vault/vault.store';
import { SyncService } from './sync.service';
import {
  decks,
  deckCards,
  syncConflicts,
  DeckCardRow,
  SyncConflictRow
} from '../sqlite/sqlite.schema';
import { CloudDeckPayload, MtgDeck } from '../../shared/models/deck/deck';
import {
  mapDeckToJson,
  mapJsonToDeck,
  touchDeckUpdatedAt
} from '../../shared/models/deck/deck.mappers';
import { nowIso } from '../../shared/models/sync-timestamp';
import { toOutboxPayload } from './vault/outbox.payload';

export interface DeckConflictView {
  deckId: string;
  setId: string;
  name: string;
}

export interface ResolveOptions {
  /**
   * `background` (default): kick SyncService after local lock-in; failures stay off the conflict UI.
   * `none`: caller will flush once after a batch.
   */
  flush?: 'background' | 'none';
}

/**
 * Parks cloud deck tips when both sides moved past mergeBaseUpdatedAt.
 * Lock-in writes a firm local baseline (updatedAt + mergeBaseUpdatedAt); push is best-effort.
 */
@Injectable({
  providedIn: 'root'
})
export class DeckConflictService {
  private readonly vault = inject(VaultStore);
  private readonly sync = inject(SyncService);

  private readonly conflictsSubject = new BehaviorSubject<DeckConflictView[]>([]);
  public readonly conflicts$ = this.conflictsSubject.asObservable();

  public refresh(): Observable<DeckConflictView[]> {
    return this.vault.fetchCollection<SyncConflictRow>(syncConflicts).pipe(
      switchMap((rows) => {
        if (!rows.length) {
          this.conflictsSubject.next([]);
          return of([]);
        }
        return from(rows).pipe(
          concatMap((row) =>
            this.vault.fetchRecord<MtgDeck>(decks, row.id).pipe(
              map((local) => {
                const theirs = row.theirsPayload as unknown as CloudDeckPayload;
                return {
                  deckId: row.id,
                  setId: local?.setId || theirs?.setId || '',
                  name: local?.name || theirs?.name || row.id
                } satisfies DeckConflictView;
              })
            )
          ),
          toArray(),
          tap((views) => this.conflictsSubject.next(views))
        );
      })
    );
  }

  public parkTheirs(cloudDeck: MtgDeck): Observable<void> {
    const payload = mapDeckToJson(cloudDeck);
    const row = {
      id: cloudDeck.id,
      theirsPayload: payload as unknown as Record<string, unknown>,
      theirsUpdatedAt: cloudDeck.updatedAt?.trim() || null,
      createdAt: nowIso()
    };
    return this.vault.fetchRecord(syncConflicts, cloudDeck.id).pipe(
      switchMap((existing) =>
        this.vault.writeLocal(syncConflicts, row, existing ? 'update' : 'insert')
      ),
      switchMap(() => this.refresh()),
      map(() => void 0)
    );
  }

  public hasConflict(deckId: string): boolean {
    return this.conflictsSubject.value.some((c) => idEquals(c.deckId, deckId));
  }

  /** Keep local tip: bump clock, set merge-base to that tip, clear park, enqueue push. */
  public resolveYours(deckId: string, options?: ResolveOptions): Observable<MtgDeck | null> {
    return this.vault.fetchRecord<MtgDeck>(decks, deckId).pipe(
      switchMap((local) => {
        if (!local) {
          return this.clearConflict(deckId).pipe(map(() => null));
        }
        return this.vault.fetchCollection<DeckCardRow>(deckCards, 'all').pipe(
          switchMap((allLines) => {
            const cards = new Map<string, number>();
            for (const line of allLines || []) {
              if (String(line.deckId) === String(deckId)) {
                cards.set(line.cardId, line.quantity);
              }
            }
            const stamped = touchDeckUpdatedAt({ ...local, cards });
            const applied: MtgDeck = {
              ...stamped,
              mergeBaseUpdatedAt: stamped.updatedAt
            };
            // update() enqueues the deck tip for cloud LWW.
            return this.vault.update(decks, applied).pipe(
              switchMap(() => this.clearConflict(deckId)),
              tap(() => this.maybeFlush(options)),
              map(() => applied)
            );
          })
        );
      })
    );
  }

  /** Take parked cloud tip: apply locally, ack base to that tip, clear park (already on cloud). */
  public resolveTheirs(deckId: string, options?: ResolveOptions): Observable<MtgDeck | null> {
    return this.vault.fetchRecord<SyncConflictRow>(syncConflicts, deckId).pipe(
      switchMap((row) => {
        if (!row) {
          return of(null);
        }
        const cloud = mapJsonToDeck(row.theirsPayload as unknown as CloudDeckPayload);
        const applied: MtgDeck = {
          ...cloud,
          mergeBaseUpdatedAt: cloud.updatedAt?.trim() || nowIso()
        };
        return this.applyDeckLocal(applied).pipe(
          switchMap((deck) => this.clearConflict(deckId).pipe(map(() => deck))),
          tap(() => this.maybeFlush(options))
        );
      })
    );
  }

  /** Persist merge result as the firm tip, clear park, enqueue push. */
  public resolveWithResult(deck: MtgDeck, options?: ResolveOptions): Observable<MtgDeck> {
    const stamped = touchDeckUpdatedAt(deck);
    const applied: MtgDeck = {
      ...stamped,
      mergeBaseUpdatedAt: stamped.updatedAt
    };
    return this.applyDeckLocal(applied).pipe(
      switchMap((saved) =>
        // applyDeckLocal is writeLocal (no outbox); enqueue so cloud gets the merge tip.
        this.sync
          .enqueue(
            {
              entityType: 'deck',
              action: 'UPDATE',
              payload: toOutboxPayload('deck', saved)
            },
            { drain: false }
          )
          .pipe(map(() => saved))
      ),
      switchMap((saved) => this.clearConflict(saved.id).pipe(map(() => saved))),
      tap(() => this.maybeFlush(options))
    );
  }

  /** One background drain after a lock-in batch (flush: 'none' on each resolve). */
  public flushAfterLockIn(): void {
    this.sync.triggerSync();
  }

  public clearConflict(deckId: string): Observable<void> {
    return this.vault.delete(syncConflicts, deckId).pipe(
      switchMap(() => this.refresh()),
      map(() => void 0)
    );
  }

  public applyDeckLocal(deck: MtgDeck): Observable<MtgDeck> {
    return this.vault.fetchRecord<MtgDeck>(decks, deck.id).pipe(
      switchMap((existing) => {
        const write$ = existing
          ? this.vault.writeLocal(decks, deck, 'update')
          : this.vault.writeLocal(decks, deck, 'insert');
        return write$.pipe(
          switchMap(() => this.vault.deleteWhere(deckCards, 'deckId', deck.id)),
          switchMap(() => {
            const lines = Array.from(deck.cards.entries()).map(([cardId, quantity]) => ({
              deckId: deck.id,
              cardId,
              quantity
            }));
            if (lines.length === 0) {
              return of(deck);
            }
            return this.vault.insertBulk(deckCards, lines).pipe(map(() => deck));
          })
        );
      })
    );
  }

  private maybeFlush(options?: ResolveOptions): void {
    if (options?.flush === 'none') {
      return;
    }
    this.sync.triggerSync();
  }
}

function idEquals(a: string, b: string): boolean {
  return String(a) === String(b);
}
