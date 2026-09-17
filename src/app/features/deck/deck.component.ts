import { Component, ElementRef, inject, NgZone, OnDestroy, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { DeckService } from '../../core/services/deck.service';
import { SetService } from '../../core/services/set.service';
import { CommunityService } from '../../core/services/community.service';
import { DeckValidationResult } from '../../shared/models/deck/deck';
import { Color, ColorDisplayNames } from '../../shared/models/color';
import { remainingPoolCards } from '../../shared/models/discovery/remaining-pool';
import {
  CommunitySuggestions,
  emptyCommunitySuggestions,
  joinCommunitySuggestions
} from '../../shared/models/discovery/community-suggestions';
import {
  ArenaCollectionFilter,
  COLLECTION_RARITIES,
  CollectionRarity,
  MANA_COLORS,
  ManaColor,
  cardMatchesArenaCollectionFilter,
  compareArenaCollection,
  emptyArenaCollectionFilter
} from '../../shared/models/card/arena-collection.filter';
import { CMC_BUCKETS, CmcBucket } from '../../shared/models/card/card.mana';
import { MtgCard } from '../../shared/models/card/card';
import { pickThemeFeeds, VocabularyFeed } from '../../shared/models/discovery/insights/neighbors';
import { vocabularyPhraseKey } from '../../shared/models/discovery/graph/phrase-key';
import { showsInfinityCopyMark } from '../../shared/models/deck/deck.copy-limit';
import { summarizeDeck } from '../../shared/models/deck/deck.stats';
import { buildThemeLaneColumns } from '../../shared/models/discovery/theme-lanes';
import { DeckDetailsComponent } from './details/deck-details.component';
import { DeckContentsComponent } from './contents/deck-contents.component';
import { DeckThemeStageComponent } from './theme/deck-theme-stage.component';
import { CDK_DRAG_CONFIG, CdkDragEnd, CdkDragMove, DragDropModule } from '@angular/cdk/drag-drop';
import { DeckBuilderDrag, DeckDragPayload, isDragGesture } from './deck.drag';
import { CardHoverPreviewComponent } from '../../shared/ui/card-hover-preview/card-hover-preview.component';
import {
  CARD_HOVER_GAP_TIGHT,
  placeCardHoverPreview,
  prefersFineHover
} from '../../shared/ui/card-hover-preview/card-hover-preview.layout';

@Component({
  selector: 'app-deck',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    DragDropModule,
    DeckDetailsComponent,
    DeckContentsComponent,
    DeckThemeStageComponent,
    CardHoverPreviewComponent
  ],
  providers: [
    DeckBuilderDrag,
    { provide: CDK_DRAG_CONFIG, useValue: { zIndex: 4000, previewContainer: 'global' } }
  ],
  templateUrl: './deck.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./deck.css']
})
export class DeckComponent implements OnDestroy {
  private readonly deckService = inject(DeckService);
  private readonly setService = inject(SetService);
  private readonly community = inject(CommunityService);
  private readonly router = inject(Router);
  public readonly drag = inject(DeckBuilderDrag);
  private readonly ngZone = inject(NgZone);

  @ViewChild(DeckContentsComponent) private contents?: DeckContentsComponent;
  @ViewChild(DeckDetailsComponent) private detailsPanel?: DeckDetailsComponent;
  @ViewChild('collectionStage')
  set collectionStage(ref: ElementRef<HTMLElement> | undefined) {
    this.unbindCollectionWheel();
    this.collectionStageEl = ref?.nativeElement;
    this.bindCollectionWheel();
  }

  public readonly manaColors = MANA_COLORS;
  public readonly rarities = COLLECTION_RARITIES;
  public readonly cmcBuckets = CMC_BUCKETS;
  public extrasOpen = false;
  public readonly showsInfinityCopyMark = showsInfinityCopyMark;
  public readonly copyPips = [1, 2, 3, 4] as const;
  public readonly collectionPageSize = 8;

  public filter: ArenaCollectionFilter = emptyArenaCollectionFilter();
  public builderPage: 'library' | 'theme' | 'suggestions' = 'library';
  public selectedTheme: string | null = null;
  public screen: 'builder' | 'details' = 'builder';
  public hoveredCard: MtgCard | null = null;
  public previewTop = 0;
  public previewLeft = 0;
  public previewWidth = 0;

  private readonly collectionFilter$ = new BehaviorSubject<ArenaCollectionFilter>(this.filter);
  private readonly selectedTheme$ = new BehaviorSubject<string | null>(null);
  private readonly collectionPage$ = new BehaviorSubject(0);
  private collectionStageEl?: HTMLElement;
  private collectionPageIndex = 0;
  private collectionPageCount = 1;
  private wheelGate = false;

  public readonly scratchpadDeck$ = this.deckService.scratchpadDeck$;
  public readonly workspace$ = this.setService.activeContext$;

  public readonly filteredCards$ = combineLatest({
    lines: this.deckService.catalogLines$,
    filter: this.collectionFilter$,
    graph: this.setService.catalogGraph$
  }).pipe(
    map(({ lines, filter, graph }) => {
      return lines
        .filter((line) => cardMatchesArenaCollectionFilter(line.card, { ...filter, theme: null }, graph))
        .sort((a, b) => compareArenaCollection(a.card, b.card));
    })
  );

  public readonly themeStage$ = combineLatest({
    lines: this.deckService.catalogLines$,
    filter: this.collectionFilter$,
    theme: this.selectedTheme$,
    graph: this.setService.catalogGraph$
  }).pipe(
    map(({ lines, filter, theme, graph }) => {
      if (!theme) {
        return { theme: null, columns: [] };
      }
      const members = lines.filter((line) =>
        cardMatchesArenaCollectionFilter(line.card, { ...filter, theme }, graph)
      );
      return {
        theme,
        columns: buildThemeLaneColumns(members, theme, graph)
      };
    })
  );

  public readonly communitySuggestions$ = combineLatest({
    community: this.community.community$,
    deck: this.deckService.scratchpadDeck$,
    workspace: this.workspace$,
    graph: this.setService.catalogGraph$
  }).pipe(
    map(({ community, deck, workspace, graph }): CommunitySuggestions => {
      if (!community || !deck || !workspace) {
        return emptyCommunitySuggestions();
      }
      return joinCommunitySuggestions(
        community,
        deck,
        workspace.cards,
        remainingPoolCards(workspace.cards, workspace.decks),
        graph
      );
    })
  );

  public readonly themeFeeds$ = combineLatest({
    deck: this.deckService.scratchpadDeck$,
    graph: this.setService.catalogGraph$
  }).pipe(
    map(({ deck, graph }): VocabularyFeed[] => {
      if (!deck) {
        return [];
      }
      return pickThemeFeeds(graph, deck.themes);
    })
  );

  public readonly suggestionsBoard$ = combineLatest({
    suggestions: this.communitySuggestions$,
    feeds: this.themeFeeds$
  });

  public readonly collectionPageView$ = combineLatest({
    cards: this.filteredCards$,
    page: this.collectionPage$
  }).pipe(
    map(({ cards, page }) => {
      const pageCount = Math.max(1, Math.ceil(cards.length / this.collectionPageSize));
      const safePage = Math.min(Math.max(0, page), pageCount - 1);
      const start = safePage * this.collectionPageSize;
      this.collectionPageIndex = safePage;
      this.collectionPageCount = pageCount;
      return {
        cards: cards.slice(start, start + this.collectionPageSize),
        page: safePage,
        pageCount,
        total: cards.length
      };
    })
  );

  public readonly deckSummary$ = this.deckService.catalogLines$.pipe(
    map((lines) => summarizeDeck(lines.filter((line) => line.quantity > 0)))
  );

  public ngOnDestroy(): void {
    this.unbindCollectionWheel();
    if (!this.router.url.includes('/deck/')) {
      this.deckService.clearActiveDeck();
    }
  }

  public colorLabel(color: ManaColor): string {
    return ColorDisplayNames[color];
  }

  public isColorOn(color: ManaColor): boolean {
    return this.filter.colors.includes(color);
  }

  public toggleManaColor(color: ManaColor): void {
    const colors = this.isColorOn(color)
      ? this.filter.colors.filter((entry) => entry !== color)
      : [...this.filter.colors, color];
    this.pushFilter({ ...this.filter, colors });
  }

  public toggleColorless(): void {
    this.pushFilter({ ...this.filter, colorless: !this.filter.colorless });
  }

  public toggleMulticolor(): void {
    this.pushFilter({ ...this.filter, multicolor: !this.filter.multicolor });
  }

  public toggleLand(): void {
    this.pushFilter({ ...this.filter, land: !this.filter.land });
  }

  public isRarityOn(rarity: CollectionRarity): boolean {
    return this.filter.rarities.includes(rarity);
  }

  public toggleRarity(rarity: CollectionRarity): void {
    const rarities = this.isRarityOn(rarity)
      ? this.filter.rarities.filter((entry) => entry !== rarity)
      : [...this.filter.rarities, rarity];
    this.pushFilter({ ...this.filter, rarities });
  }

  public isCmcOn(bucket: CmcBucket): boolean {
    return this.filter.cmcBuckets.includes(bucket);
  }

  public toggleCmc(bucket: CmcBucket): void {
    const cmcBuckets = this.isCmcOn(bucket)
      ? this.filter.cmcBuckets.filter((entry) => entry !== bucket)
      : [...this.filter.cmcBuckets, bucket];
    this.pushFilter({ ...this.filter, cmcBuckets });
  }

  public isThemeApplied(theme: string): boolean {
    return this.selectedTheme === theme;
  }

  public applyTheme(theme: string): void {
    this.selectedTheme = this.selectedTheme === theme ? null : theme;
    this.selectedTheme$.next(this.selectedTheme);
  }

  public reviewTheme(theme: string): void {
    this.selectedTheme = theme;
    this.selectedTheme$.next(theme);
    this.openBuilderPage('theme');
  }

  public reviewFeed(feed: VocabularyFeed): void {
    const attached = new Set(
      (this.deckService.scratchpadValue?.themes ?? []).map((theme) => vocabularyPhraseKey(theme))
    );
    this.reviewTheme(attached.has(feed.feeder) ? feed.feeds : feed.feeder);
  }

  public openBuilderPage(page: 'library' | 'theme' | 'suggestions'): void {
    this.builderPage = page;
    if (page === 'theme' && !this.selectedTheme) {
      const attached = this.deckService.scratchpadValue?.themes ?? [];
      if (attached[0]) {
        this.selectedTheme = attached[0];
        this.selectedTheme$.next(attached[0]);
      }
    }
  }

  public colorName(color: string): string {
    return ColorDisplayNames[color as Color] ?? color;
  }

  public extrasActive(): boolean {
    return this.filter.rarities.length > 0 || this.filter.cmcBuckets.length > 0;
  }

  public toggleExtras(): void {
    this.extrasOpen = !this.extrasOpen;
  }

  public onCollectionTextChange(text: string): void {
    this.pushFilter({ ...this.filter, text });
  }

  public clearCollectionText(): void {
    this.onCollectionTextChange('');
  }

  private pushFilter(next: ArenaCollectionFilter): void {
    this.filter = next;
    this.collectionFilter$.next(next);
    this.collectionPage$.next(0);
  }

  public nextCollectionPage(): void {
    if (this.collectionPageIndex + 1 < this.collectionPageCount) {
      this.collectionPage$.next(this.collectionPageIndex + 1);
    }
  }

  public prevCollectionPage(): void {
    if (this.collectionPageIndex > 0) {
      this.collectionPage$.next(this.collectionPageIndex - 1);
    }
  }

  public onCollectionKeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault();
      this.nextCollectionPage();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      this.prevCollectionPage();
    }
  }

  private bindCollectionWheel(): void {
    this.collectionStageEl?.addEventListener('wheel', this.onCollectionWheelNative, { passive: false });
  }

  private unbindCollectionWheel(): void {
    this.collectionStageEl?.removeEventListener('wheel', this.onCollectionWheelNative);
  }

  private readonly onCollectionWheelNative = (event: WheelEvent): void => {
    event.preventDefault();
    if (this.wheelGate || event.deltaY === 0) return;
    this.wheelGate = true;
    window.setTimeout(() => {
      this.wheelGate = false;
    }, 90);
    if (event.deltaY > 0) this.nextCollectionPage();
    else this.prevCollectionPage();
  };

  public openDetails(): void {
    this.screen = 'details';
  }

  public backToBuilder(): void {
    this.screen = 'builder';
  }

  public collectionDrag(card: MtgCard): DeckDragPayload {
    return { card, source: 'collection' };
  }

  public showCollectionPreview(event: MouseEvent, card: MtgCard): void {
    if (this.drag.pointerDrag() || !prefersFineHover()) return;

    const tile = event.currentTarget as HTMLElement;
    const face = tile.querySelector('img, .card-fallback');
    const stageBox = this.collectionStageEl?.getBoundingClientRect();
    const anchor = (face instanceof HTMLElement ? face : tile).getBoundingClientRect();
    const inset = 8;
    const bandY = stageBox
      ? { top: stageBox.top, bottom: stageBox.bottom }
      : { top: inset, bottom: window.innerHeight - inset };
    const box = placeCardHoverPreview({
      mode: 'beside',
      side: 'right',
      anchor,
      bandY,
      gap: CARD_HOVER_GAP_TIGHT,
      viewportHeight: window.innerHeight
    });

    this.hoveredCard = card;
    this.previewTop = box.top;
    this.previewLeft = box.left;
    this.previewWidth = box.width;
  }

  public clearCollectionPreview(): void {
    this.hoveredCard = null;
  }

  public handleIncrementCard(card: MtgCard): void {
    if (this.drag.pointerDrag()) return;
    this.deckService.addCopy(card);
  }

  public onCardDragStarted(): void {
    this.drag.started();
    this.hoveredCard = null;
  }

  public onCardDragMoved(event: CdkDragMove<DeckDragPayload>): void {
    this.ngZone.run(() => this.drag.hover(event.event));
  }

  public onCardDragEnded(event: CdkDragEnd<DeckDragPayload>): void {
    const zone = this.drag.zone();
    this.drag.clear();
    this.drag.ended();

    if (!isDragGesture(event.distance)) return;

    const payload = event.source.data;
    const card = payload?.card;
    if (!card) return;

    if (zone === 'cover') {
      this.deckService.setCoverCard(String(card.id));
    } else if (zone === 'list' && payload.source === 'collection') {
      this.deckService.addCopy(card);
    }
  }

  public runDeckValidations(): DeckValidationResult {
    const current = this.deckService.scratchpadValue;

    if (!current) {
      return { valid: false, errors: ['No active workspace dataset parsing frame available.'] };
    }

    const result: DeckValidationResult = { valid: true, errors: [] };

    if (!current.name || current.name.trim().length === 0) {
      result.valid = false;
      result.errors.push('Deck profile name descriptor string cannot be left blank.');
    }

    if (this.contents?.renaming || this.detailsPanel?.renaming) {
      result.valid = false;
      result.errors.push('Cannot lock down record while sub-form input controllers are active.');
    }

    return result;
  }
}
