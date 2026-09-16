import {
  Component,
  inject,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { distinctUntilChanged, shareReplay, switchMap, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { CDK_DRAG_CONFIG } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { SetService } from '../../core/services/set.service';
import { ManaColor } from '../../shared/models/card/arena-collection.filter';
import { MtgDeck } from '../../shared/models/deck/deck';
import { remainingPoolCards, remainingPoolSignature } from '../../shared/models/discovery/remaining-pool';
import { emergePatterns } from '../../shared/models/discovery/scope-emergence';
import { buildVocabularyExpansion, vocabularySignature } from '../../shared/models/discovery/vocabulary-expansion';
import { buildBoardShell, discoverPatterns } from './set.board';
import { SetBoardDrag } from './set-board-drag';
import { SetDecksDrawerComponent } from './decks/set-decks-drawer.component';
import { SetAssignmentMetricsComponent } from './metrics/set-assignment-metrics.component';
import { SetDiscoveryPoolComponent } from './discovery/set-discovery-pool.component';
import { SetPatternsPanelComponent } from './patterns/set-patterns-panel.component';
import { SetThemePreviewComponent } from './preview/set-theme-preview.component';
import { DeckCreateComponent } from '../deck/create/deck-create.component';

@Component({
  selector: 'app-set-component',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    SetDecksDrawerComponent,
    SetAssignmentMetricsComponent,
    SetDiscoveryPoolComponent,
    SetPatternsPanelComponent,
    SetThemePreviewComponent,
    DeckCreateComponent
  ],
  templateUrl: './set.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./set.css'],
  providers: [
    SetBoardDrag,
    { provide: CDK_DRAG_CONFIG, useValue: { zIndex: 4000, previewContainer: 'global' } }
  ]
})
export class SetComponent implements OnInit, OnDestroy {
  private readonly setService = inject(SetService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly drag = inject(SetBoardDrag);
  private readonly destroy$ = new Subject<void>();

  public readonly dragState = this.drag;

  public decksSidebarOpen = true;
  public showCreateDeck = false;
  public drainNeedsWork = false;
  public scopedColors: readonly ManaColor[] = [];
  public selectedTheme: string | null = null;

  private readonly colorScope$ = new BehaviorSubject<readonly ManaColor[]>([]);
  private readonly drainNeedsWork$ = new BehaviorSubject<boolean>(false);
  private readonly selectedTheme$ = new BehaviorSubject<string | null>(null);

  public readonly boardShell$ = combineLatest({
    workspace: this.setService.activeContext$,
    colors: this.colorScope$.asObservable(),
    drainNeedsWork: this.drainNeedsWork$.asObservable()
  }).pipe(
    map(({ workspace, colors, drainNeedsWork }) => buildBoardShell(workspace, colors, drainNeedsWork)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly discoveryPool$ = combineLatest({
    workspace: this.setService.activeContext$,
    colors: this.colorScope$.asObservable(),
    drainNeedsWork: this.drainNeedsWork$.asObservable()
  }).pipe(
    map(({ workspace, colors, drainNeedsWork }) =>
      workspace
        ? remainingPoolCards(workspace.cards, workspace.decks, { drainNeedsWork, colors })
        : []
    ),
    distinctUntilChanged(
      (prev, next) => remainingPoolSignature(prev) === remainingPoolSignature(next)
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly baselinePool$ = combineLatest({
    workspace: this.setService.activeContext$,
    drainNeedsWork: this.drainNeedsWork$.asObservable()
  }).pipe(
    map(({ workspace, drainNeedsWork }) =>
      workspace
        ? remainingPoolCards(workspace.cards, workspace.decks, { drainNeedsWork })
        : []
    ),
    distinctUntilChanged(
      (prev, next) => remainingPoolSignature(prev) === remainingPoolSignature(next)
    ),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly vocabulary$ = this.setService.activeContext$.pipe(
    map((workspace) => workspace?.vocabulary ?? []),
    distinctUntilChanged((prev, next) => vocabularySignature(prev) === vocabularySignature(next)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private readonly baselinePatterns$ = combineLatest({
    pool: this.baselinePool$,
    vocabulary: this.vocabulary$
  }).pipe(
    switchMap(({ pool, vocabulary }) => discoverPatterns(pool, this.ngZone, vocabulary)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  public readonly patternState$ = combineLatest({
    baseline: this.baselinePatterns$,
    scoped: this.discoveryPool$,
    colors: this.colorScope$.asObservable(),
    vocabulary: this.vocabulary$,
    workspace: this.setService.activeContext$
  }).pipe(
    map(({ baseline, scoped, colors, vocabulary, workspace }) => {
      const rankByLift = colors.length > 0;
      const expansion = buildVocabularyExpansion(vocabulary, workspace?.cards ?? []);
      return {
        loading: baseline.loading,
        scoped: rankByLift,
        patterns: baseline.loading ? [] : emergePatterns(baseline.patterns, scoped, rankByLift, expansion)
      };
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  @ViewChild('themePreview')
  private themePreview?: SetThemePreviewComponent;

  constructor() {
    effect(() => {
      if (!this.drag.peekDrawer()) {
        return;
      }
      this.decksSidebarOpen = true;
      this.drag.consumePeekDrawer();
      queueMicrotask(() => this.themePreview?.recalcLayout());
      this.cdr.markForCheck();
    });
  }

  public ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('createDeck') === '1') {
      this.showCreateDeck = true;
    }

    this.colorScope$.pipe(takeUntil(this.destroy$)).subscribe((colors) => {
      this.scopedColors = colors;
      this.cdr.markForCheck();
    });

    this.drainNeedsWork$.pipe(takeUntil(this.destroy$)).subscribe((enabled) => {
      this.drainNeedsWork = enabled;
      this.cdr.markForCheck();
    });

    this.selectedTheme$.pipe(takeUntil(this.destroy$)).subscribe((theme) => {
      this.selectedTheme = theme;
      this.cdr.markForCheck();
    });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public openCreateDeck(): void {
    this.showCreateDeck = true;
    this.cdr.markForCheck();
  }

  public onCreateDeckDismiss(): void {
    this.showCreateDeck = false;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { createDeck: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.cdr.markForCheck();
  }

  public onCreateDeckCompleted(deck: MtgDeck): void {
    this.showCreateDeck = false;
    const setId = this.setService.currentWorkspaceSnapshot?.setInfo.id;
    if (!setId) {
      return;
    }
    this.router.navigate(['/set', setId, 'deck', deck.id]);
  }

  public toggleDecksSidebar(): void {
    this.decksSidebarOpen = !this.decksSidebarOpen;
    queueMicrotask(() => this.themePreview?.recalcLayout());
  }

  public toggleColorScope(color: ManaColor): void {
    const current = this.colorScope$.value;
    const next = current.includes(color)
      ? current.filter((entry) => entry !== color)
      : [...current, color];
    this.colorScope$.next(next);
  }

  public onDrainNeedsWorkChange(enabled: boolean): void {
    this.drainNeedsWork$.next(enabled);
  }

  public toggleThemeSelection(phrase: string): void {
    const current = this.selectedTheme$.value;
    this.selectedTheme$.next(current === phrase ? null : phrase);
  }

  public clearThemeSelection(): void {
    this.selectedTheme$.next(null);
  }
}
