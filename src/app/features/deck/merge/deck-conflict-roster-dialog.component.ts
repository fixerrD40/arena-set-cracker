import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, Subject, from, of } from 'rxjs';
import { catchError, concatMap, takeUntil, tap, toArray } from 'rxjs/operators';
import {
  DeckConflictService,
  DeckConflictView
} from '../../../core/services/deck-conflict.service';
import { SetService } from '../../../core/services/set.service';
import { MtgDeck, cloneDeck } from '../../../shared/models/deck/deck';

export interface DeckConflictRosterData {
  /** When set, open that deck's merge pane after the roster is showing. */
  mergeDeckId?: string;
  /** Nested merge opener — provided by DeckMergeUi to avoid a circular inject. */
  openMerge: (deckId: string) => void;
}

type StagedChoice =
  | { kind: 'yours' }
  | { kind: 'theirs' }
  | { kind: 'merge'; deck: MtgDeck };

export interface StagedChoiceRow {
  deckId: string;
  name: string;
  label: string;
}

/**
 * Parent conflict surface. Choices are staged until the user confirms lock-in.
 * × discards the staged batch; parks stay until Lock in.
 */
@Component({
  selector: 'app-deck-conflict-roster-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './deck-conflict-roster-dialog.html',
  styleUrls: ['./deck-conflict-roster-dialog.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeckConflictRosterDialogComponent implements OnInit, OnDestroy {
  private readonly data = inject<DeckConflictRosterData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<DeckConflictRosterDialogComponent, 'dismiss' | 'cleared'>
  );
  private readonly conflicts = inject(DeckConflictService);
  private readonly setService = inject(SetService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  /** Parks present when this window opened — session scope. */
  private baseline: DeckConflictView[] = [];
  private readonly staged = new Map<string, StagedChoice>();

  public list: DeckConflictView[] = [];
  public stagedRows: StagedChoiceRow[] = [];
  public committing = false;
  private diveScheduled = false;
  private baselineReady = false;

  public get readyToCommit(): boolean {
    return (
      this.baseline.length > 0 &&
      this.list.length === 0 &&
      this.staged.size === this.baseline.length
    );
  }

  public ngOnInit(): void {
    this.conflicts.conflicts$.pipe(takeUntil(this.destroy$)).subscribe((list) => {
      if (!this.baselineReady) {
        this.baseline = [...list];
        this.baselineReady = true;
        this.rebuildList();
        if (this.baseline.length === 0) {
          this.dialogRef.close('cleared');
          return;
        }
        if (!this.diveScheduled && this.data.mergeDeckId) {
          this.diveScheduled = true;
          const id = this.data.mergeDeckId;
          queueMicrotask(() => this.data.openMerge(id));
        }
        return;
      }
      if (!this.committing && list.length === 0 && this.staged.size === 0) {
        this.dialogRef.close('cleared');
      }
    });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** × ripcord — drop every staged choice; parks untouched. */
  public dismiss(): void {
    if (this.committing) return;
    this.staged.clear();
    this.dialogRef.close('dismiss');
  }

  public acceptYours(row: DeckConflictView): void {
    this.stage(row.deckId, { kind: 'yours' });
  }

  public acceptTheirs(row: DeckConflictView): void {
    this.stage(row.deckId, { kind: 'theirs' });
  }

  public merge(row: DeckConflictView): void {
    this.data.openMerge(row.deckId);
  }

  /** Nested merge Done — stage only; user confirms lock-in on the roster. */
  public stageMerge(deck: MtgDeck): void {
    this.stage(deck.id, { kind: 'merge', deck: cloneDeck(deck) });
  }

  /** Clear staged choices but stay on the roster (change mind before lock-in). */
  public changeChoices(): void {
    if (this.committing) return;
    this.staged.clear();
    this.rebuildList();
  }

  public confirmLockIn(): void {
    this.lockIn();
  }

  private stage(deckId: string, choice: StagedChoice): void {
    if (this.committing) return;
    this.staged.set(deckId, choice);
    this.rebuildList();
  }

  private rebuildList(): void {
    this.list = this.baseline.filter((row) => !this.staged.has(row.deckId));
    this.stagedRows = this.baseline
      .filter((row) => this.staged.has(row.deckId))
      .map((row) => {
        const choice = this.staged.get(row.deckId)!;
        const name =
          choice.kind === 'merge' ? choice.deck.name || row.name : row.name;
        return {
          deckId: row.deckId,
          name,
          label:
            choice.kind === 'yours'
              ? 'Accept yours'
              : choice.kind === 'theirs'
                ? 'Accept theirs'
                : 'Merged'
        };
      });
    this.cdr.markForCheck();
  }

  /**
   * Firm baseline: apply every staged choice locally, clear parks, close.
   * Cloud push is background — do not reopen conflict UX on sync failure.
   */
  private lockIn(): void {
    if (this.committing) return;
    if (
      this.baseline.length === 0 ||
      this.staged.size !== this.baseline.length ||
      this.list.length > 0
    ) {
      return;
    }
    this.committing = true;
    this.cdr.markForCheck();

    from(this.baseline)
      .pipe(
        concatMap((row) =>
          this.applyStaged(row).pipe(
            catchError((err) => {
              console.error(`[DeckConflictRoster] Lock-in failed for ${row.deckId}:`, err);
              return of(null);
            })
          )
        ),
        toArray(),
        tap(() => this.conflicts.flushAfterLockIn()),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.staged.clear();
          this.committing = false;
          this.dialogRef.close('cleared');
        },
        error: (err) => {
          console.error('[DeckConflictRoster] Lock-in aborted:', err);
          this.staged.clear();
          this.committing = false;
          this.conflicts.flushAfterLockIn();
          this.dialogRef.close('cleared');
        }
      });
  }

  private applyStaged(row: DeckConflictView): Observable<MtgDeck | null> {
    const choice = this.staged.get(row.deckId);
    if (!choice) {
      return of(null);
    }
    const opts = { flush: 'none' as const };
    let work$: Observable<MtgDeck | null>;
    if (choice.kind === 'yours') {
      work$ = this.conflicts.resolveYours(row.deckId, opts);
    } else if (choice.kind === 'theirs') {
      work$ = this.conflicts.resolveTheirs(row.deckId, opts);
    } else {
      work$ = this.conflicts.resolveWithResult(choice.deck, opts);
    }
    return work$.pipe(
      tap((deck) => {
        if (deck) {
          this.setService.updateDeckInWorkspaceMemory(deck);
        }
      })
    );
  }
}
