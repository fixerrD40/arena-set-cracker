/**
 * Domain deck model. cards is a Map for O(1) quantity lookups in the UI.
 */
export const DECK_STATUSES = ['concept', 'needs-work', 'final'] as const;
export type DeckStatus = (typeof DECK_STATUSES)[number];

export const DECK_STATUS_LABELS: Record<DeckStatus, string> = {
  concept: 'Concept',
  'needs-work': 'Needs work',
  final: 'Final'
};

export function coerceDeckStatus(value: unknown): DeckStatus {
  if (value === 'final' || value === 'needs-work' || value === 'concept') {
    return value;
  }
  return 'concept';
}

export function coerceDeckThemes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export interface MtgDeck {
  id: string;
  setId: string;
  name: string;
  status: DeckStatus;
  themes: string[];
  notes: string;
  coverCardId: string;
  cards: Map<string, number>;
  /** Cloud tip clock; ISO-8601. */
  updatedAt?: string;
  /** Local merge-base tip for classifyHydrate. */
  mergeBaseUpdatedAt?: string;
}

export function cloneDeck(deck: MtgDeck): MtgDeck {
  return {
    ...deck,
    themes: [...deck.themes],
    cards: new Map(deck.cards)
  };
}

/** Cloud/REST deck shape (cards as a plain object). */
export interface CloudDeckPayload {
  id: string;
  setId: string;
  name: string;
  status?: DeckStatus;
  themes?: string[];
  notes?: string;
  coverCardId?: string;
  cards?: Record<string, number>;
  updatedAt?: string;
  createdAt?: string;
}

/** One tokenized line from an Arena export. */
export interface ParsedArenaLine {
  quantity: number;
  name: string;
  set: string;
  collectorNumber: number;
  raw: string;
}

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
}

export type CreateDeckConfig = Omit<MtgDeck, 'status' | 'themes' | 'notes' | 'coverCardId' | 'cards'> &
  Partial<Pick<MtgDeck, 'status' | 'themes' | 'notes' | 'coverCardId' | 'cards'>>;

export interface DeckDeltaPayload {
  id: string;
  changes: Partial<Omit<MtgDeck, 'id'>>;
}
