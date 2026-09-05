import { inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, from, Observable, of, Subject, Subscription, throwError, forkJoin } from 'rxjs';
import { catchError, concatMap, map, shareReplay, switchMap, takeUntil, tap, toArray } from 'rxjs/operators';
import { DATA_WIRE_TOKEN } from './data-wire/data-wire.contract';

import { CloudSetPayload, MtgSet } from '../../shared/models/set/set';
import { MtgCard } from '../../shared/models/card/card';
import { CloudDeckPayload, cloneDeck, MtgDeck } from '../../shared/models/deck/deck';
import { ScryfallSet } from './api/scryfall/models/set.scryfall';
import { ScryfallCard } from './api/scryfall/models/card.scryfall';

import { mapScryfallToCard } from '../../shared/models/card/card.mappers';

import { sets, cards, decks, deckCards, DeckCardRow, DeckRow } from '../sqlite/sqlite.schema';
import { ScryfallService } from './api/scryfall/scryfall.service';
import { FileSystemService } from './file-system.service';
import { BackendService } from './backend.service';
import { mapJsonToSet, mapScryfallToDomainSet } from '../../shared/models/set/set.mappers';
import { mapJsonToDeck, mapRowToDeck } from '../../shared/models/deck/deck.mappers';

/** Live install progress for the install-set screen (card-count downloading). */
export interface SetInstallProgress {
  setName: string;
  setCode: string;
  done: number;
  total: number;
  phase: 'catalog' | 'downloading' | 'saving' | 'done';
}

/** Active set metadata plus its cards and decks for the current view. */
export interface WorkspaceState {
  setInfo: MtgSet;
  cards: MtgCard[];
  decks: MtgDeck[];
  loadedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class SetService implements OnDestroy {
  private readonly dataWire = inject(DATA_WIRE_TOKEN);
  private readonly scryfallService = inject(ScryfallService);
  private readonly fileService = inject(FileSystemService);
  private readonly backend = inject(BackendService);

  private rosterSubscription?: Subscription;
  private workspaceSubscription?: Subscription;
  private inFlightSetId: string | null = null;
  private inFlightLoad$: Observable<WorkspaceState | null> | null = null;

  private readonly installedSetsSubject = new BehaviorSubject<MtgSet[]>([]);
  public readonly installedSets$: Observable<MtgSet[]> = this.installedSetsSubject.asObservable();

  private readonly installProgressSubject = new BehaviorSubject<SetInstallProgress | null>(null);
  public readonly installProgress$: Observable<SetInstallProgress | null> =
    this.installProgressSubject.asObservable();

  private readonly installAbortSubject = new Subject<void>();
  private activeInstallSet: MtgSet | null = null;
  private cloudHydrate$: Observable<void> | null = null;

  private readonly activeContextSubject = new BehaviorSubject<WorkspaceState | null>(null);
  public readonly activeContext$: Observable<WorkspaceState | null> = this.activeContextSubject.asObservable();

  public get currentWorkspaceSnapshot(): WorkspaceState | null {
    return this.activeContextSubject.getValue();
  }

  /**
   * Pulls live JSONB documents after login/restore.
   * Catalog cards stay local (Scryfall); last-write-wins stays on the server.
   */
  public hydrateFromCloud(): Observable<void> {
    return forkJoin({
      cloudSets: this.backend.fetchCollectionFromServer<CloudSetPayload>('sets', 'all'),
      cloudDecks: this.backend.fetchCollectionFromServer<CloudDeckPayload>('decks', 'all')
    }).pipe(
      switchMap(({ cloudSets, cloudDecks }) =>
        from(cloudSets ?? []).pipe(
          concatMap((payload) => {
            const domainSet = mapJsonToSet(payload);
            return this.writeHydratedSet(domainSet).pipe(
              switchMap(() => this.ensureLocalCatalog(domainSet))
            );
          }),
          toArray(),
          switchMap(() =>
            from(cloudDecks ?? []).pipe(
              concatMap((payload) => this.persistHydratedDeck(mapJsonToDeck(payload))),
              toArray()
            )
          )
        )
      ),
      tap(() => this.syncInstalledCache()),
      map(() => void 0),
      catchError((err) => {
        console.error('[SetService] Cloud hydrate failed:', err?.message || err);
        return of(void 0);
      })
    );
  }

  public hydrateFromCloudOnce(): Observable<void> {
    if (!this.cloudHydrate$) {
      this.cloudHydrate$ = this.hydrateFromCloud().pipe(
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.cloudHydrate$;
  }

  /** Rehydrates the installed-sets list from SQLite after boot. */
  public syncInstalledCache(): void {
    this.rosterSubscription?.unsubscribe();

    this.rosterSubscription = this.dataWire.fetchCollection<MtgSet>(sets, 'all').pipe(
      tap((domainSets: MtgSet[]) => this.installedSetsSubject.next(domainSets)),
      catchError((err) => {
        console.error('[SetService] Failed to sync local roster cache:', err?.message || err);
        this.installedSetsSubject.next([]);
        return of([]);
      })
    ).subscribe();
  }

  /** Returns the current workspace if it already matches `setId`; otherwise loads it. */
  public ensureSetWorkspace(setId: string): Observable<WorkspaceState | null> {
    const current = this.currentWorkspaceSnapshot;
    if (current?.setInfo.id === setId) {
      return of(current);
    }
    return this.loadSetWorkspace(setId);
  }

  /** Loads set + cards + decks into the active workspace; falls back to Scryfall if cards are missing. */
  public loadSetWorkspace(setId: string): Observable<WorkspaceState | null> {
    if (this.inFlightSetId === setId && this.inFlightLoad$) {
      return this.inFlightLoad$;
    }

    this.workspaceSubscription?.unsubscribe();

    const load$ = this.assembleWorkspace(setId).pipe(
      tap((workspace) => {
        if (this.inFlightSetId === setId) {
          this.activeContextSubject.next(workspace);
        }
      }),
      catchError((err) => {
        console.error(`[SetService] Coordinated workspace assembly failure for set ${setId}:`, err);
        if (this.inFlightSetId === setId) {
          this.activeContextSubject.next(null);
        }
        return of(null);
      }),
      tap({
        complete: () => this.clearInFlight(setId)
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );

    this.inFlightSetId = setId;
    this.inFlightLoad$ = load$;
    this.workspaceSubscription = load$.subscribe();
    return load$;
  }

  private assembleWorkspace(setId: string): Observable<WorkspaceState> {
    return forkJoin({
      setInfo: this.dataWire.fetchRecord<MtgSet>(sets, setId),
      deckModels: this.dataWire.fetchCollection<DeckRow>(decks, setId),
      cardModels: this.dataWire.fetchCollection<MtgCard>(cards, setId),
      deckCardRows: this.dataWire.fetchCollection<DeckCardRow>(deckCards, 'all')
    }).pipe(
      switchMap(({ setInfo, deckModels, cardModels, deckCardRows }) => {
        if (!setInfo) {
          throw new Error(`[SetService] Set configuration missing on ID: ${setId}`);
        }

        const linesByDeckId = new Map<string, DeckCardRow[]>();
        for (const row of deckCardRows || []) {
          const key = String(row.deckId);
          const bucket = linesByDeckId.get(key) || [];
          bucket.push(row);
          linesByDeckId.set(key, bucket);
        }

        const userDecks: MtgDeck[] = (deckModels || []).map((deckLike) => {
          const id = String(deckLike.id);
          const lines = linesByDeckId.get(id) || [];
          const asRow = {
            id: deckLike.id,
            setId: deckLike.setId,
            name: deckLike.name,
            notes: deckLike.notes || '',
            coverCardId: deckLike.coverCardId || '',
            themes: Array.isArray(deckLike.themes) ? deckLike.themes : [],
            status: deckLike.status || 'concept',
            createdAt: deckLike.createdAt || new Date().toISOString()
          } as DeckRow;
          return mapRowToDeck(asRow, lines);
        });

        const cardSource$ =
          cardModels.length > 0
            ? of(cardModels)
            : this.scryfallService.getCardsBySet(setInfo.code.toLowerCase()).pipe(
                map((apiCards) => apiCards.map((apiCard) => mapScryfallToCard(apiCard, setId, '')))
              );

        return cardSource$.pipe(
          map((finalCards) => ({
            setInfo,
            cards: finalCards,
            decks: userDecks,
            loadedAt: new Date().toISOString()
          }))
        );
      })
    );
  }

  private ensureLocalCatalog(set: MtgSet): Observable<void> {
    return this.dataWire.fetchCollection<MtgCard>(cards, set.id).pipe(
      switchMap((existing) => {
        if (existing.length > 0) return of(void 0);

        return this.scryfallService.getCardsBySet(set.code.toLowerCase()).pipe(
          map((apiCards) =>
            apiCards
              .filter((card) => card.arena_id != null && card.collector_number)
              .map((card) => mapScryfallToCard(card, set.id, '', ''))
          ),
          switchMap((domainCards) =>
            domainCards.length === 0
              ? of([])
              : this.dataWire.insertBulk(cards, domainCards)
          ),
          map(() => void 0)
        );
      }),
      catchError((err) => {
        console.error(`[SetService] Catalog fill failed for ${set.code}:`, err?.message || err);
        return of(void 0);
      })
    );
  }

  private writeHydratedSet(set: MtgSet): Observable<MtgSet> {
    return this.dataWire.fetchRecord<MtgSet>(sets, set.id).pipe(
      switchMap((existing) =>
        existing ? this.dataWire.update(sets, set) : this.dataWire.insert(sets, set)
      )
    );
  }

  private persistHydratedDeck(deck: MtgDeck): Observable<MtgDeck> {
    return this.dataWire.fetchRecord<MtgDeck>(decks, deck.id).pipe(
      switchMap((existing) =>
        existing ? this.dataWire.update(decks, deck) : this.dataWire.insert(decks, deck)
      ),
      switchMap(() => this.dataWire.deleteWhere(deckCards, 'deckId', deck.id)),
      switchMap(() => {
        const lines = Array.from(deck.cards.entries()).map(([cardId, quantity]) => ({
          deckId: deck.id,
          cardId,
          quantity
        }));
        if (lines.length === 0) return of([]);
        return this.dataWire.insertBulk(deckCards, lines).pipe(
          catchError((err) => {
            console.error(`[SetService] Hydrated deck lines failed for ${deck.id}:`, err?.message || err);
            return of([]);
          })
        );
      }),
      map(() => deck)
    );
  }

  private clearInFlight(setId: string): void {
    if (this.inFlightSetId === setId) {
      this.inFlightSetId = null;
      this.inFlightLoad$ = null;
    }
  }

  /** Installs a set: persist metadata, download Arena-only card art, bulk-insert cards. */
  public install(scryfallSet: ScryfallSet): Observable<MtgSet> {
    const cleanCode = scryfallSet.code.toLowerCase();
    const setName = scryfallSet.name;
    const setCode = cleanCode;

    const domainSet: MtgSet = mapScryfallToDomainSet(scryfallSet);
    this.activeInstallSet = domainSet;

    const emitProgress = (partial: Omit<SetInstallProgress, 'setName' | 'setCode'>): void => {
      this.installProgressSubject.next({ setName, setCode, ...partial });
    };

    emitProgress({ phase: 'catalog', done: 0, total: 0 });

    return this.dataWire.insert<MtgSet, MtgSet>(sets, domainSet).pipe(
      switchMap(() => this.scryfallService.getCardsBySet(cleanCode)),

      switchMap((scryfallCards: ScryfallCard[]) => {
        // Arena-only strip: skip cards without arena_id
        const arenaOnlyCards = scryfallCards.filter(
          (card) => card.arena_id != null && card.collector_number
        );
        const total = arenaOnlyCards.length;
        let done = 0;

        emitProgress({ phase: 'downloading', done: 0, total });

        return from(arenaOnlyCards).pipe(
          concatMap((apiCard: ScryfallCard) => {
            const frameUrl = apiCard.normalArtworkUrl;
            const cropUrl = apiCard.illustrationArtworkUrl;
            const arenaId = apiCard.arena_id!;

            const afterCard$ =
              !frameUrl && !cropUrl
                ? of(mapScryfallToCard(apiCard, domainSet.id, '', ''))
                : forkJoin({
                    frame: this.downloadCardAsset(frameUrl, this.getCardArtPath(cleanCode, arenaId)),
                    crop: this.downloadCardAsset(cropUrl, this.getCardIllustrationPath(cleanCode, arenaId))
                  }).pipe(
                    map(({ frame, crop }) => mapScryfallToCard(apiCard, domainSet.id, frame, crop))
                  );

            return afterCard$.pipe(
              tap(() => {
                done += 1;
                emitProgress({ phase: 'downloading', done, total });
              })
            );
          }),
          toArray()
        );
      }),

      switchMap((domainCards: MtgCard[]) => {
        emitProgress({
          phase: 'saving',
          done: domainCards.length,
          total: domainCards.length
        });
        return this.dataWire.insertBulk<MtgCard, MtgCard>(cards, domainCards);
      }),

      tap(() => {
        const currentList = this.installedSetsSubject.getValue();
        if (!currentList.some(s => s.id === domainSet.id)) {
          this.installedSetsSubject.next([...currentList, domainSet]);
        }
        this.loadSetWorkspace(domainSet.id);
        this.activeInstallSet = null;
        emitProgress({
          phase: 'done',
          done: this.installProgressSubject.getValue()?.total ?? 0,
          total: this.installProgressSubject.getValue()?.total ?? 0
        });
      }),
      map(() => domainSet),
      takeUntil(this.installAbortSubject),
      catchError((err) => {
        console.error(`[SetService] Atomic install pipeline aborted for set ${scryfallSet.code}:`, err?.message || err);
        this.activeInstallSet = null;
        this.installProgressSubject.next(null);
        return throwError(() => err);
      })
    );
  }

  /** True while an install pipeline is running (before success or cancel cleanup). */
  public hasActiveInstall(): boolean {
    return this.activeInstallSet != null;
  }

  /** Stops an in-flight install and purges any partial set row / art. */
  public cancelInstall(): Observable<void> {
    const partial = this.activeInstallSet;
    this.installAbortSubject.next();
    this.installProgressSubject.next(null);
    if (!partial) {
      return of(void 0);
    }
    return this.uninstall(partial).pipe(
      tap(() => {
        this.activeInstallSet = null;
      }),
      catchError((err) => {
        this.activeInstallSet = null;
        return throwError(() => err);
      })
    );
  }

  /** Removes a set’s decks, cards, row, and on-disk art; clears workspace if that set was active. */
  public uninstall(set: MtgSet): Observable<void> {
    // FK CASCADE exists in DDL but SQLite ignores it unless PRAGMA foreign_keys=ON;
    // purge children explicitly so reinstall does not hit leftover Scryfall card PKs.
    return this.dataWire.fetchCollection<DeckRow>(decks, set.id).pipe(
      concatMap((setDecks) => {
        const clearDeckCards$ =
          setDecks.length === 0
            ? of(void 0)
            : from(setDecks).pipe(
                concatMap((deck) => this.dataWire.deleteWhere(deckCards, 'deckId', deck.id)),
                toArray(),
                map(() => void 0)
              );

        return clearDeckCards$.pipe(
          concatMap(() => this.dataWire.deleteWhere(cards, 'setId', set.id)),
          concatMap(() => this.dataWire.deleteWhere(decks, 'setId', set.id)),
          concatMap(() => this.dataWire.delete(sets, set.id)),
          concatMap(() => this.fileService.deleteDirectory(this.getSetDirectoryPath(set.code)))
        );
      }),
      tap(() => {
        const currentList = this.installedSetsSubject.getValue();
        this.installedSetsSubject.next(currentList.filter((s) => s.id !== set.id));

        const currentWorkspace = this.activeContextSubject.getValue();
        if (currentWorkspace?.setInfo.id === set.id) {
          this.unloadWorkspace();
        }
      }),
      map(() => void 0),
      catchError((err) => {
        console.error(`[SetService] Failed executing atomic uninstall for set ${set.code}:`, err);
        return throwError(() => err);
      })
    );
  }

  /** Disk folder for a set's cached card art. */
  public getSetDirectoryPath(setCode: string): string {
    return `cached_art/${setCode.toLowerCase()}`;
  }

  public getSetCoverArtPath(setCode: string): string {
    return `${this.getSetDirectoryPath(setCode)}/cover.jpg`;
  }

  public getCardArtPath(setCode: string, arenaId: number): string {
    return `${this.getSetDirectoryPath(setCode)}/${arenaId}.png`;
  }

  public getCardIllustrationPath(setCode: string, arenaId: number): string {
    return `${this.getSetDirectoryPath(setCode)}/${arenaId}-art.jpg`;
  }

  /** Resolves a WebView-safe URI for the set cover, with a packaged fallback. */
  public getSetCoverWebViewUri(setCode: string): Observable<string> {
    const targetPath = this.getSetCoverArtPath(setCode);

    return this.fileService.resolvePlatformWebViewUri(targetPath).pipe(
      catchError(() => {
        return of('');
      })
    );
  }

  public triggerCardAssetDownload(url: string, setCode: string, arenaId: number): Observable<string> {
    return this.downloadCardAsset(url, this.getCardArtPath(setCode, arenaId));
  }

  public triggerIllustrationAssetDownload(url: string, setCode: string, arenaId: number): Observable<string> {
    return this.downloadCardAsset(url, this.getCardIllustrationPath(setCode, arenaId));
  }

  private downloadCardAsset(url: string, destinationPath: string): Observable<string> {
    if (!url) {
      return of('');
    }

    return this.fileService.downloadRemoteUrlToDisk(url, destinationPath).pipe(
      catchError(() => of(url))
    );
  }

  public triggerCoverAssetDownload(remoteServerUrl: string, setCode: string): Observable<string> {
    const destinationPath = this.getSetCoverArtPath(setCode);
    const fullRemoteUrl = `${remoteServerUrl}/api/assets/covers/${setCode.toLowerCase()}.jpg`;

    return this.fileService.downloadRemoteUrlToDisk(fullRemoteUrl, destinationPath).pipe(
      catchError(() => of(''))
    );
  }

  /** Inserts or replaces a deck in the live workspace cache (used after create). */
  public upsertDeckInWorkspaceMemory(deck: MtgDeck): void {
    const current = this.currentWorkspaceSnapshot;
    if (!current) return;

    const exists = current.decks.some((d) => String(d.id) === String(deck.id));
    const updatedDecks = exists
      ? current.decks.map((d) =>
          String(d.id) === String(deck.id)
            ? cloneDeck(deck)
            : d
        )
      : [...current.decks, cloneDeck(deck)];

    this.activeContextSubject.next({
      ...current,
      decks: updatedDecks
    });
  }

  /** Updates one deck in the in-memory workspace without a disk reload. */
  public updateDeckInWorkspaceMemory(updatedDeck: MtgDeck): void {
    this.upsertDeckInWorkspaceMemory(updatedDeck);
    console.log(`[SetService] Workspace memory cache updated locally for deck: ${updatedDeck.name}`);
  }

  /** Persists active set metadata to SQLite. */
  public flush(): Observable<void> {
    const current = this.currentWorkspaceSnapshot;
    if (!current) return of(void 0);

    return this.dataWire.update<MtgSet, MtgSet>(sets, current.setInfo).pipe(
      tap(() => {
        console.log(`[SetService] Database catalog sync complete for expansion: ${current.setInfo.name}`);
      }),
      map(() => void 0),
      catchError((err) => {
        console.error(`[SetService] Catalog database flush aborted:`, err);
        return throwError(() => err);
      })
    );
  }

  public unloadWorkspace(): void {
    this.workspaceSubscription?.unsubscribe();
    this.inFlightSetId = null;
    this.inFlightLoad$ = null;
    this.activeContextSubject.next(null);
  }

  public ngOnDestroy(): void {
    this.rosterSubscription?.unsubscribe();
    this.workspaceSubscription?.unsubscribe();
  }
}
