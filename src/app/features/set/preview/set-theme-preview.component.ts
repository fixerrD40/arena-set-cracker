import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  ElementRef,
  HostBinding,
  inject,
  input,
  NgZone,
  OnDestroy,
  output,
  ViewChild
} from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { BehaviorSubject, combineLatest, map } from 'rxjs';
import { shareReplay } from 'rxjs/operators';

import { MtgCard } from '../../../shared/models/card/card';
import { SetVocabulary } from '../../../shared/models/card/set-vocabulary';
import { buildVocabularyExpansion } from '../../../shared/models/discovery/vocabulary-expansion';
import { cardArtUri } from '../../../shared/models/card/card.art';
import {
  buildThemePreviewPageView,
  buildThemePreviewState,
  computeThemePreviewLayout,
  DEFAULT_THEME_PREVIEW_LAYOUT,
  ThemePreviewLayout,
  ThemePreviewPageView
} from '../set.board';
import { CardHoverPreviewComponent } from '../../../shared/ui/card-hover-preview/card-hover-preview.component';
import { contentAreaBox } from '../../../shared/ui/layout/content-area';
import {
  placeCardHoverPreview,
  prefersFineHover
} from '../../../shared/ui/card-hover-preview/card-hover-preview.layout';

@Component({
  selector: 'app-set-theme-preview',
  standalone: true,
  imports: [CommonModule, CardHoverPreviewComponent],
  templateUrl: './set-theme-preview.html',
  styleUrls: ['./set-theme-preview.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SetThemePreviewComponent implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  public readonly pool = input.required<readonly MtgCard[]>();
  public readonly vocabulary = input<readonly SetVocabulary[]>([]);
  public readonly selectedTheme = input<string | null>(null);

  public readonly themeClear = output<string>();

  public readonly cardArtUri = cardArtUri;
  public hoveredCard: MtgCard | null = null;
  public previewTop = 0;
  public previewLeft = 0;
  public previewWidth = 0;

  @HostBinding('class.docked')
  public get docked(): boolean {
    return !!this.selectedTheme();
  }

  private readonly themePreviewPage$ = new BehaviorSubject(0);
  private readonly themePreviewLayout$ = new BehaviorSubject<ThemePreviewLayout>(DEFAULT_THEME_PREVIEW_LAYOUT);
  private latestPageView: ThemePreviewPageView | null = null;
  private previewResizeObserver?: ResizeObserver;
  private previewLayoutRecalc?: () => void;
  private previewWheelGate = false;
  private themePreviewStageEl?: HTMLElement;

  private readonly pool$ = toObservable(this.pool);
  private readonly vocabulary$ = toObservable(this.vocabulary);
  private readonly selectedTheme$ = toObservable(this.selectedTheme);

  private readonly themePreview$ = combineLatest({
    pool: this.pool$,
    theme: this.selectedTheme$,
    vocabulary: this.vocabulary$
  }).pipe(
    map(({ pool, theme, vocabulary }) =>
      buildThemePreviewState(pool, theme, buildVocabularyExpansion(vocabulary ?? [], pool))
    )
  );

  public readonly pageView$ = combineLatest({
    preview: this.themePreview$,
    page: this.themePreviewPage$.asObservable(),
    layout: this.themePreviewLayout$.asObservable()
  }).pipe(
    map(({ preview, page, layout }) => {
      const view = buildThemePreviewPageView(preview, page, layout);
      this.latestPageView = view;
      return view;
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /** Field initializer: toObservable/effect need an injection context (not ngOnInit). */
  private readonly resetPageOnThemeChange = effect(() => {
    this.selectedTheme();
    this.themePreviewPage$.next(0);
    this.clearCardPreview();
  });

  @ViewChild('themePreviewStage')
  set themePreviewStageRef(ref: ElementRef<HTMLElement> | undefined) {
    this.unbindThemePreviewLayout();
    this.themePreviewStageEl = ref?.nativeElement;
    if (ref) {
      this.bindThemePreviewLayout(ref.nativeElement);
    }
  }

  public ngAfterViewInit(): void {
    this.host.nativeElement.addEventListener('wheel', this.onPreviewWheelNative, { passive: false });
  }

  public ngOnDestroy(): void {
    this.host.nativeElement.removeEventListener('wheel', this.onPreviewWheelNative);
    this.unbindThemePreviewLayout();
  }

  public recalcLayout(): void {
    this.previewLayoutRecalc?.();
  }

  private handleWheel(event: WheelEvent): boolean {
    const view = this.latestPageView;
    if (!view || view.pageCount <= 1) {
      return false;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return false;
    }

    event.preventDefault();
    if (this.previewWheelGate || event.deltaY === 0) {
      return true;
    }

    this.previewWheelGate = true;
    window.setTimeout(() => {
      this.previewWheelGate = false;
    }, 90);

    if (event.deltaY > 0) {
      this.nextPage();
    } else {
      this.prevPage();
    }
    return true;
  }

  public prevPage(): void {
    const view = this.latestPageView;
    if (view && view.page > 0) {
      this.themePreviewPage$.next(view.page - 1);
      this.clearCardPreview();
      this.cdr.markForCheck();
    }
  }

  public nextPage(): void {
    const view = this.latestPageView;
    if (view && view.page + 1 < view.pageCount) {
      this.themePreviewPage$.next(view.page + 1);
      this.clearCardPreview();
      this.cdr.markForCheck();
    }
  }

  public showCardPreview(event: MouseEvent, card: MtgCard): void {
    if (!prefersFineHover()) return;

    const tile = event.currentTarget as HTMLElement;
    const shell = contentAreaBox() ?? this.host.nativeElement.getBoundingClientRect();
    const tileBox = tile.getBoundingClientRect();
    const inset = 12;
    const bandX = { left: shell.left + inset, right: shell.right - inset };
    const bandY = { top: shell.top + inset, bottom: shell.bottom - inset };
    const box = placeCardHoverPreview({
      mode: 'band-x',
      anchor: tileBox,
      bandX,
      bandY,
      clearAnchor: 'above',
      viewportHeight: window.innerHeight
    });

    this.hoveredCard = card;
    this.previewTop = box.top;
    this.previewLeft = box.left;
    this.previewWidth = box.width;
    this.cdr.markForCheck();
  }

  public clearCardPreview(): void {
    if (!this.hoveredCard) return;
    this.hoveredCard = null;
    this.cdr.markForCheck();
  }

  private readonly onPreviewWheelNative = (event: WheelEvent): void => {
    this.ngZone.run(() => {
      this.handleWheel(event);
    });
  };

  private bindThemePreviewLayout(stage: HTMLElement): void {
    const themePreview = stage.closest('.theme-preview');

    const recalc = (): void => {
      if (stage.clientWidth <= 0 || stage.clientHeight <= 0) {
        return;
      }
      this.ngZone.run(() => {
        this.themePreviewLayout$.next(computeThemePreviewLayout(stage));
      });
    };

    this.previewLayoutRecalc = recalc;
    this.previewResizeObserver = new ResizeObserver(() => recalc());
    this.previewResizeObserver.observe(stage);
    if (themePreview instanceof HTMLElement) {
      this.previewResizeObserver.observe(themePreview);
    }
    window.addEventListener('resize', recalc, { passive: true });
    recalc();
  }

  private unbindThemePreviewLayout(): void {
    this.previewResizeObserver?.disconnect();
    this.previewResizeObserver = undefined;

    if (this.previewLayoutRecalc) {
      window.removeEventListener('resize', this.previewLayoutRecalc);
    }

    this.previewLayoutRecalc = undefined;
  }
}
