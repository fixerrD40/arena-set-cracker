import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { filter, take } from 'rxjs/operators';
import { DeckConflictService } from './deck-conflict.service';
import {
  DeckConflictRosterDialogComponent,
  DeckConflictRosterData
} from '../../features/deck/merge/deck-conflict-roster-dialog.component';
import {
  DeckMergeDialogComponent,
  DeckMergeDialogData
} from '../../features/deck/merge/deck-merge-dialog.component';
import { MtgDeck } from '../../shared/models/deck/deck';

/**
 * Conflict UI entry:
 * 1. Roster — Accept yours / theirs / Merge…; × ripcords staged choices; Lock in writes
 * 2. Nested merge — Back → roster; Done → stage result on the roster
 */
@Injectable({
  providedIn: 'root'
})
export class DeckMergeUi {
  private readonly dialog = inject(MatDialog);
  private readonly conflicts = inject(DeckConflictService);

  private rosterRef: MatDialogRef<
    DeckConflictRosterDialogComponent,
    'dismiss' | 'cleared'
  > | null = null;
  private mergeRef: MatDialogRef<DeckMergeDialogComponent, MtgDeck | null> | null = null;
  /** After × on roster, don't auto-reopen until conflicts clear. */
  private suppressAutoOpen = false;
  private watching = false;

  /** Call once from AppComponent — watch parks and open the roster. */
  public watchForConflicts(): void {
    if (this.watching) return;
    this.watching = true;

    this.conflicts.conflicts$.subscribe((list) => {
      if (list.length === 0) {
        this.suppressAutoOpen = false;
        return;
      }
      if (this.suppressAutoOpen || this.rosterRef) {
        return;
      }
      this.openRoster();
    });
  }

  /** Banner / drawer / auto-entry. Optional mergeDeckId opens that deck's merge on top. */
  public openRoster(options?: { mergeDeckId?: string }): void {
    this.suppressAutoOpen = false;

    if (this.rosterRef) {
      if (options?.mergeDeckId) {
        this.openMerge(options.mergeDeckId);
      }
      return;
    }

    this.conflicts
      .refresh()
      .pipe(
        take(1),
        filter((list) => list.length > 0)
      )
      .subscribe(() => {
        if (this.rosterRef) {
          if (options?.mergeDeckId) {
            this.openMerge(options.mergeDeckId);
          }
          return;
        }

        this.rosterRef = this.dialog.open<
          DeckConflictRosterDialogComponent,
          DeckConflictRosterData,
          'dismiss' | 'cleared'
        >(DeckConflictRosterDialogComponent, {
          data: {
            mergeDeckId: options?.mergeDeckId,
            openMerge: (deckId: string) => this.openMerge(deckId)
          },
          width: 'min(44rem, 96vw)',
          autoFocus: 'dialog',
          restoreFocus: true
        });

        this.rosterRef.afterClosed().subscribe((result) => {
          this.rosterRef = null;
          this.mergeRef?.close(null);
          this.mergeRef = null;
          if (result !== 'cleared') {
            this.suppressAutoOpen = true;
          }
        });
      });
  }

  /** Nested card merge. Back closes without staging; Done stages onto the roster. */
  public openMerge(deckId: string): void {
    if (this.mergeRef) {
      return;
    }

    if (!this.rosterRef) {
      this.openRoster({ mergeDeckId: deckId });
      return;
    }

    this.mergeRef = this.dialog.open<DeckMergeDialogComponent, DeckMergeDialogData, MtgDeck | null>(
      DeckMergeDialogComponent,
      {
        data: { deckId },
        width: '96vw',
        maxWidth: '1400px',
        maxHeight: '92vh',
        autoFocus: 'dialog',
        restoreFocus: true,
        disableClose: true
      }
    );

    this.mergeRef.afterClosed().subscribe((deck) => {
      this.mergeRef = null;
      if (deck && this.rosterRef) {
        this.rosterRef.componentInstance.stageMerge(deck);
      }
    });
  }
}
