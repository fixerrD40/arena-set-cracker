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
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DeckMergeSession } from '../../../core/services/deck-merge.session';
import { SetService } from '../../../core/services/set.service';
import {
  DeckMergePaneComponent,
  MergeDragPayload
} from './deck-merge-pane.component';
import { cards } from '../../../core/sqlite/sqlite.schema';
import { VaultStore } from '../../../core/services/vault/vault.store';
import { MtgCard } from '../../../shared/models/card/card';
import { MtgDeck } from '../../../shared/models/deck/deck';

export interface DeckMergeDialogData {
  deckId: string;
}

@Component({
  selector: 'app-deck-merge-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, DeckMergePaneComponent],
  templateUrl: './deck-merge-dialog.html',
  styleUrls: ['./deck-merge.css', './deck-merge-dialog.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeckMergeDialogComponent implements OnInit, OnDestroy {
  private readonly data = inject<DeckMergeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<DeckMergeDialogComponent, MtgDeck | null>);
  private readonly merge = inject(DeckMergeSession);
  private readonly setService = inject(SetService);
  private readonly vault = inject(VaultStore);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  public readonly session$ = this.merge.session$;
  public error: string | null = null;
  public resultDropHot = false;
  public catalogCards: MtgCard[] = [];

  public ngOnInit(): void {
    this.merge.open(this.data.deckId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (snap) => {
        this.loadCatalog(snap.setId);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error = err?.message || 'Could not open merge.';
        this.cdr.markForCheck();
      }
    });
    this.session$.pipe(takeUntil(this.destroy$)).subscribe(() => this.cdr.markForCheck());
  }

  public ngOnDestroy(): void {
    this.merge.cancel();
    this.destroy$.next();
    this.destroy$.complete();
  }

  public catalog(): MtgCard[] {
    const workspace = this.setService.currentWorkspaceSnapshot;
    if (workspace?.cards?.length) {
      return workspace.cards;
    }
    return this.catalogCards;
  }

  public residualsCleared(session: {
    yoursResidual: { cards: Map<string, number> };
    theirsResidual: { cards: Map<string, number> };
  }): boolean {
    return session.yoursResidual.cards.size === 0 && session.theirsResidual.cards.size === 0;
  }

  public seedYours(): void {
    this.merge.seedYours();
  }

  public seedTheirs(): void {
    this.merge.seedTheirs();
  }

  public onSideAdd(side: 'yours' | 'theirs', cardId: string): void {
    this.merge.addCopyFromSide(side, cardId);
  }

  public onSidePushStack(side: 'yours' | 'theirs', cardId: string): void {
    this.merge.pushStackFromSide(side, cardId);
  }

  public onStackDropped(payload: MergeDragPayload): void {
    this.resultDropHot = false;
    this.merge.pushStackFromSide(payload.side, payload.cardId);
  }

  public onDragHover(hot: boolean): void {
    this.resultDropHot = hot;
    this.cdr.markForCheck();
  }

  public onResultAdd(cardId: string): void {
    this.merge.addCopy(cardId);
  }

  public onResultRemove(cardId: string): void {
    this.merge.removeCopy(cardId);
  }

  public onRename(name: string): void {
    this.merge.setResultName(name);
  }

  /** Leave the nested merge; parks stay; parent roster remains. */
  public back(): void {
    this.merge.cancel();
    this.dialogRef.close(null);
  }

  /** Hand result to the roster — nothing written until Lock in. */
  public done(): void {
    const deck = this.merge.takeResult();
    if (!deck) {
      this.error = 'Nothing to save.';
      this.cdr.markForCheck();
      return;
    }
    this.dialogRef.close(deck);
  }

  private loadCatalog(setId: string): void {
    this.vault.fetchCollection<MtgCard>(cards, setId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (rows) => {
        this.catalogCards = rows || [];
        this.cdr.markForCheck();
      }
    });
  }
}
