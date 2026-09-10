import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
  computed,
  inject,
  NgZone,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragEnd, CdkDragMove, DragDropModule } from '@angular/cdk/drag-drop';
import { MtgCard } from '../../../shared/models/card/card';
import { MtgDeck } from '../../../shared/models/deck/deck';
import { compareArenaDeckList } from '../../../shared/models/card/arena-collection.filter';
import { manaPipAsset } from '../../../shared/models/card/card.mana';
import { CONSTRUCTED_DECK_SIZE } from '../../../shared/models/deck/deck.copy-limit';
import {
  deckRowManaPips,
  deckRowTone,
  deckRowToneStyle,
  summarizeDeck
} from '../../../shared/models/deck/deck.stats';
import { isDragGesture } from '../../../shared/drag/drag.utils';

export type MergePaneKind = 'yours' | 'theirs' | 'result';

export interface MergePaneLine {
  card: MtgCard;
  quantity: number;
}

export interface MergeDragPayload {
  cardId: string;
  quantity: number;
  side: 'yours' | 'theirs';
}

@Component({
  selector: 'app-deck-merge-pane',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './deck-merge-pane.html',
  styleUrls: ['./deck-merge-pane.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeckMergePaneComponent {
  private readonly ngZone = inject(NgZone);
  private readonly pointerDrag = signal(false);
  private dropTargetHot = false;

  public readonly title = input.required<string>();
  public readonly pane = input.required<MergePaneKind>();
  public readonly deck = input.required<MtgDeck>();
  public readonly catalog = input.required<MtgCard[]>();
  public readonly dropHot = input(false);

  public readonly addCopy = output<string>();
  public readonly removeCopy = output<string>();
  public readonly rename = output<string>();
  public readonly pushStack = output<string>();
  public readonly dragHover = output<boolean>();
  public readonly stackDropped = output<MergeDragPayload>();

  public readonly constructedSize = CONSTRUCTED_DECK_SIZE;
  public readonly manaPipAsset = manaPipAsset;
  public readonly deckRowManaPips = deckRowManaPips;
  public readonly deckRowTone = deckRowTone;
  public readonly deckRowToneStyle = deckRowToneStyle;

  public readonly isResult = computed(() => this.pane() === 'result');
  public readonly isSide = computed(() => !this.isResult());

  public readonly lines = computed((): MergePaneLine[] => {
    const deck = this.deck();
    const catalog = this.catalog();
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const rows: MergePaneLine[] = [];
    for (const [cardId, quantity] of deck.cards.entries()) {
      if (quantity <= 0) continue;
      const card =
        byId.get(cardId) ??
        ({
          id: cardId,
          setId: deck.setId,
          name: cardId,
          arenaId: 0,
          collectorNumber: '',
          scryfallId: '',
          localArtUri: '',
          localIllustrationUri: '',
          typeLine: '',
          colors: [],
          rarity: '',
          manaCost: '',
          oracleText: '',
          keywords: [],
          power: '',
          toughness: ''
        } satisfies MtgCard);
      rows.push({ card, quantity });
    }
    rows.sort((a, b) => compareArenaDeckList(a.card, b.card));
    return rows;
  });

  public readonly summary = computed(() => summarizeDeck(this.lines()));

  public onRowClick(cardId: string): void {
    if (this.pointerDrag()) return;
    if (this.isResult()) {
      this.removeCopy.emit(cardId);
      return;
    }
    this.addCopy.emit(cardId);
  }

  public onQtyClick(cardId: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isResult()) {
      this.addCopy.emit(cardId);
      return;
    }
    this.pushStack.emit(cardId);
  }

  public onRenameBlur(value: string): void {
    if (!this.isResult()) return;
    this.rename.emit(value);
  }

  public dragData(line: MergePaneLine): MergeDragPayload | null {
    const pane = this.pane();
    if (pane === 'result') return null;
    return { cardId: line.card.id, quantity: line.quantity, side: pane };
  }

  public onDragStarted(): void {
    this.pointerDrag.set(true);
  }

  public onDragMoved(event: CdkDragMove<MergeDragPayload | null>): void {
    this.ngZone.run(() => {
      const el = document.elementFromPoint(
        event.pointerPosition.x,
        event.pointerPosition.y
      );
      this.dropTargetHot = !!el?.closest('[data-merge-drop="result"]');
      this.dragHover.emit(this.dropTargetHot);
    });
  }

  public onDragEnded(event: CdkDragEnd<MergeDragPayload | null>): void {
    const hot = this.dropTargetHot;
    this.dropTargetHot = false;
    this.dragHover.emit(false);
    // Deferred so the originating click does not fire after drop.
    window.setTimeout(() => this.pointerDrag.set(false), 0);

    if (!isDragGesture(event.distance)) return;
    const payload = event.source.data;
    if (!payload || !hot) return;
    this.stackDropped.emit(payload);
  }
}
