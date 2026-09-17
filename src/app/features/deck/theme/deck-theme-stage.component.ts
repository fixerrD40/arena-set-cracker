import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragEnd, CdkDragMove, DragDropModule } from '@angular/cdk/drag-drop';

import { MtgCard } from '../../../shared/models/card/card';
import { ThemeLaneColumn } from '../../../shared/models/discovery/theme-lanes';
import { showsInfinityCopyMark } from '../../../shared/models/deck/deck.copy-limit';
import { DeckDragPayload } from '../deck.drag';

export interface ThemeStageLine {
  card: MtgCard;
  quantity: number;
}

@Component({
  selector: 'app-deck-theme-stage',
  standalone: true,
  imports: [CommonModule, DragDropModule],
  templateUrl: './deck-theme-stage.html',
  styleUrls: ['./deck-theme-stage.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeckThemeStageComponent {
  public readonly theme = input.required<string>();
  public readonly columns = input.required<readonly ThemeLaneColumn<ThemeStageLine>[]>();

  public readonly addCard = output<MtgCard>();
  public readonly cardEnter = output<{ event: MouseEvent; card: MtgCard }>();
  public readonly cardLeave = output<void>();
  public readonly dragStart = output<void>();
  public readonly dragMove = output<CdkDragMove<DeckDragPayload>>();
  public readonly dragEnd = output<CdkDragEnd<DeckDragPayload>>();

  public readonly showsInfinityCopyMark = showsInfinityCopyMark;
  public readonly copyPips = [1, 2, 3, 4] as const;

  public collectionDrag(card: MtgCard): DeckDragPayload {
    return { card, source: 'collection' };
  }
}
