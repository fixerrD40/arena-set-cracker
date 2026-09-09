import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { VaultStore } from './vault/vault.store';
import {
  decks,
  deckCards,
  syncConflicts,
  DeckCardRow,
  SyncConflictRow
} from '../sqlite/sqlite.schema';
import { cloneDeck, CloudDeckPayload, MtgDeck } from '../../shared/models/deck/deck';
import { mapJsonToDeck } from '../../shared/models/deck/deck.mappers';
import {
  deckFromCards,
  initialMergeResult,
  residualSideCardMap,
  seedResultFrom
} from '../../shared/models/deck/deck-diff';

export interface DeckMergeSnapshot {
  deckId: string;
  setId: string;
  yours: MtgDeck;
  theirs: MtgDeck;
  result: MtgDeck;
  /** Residuals still available to pull from yours. */
  yoursResidual: MtgDeck;
  /** Residuals still available to pull from theirs. */
  theirsResidual: MtgDeck;
}

/**
 * Nested merge session: middle starts as agreed cards; sides show residuals.
 * Click pushes one copy; pushStack pulls that side's tip qty into result.
 * takeResult hands the deck to the roster — nothing is written here.
 */
@Injectable({
  providedIn: 'root'
})
export class DeckMergeSession {
  private readonly vault = inject(VaultStore);

  private readonly sessionSubject = new BehaviorSubject<DeckMergeSnapshot | null>(null);
  public readonly session$ = this.sessionSubject.asObservable();

  public get snapshot(): DeckMergeSnapshot | null {
    return this.sessionSubject.value;
  }

  public open(deckId: string): Observable<DeckMergeSnapshot> {
    const id = String(deckId);
    return this.vault.fetchRecord<SyncConflictRow>(syncConflicts, id).pipe(
      switchMap((row) => {
        if (!row) {
          throw new Error(`[DeckMergeSession] No parked conflict for ${id}.`);
        }
        const theirs = mapJsonToDeck(row.theirsPayload as unknown as CloudDeckPayload);
        return this.loadYours(id).pipe(
          map((yours) => {
            const result = initialMergeResult(yours, theirs);
            const snap = this.buildSnapshot(yours, theirs, result);
            this.sessionSubject.next(snap);
            return snap;
          })
        );
      })
    );
  }

  public cancel(): void {
    this.sessionSubject.next(null);
  }

  public seedYours(): void {
    const s = this.snapshot;
    if (!s) return;
    this.publish(s.yours, s.theirs, seedResultFrom(s.yours));
  }

  public seedTheirs(): void {
    const s = this.snapshot;
    if (!s) return;
    this.publish(s.yours, s.theirs, seedResultFrom(s.theirs));
  }

  public setResultName(name: string): void {
    const s = this.snapshot;
    if (!s) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    this.publish(s.yours, s.theirs, { ...s.result, name: trimmed });
  }

  /** One copy into result, capped by that side's tip qty. */
  public addCopyFromSide(side: 'yours' | 'theirs', cardId: string): void {
    const s = this.snapshot;
    if (!s) return;
    const tip = side === 'yours' ? s.yours : s.theirs;
    const cap = tip.cards.get(cardId) || 0;
    if (cap <= 0) return;
    const cards = new Map(s.result.cards);
    const next = Math.min(cap, (cards.get(cardId) || 0) + 1);
    cards.set(cardId, next);
    this.publish(s.yours, s.theirs, { ...s.result, cards });
  }

  /** Set result qty to that side's tip qty. */
  public pushStackFromSide(side: 'yours' | 'theirs', cardId: string): void {
    const s = this.snapshot;
    if (!s) return;
    const tip = side === 'yours' ? s.yours : s.theirs;
    const qty = tip.cards.get(cardId) || 0;
    if (qty <= 0) return;
    const cards = new Map(s.result.cards);
    cards.set(cardId, qty);
    this.publish(s.yours, s.theirs, { ...s.result, cards });
  }

  public addCopy(cardId: string): void {
    const s = this.snapshot;
    if (!s) return;
    const cards = new Map(s.result.cards);
    cards.set(cardId, (cards.get(cardId) || 0) + 1);
    this.publish(s.yours, s.theirs, { ...s.result, cards });
  }

  public removeCopy(cardId: string): void {
    const s = this.snapshot;
    if (!s) return;
    const cards = new Map(s.result.cards);
    const qty = cards.get(cardId) || 0;
    if (qty <= 1) {
      cards.delete(cardId);
    } else {
      cards.set(cardId, qty - 1);
    }
    this.publish(s.yours, s.theirs, { ...s.result, cards });
  }

  /** Hand result to the roster; lock-in writes later. */
  public takeResult(): MtgDeck | null {
    const s = this.snapshot;
    if (!s) {
      return null;
    }
    const out = cloneDeck(s.result);
    this.sessionSubject.next(null);
    return out;
  }

  private loadYours(deckId: string): Observable<MtgDeck> {
    return this.vault.fetchRecord<MtgDeck>(decks, deckId).pipe(
      switchMap((local) => {
        if (!local) {
          throw new Error(`[DeckMergeSession] Missing local deck ${deckId}.`);
        }
        return this.vault.fetchCollection<DeckCardRow>(deckCards, 'all').pipe(
          map((allLines) => {
            const cardMap = new Map<string, number>();
            for (const line of allLines || []) {
              if (String(line.deckId) === deckId) {
                cardMap.set(line.cardId, line.quantity);
              }
            }
            return { ...local, cards: cardMap } as MtgDeck;
          })
        );
      })
    );
  }

  private buildSnapshot(yours: MtgDeck, theirs: MtgDeck, result: MtgDeck): DeckMergeSnapshot {
    return {
      deckId: yours.id,
      setId: yours.setId,
      yours,
      theirs,
      result,
      yoursResidual: deckFromCards(
        yours,
        residualSideCardMap(yours.cards, theirs.cards, result.cards)
      ),
      theirsResidual: deckFromCards(
        theirs,
        residualSideCardMap(theirs.cards, yours.cards, result.cards)
      )
    };
  }

  private publish(yours: MtgDeck, theirs: MtgDeck, result: MtgDeck): void {
    this.sessionSubject.next(this.buildSnapshot(yours, theirs, cloneDeck(result)));
  }
}
