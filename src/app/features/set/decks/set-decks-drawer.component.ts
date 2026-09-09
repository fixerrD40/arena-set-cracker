import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  input,
  NgZone,
  OnDestroy,
  output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragEnd,
  CdkDragMove,
  DragDropModule
} from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { DeckService } from '../../../core/services/deck.service';
import { SetService } from '../../../core/services/set.service';
import { DeckConflictService } from '../../../core/services/deck-conflict.service';
import { DeckMergeUi } from '../../../core/services/deck-merge-ui.service';
import {
  DECK_STATUSES,
  DECK_STATUS_LABELS,
  DeckStatus,
  MtgDeck
} from '../../../shared/models/deck/deck';
import { ManaColor } from '../../../shared/models/card/arena-collection.filter';
import { deckLandIdentityColors } from '../../../shared/models/deck/deck.stats';
import { manaPipAsset } from '../../../shared/models/card/card.mana';
import { Color, ColorDisplayNames } from '../../../shared/models/color';
import { DeckThemeDragPayload, isDeckDragData } from '../set.board';
import { SetBoardDrag } from '../set-board-drag';

@Component({
  selector: 'app-set-decks-drawer',
  standalone: true,
  imports: [CommonModule, DragDropModule, MatButtonModule, MatIconModule],
  templateUrl: './set-decks-drawer.html',
  styleUrls: ['./set-decks-drawer.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetDecksDrawerComponent implements OnDestroy {
  private readonly deckService = inject(DeckService);
  private readonly setService = inject(SetService);
  private readonly deckConflicts = inject(DeckConflictService);
  private readonly deckMergeUi = inject(DeckMergeUi);
  private readonly router = inject(Router);
  private readonly drag = inject(SetBoardDrag);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  public readonly decksByStatus = input.required<Record<DeckStatus, MtgDeck[]>>();
  public readonly selectedTheme = input<string | null>(null);

  public readonly closeSidebar = output<void>();
  public readonly themeSelect = output<string>();
  public readonly createDeck = output<void>();

  public readonly deckStatuses = DECK_STATUSES;
  public readonly deckStatusDropIds = DECK_STATUSES.map((status) => `deck-status-${status}`);
  public readonly statusLabels = DECK_STATUS_LABELS;
  public readonly manaPipAsset = manaPipAsset;
  public readonly themeDropDeckId = this.drag.themeDropDeckId;

  public readonly acceptDeckDrag = (drag: CdkDrag<MtgDeck>): boolean => isDeckDragData(drag.data);

  constructor() {
    this.deckConflicts.conflicts$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.cdr.markForCheck();
    });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public deckHasConflict(deckId: string): boolean {
    return this.deckConflicts.hasConflict(deckId);
  }

  public openMerge(deckId: string, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.deckMergeUi.openRoster({ mergeDeckId: deckId });
  }

  public colorLabel(code: ManaColor): string {
    return ColorDisplayNames[code as Color];
  }

  public deckCardCount(deck: MtgDeck): number {
    let total = 0;
    deck.cards.forEach((qty) => {
      total += qty;
    });
    return total;
  }

  public deckLandColors(deck: MtgDeck): readonly ManaColor[] {
    const catalog = this.setService.currentWorkspaceSnapshot?.cards ?? [];
    return deckLandIdentityColors(deck, catalog);
  }

  public deckThemeDrag(deckId: string, phrase: string): DeckThemeDragPayload {
    return { deckId: String(deckId), phrase };
  }

  public onThemeChipClick(theme: string, event: Event): void {
    if (this.drag.pointerDrag()) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this.themeSelect.emit(theme);
  }

  public onDeckThemeDragStarted(): void {
    this.drag.started();
  }

  public onDeckThemeDragMoved(event: CdkDragMove<DeckThemeDragPayload>): void {
    this.ngZone.run(() => this.drag.hoverThemeReturn(event.event));
  }

  public onDeckThemeDragEnded(event: CdkDragEnd<DeckThemeDragPayload>): void {
    const { gesture, returnHot } = this.drag.endThemeReturn(event.distance, () =>
      this.cdr.markForCheck()
    );
    if (!gesture) {
      return;
    }

    const payload = event.source.data;
    if (!returnHot || !payload?.deckId || !payload.phrase.trim()) {
      return;
    }

    this.deckService
      .detachTheme(payload.deckId, payload.phrase)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  public goToAddDeck(): void {
    this.createDeck.emit();
  }

  public openDeck(deckId: string): void {
    const setId = this.setService.currentWorkspaceSnapshot?.setInfo.id;
    if (!setId) {
      return;
    }
    if (this.deckConflicts.hasConflict(deckId)) {
      this.deckMergeUi.openRoster({ mergeDeckId: deckId });
      return;
    }
    void this.router.navigate(['/set', setId, 'deck', deckId]);
  }

  public deleteDeck(deck: MtgDeck, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!confirm(`Delete deck "${deck.name}"? This cannot be undone.`)) {
      return;
    }
    this.deckService.deleteDeck(deck.id).pipe(takeUntil(this.destroy$)).subscribe({
      error: () => alert('Could not delete this deck. Please try again.')
    });
  }

  public onDeckStatusDrop(event: CdkDragDrop<DeckStatus>, targetStatus: DeckStatus): void {
    const deck = event.item.data;
    if (!isDeckDragData(deck) || deck.status === targetStatus) {
      return;
    }
    this.deckService.updateDeckStatus(deck.id, targetStatus).pipe(takeUntil(this.destroy$)).subscribe();
  }
}
