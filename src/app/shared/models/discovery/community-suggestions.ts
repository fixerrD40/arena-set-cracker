import {
  isBasicLand,
  isLandCard,
  MANA_COLORS,
  ManaColor,
  collectionColors
} from '../card/arena-collection.filter';
import { parseManaPips } from '../card/card.mana';
import { MtgCard } from '../card/card';
import { MtgDeck } from '../deck/deck';
import { deckLandIdentityColors } from '../deck/deck.stats';
import { CatalogGraph } from './graph/catalog-graph';
import {
  COMMUNITY_DECK_FLOOR,
  histogramPeak,
  SetCommunity
} from './set-community';

export interface SuggestCard {
  card: MtgCard;
  puller: MtgCard;
  together: number;
  deckCount: number;
}

export interface SuggestReduce {
  card: MtgCard;
  copies: number;
  peak: number;
  deckCount: number;
}

export interface ColorFix {
  kind: 'need-fixing' | 'cut-color';
  color: ManaColor;
}

export interface CommunitySuggestions {
  suggestCard: SuggestCard | null;
  suggestReduce: SuggestReduce | null;
  colorFix: ColorFix | null;
}

export function emptyCommunitySuggestions(): CommunitySuggestions {
  return { suggestCard: null, suggestReduce: null, colorFix: null };
}

export function joinCommunitySuggestions(
  community: SetCommunity,
  deck: MtgDeck,
  catalog: readonly MtgCard[],
  remaining: readonly MtgCard[],
  graph?: CatalogGraph | null
): CommunitySuggestions {
  const byId = new Map(catalog.map((card) => [String(card.id), card]));
  return {
    suggestCard:
      community.deckCount >= COMMUNITY_DECK_FLOOR
        ? pickSuggestCard(community, deck, byId, remaining, graph)
        : null,
    suggestReduce:
      community.deckCount >= COMMUNITY_DECK_FLOOR
        ? pickSuggestReduce(community, deck, byId)
        : null,
    colorFix: pickColorFix(deck, catalog, byId)
  };
}

function pickSuggestCard(
  community: SetCommunity,
  deck: MtgDeck,
  byId: Map<string, MtgCard>,
  remaining: readonly MtgCard[],
  graph?: CatalogGraph | null
): SuggestCard | null {
  const inDeck = new Set<string>();
  deck.cards.forEach((qty, cardId) => {
    if (qty > 0) {
      inDeck.add(String(cardId));
    }
  });
  const remainingIds = new Set(remaining.map((card) => String(card.id)));
  const pairEdges = graph?.pairEdges() ?? [];

  let best: { suggestion: SuggestCard; lift: number } | null = null;
  for (const edge of pairEdges) {
    if (!inDeck.has(edge.from) || !remainingIds.has(edge.to)) {
      continue;
    }
    const card = byId.get(edge.to);
    const puller = byId.get(edge.from);
    if (!card || !puller || isBasicLand(card) || isBasicLand(puller)) {
      continue;
    }
    const together = edge.together ?? 0;
    const lift = edge.lift ?? 0;
    const suggestion: SuggestCard = {
      card,
      puller,
      together,
      deckCount: community.deckCount
    };
    if (
      !best ||
      lift > best.lift ||
      (lift === best.lift && together > best.suggestion.together) ||
      (lift === best.lift &&
        together === best.suggestion.together &&
        card.name.localeCompare(best.suggestion.card.name) < 0)
    ) {
      best = { suggestion, lift };
    }
  }
  return best?.suggestion ?? null;
}

function pickSuggestReduce(
  community: SetCommunity,
  deck: MtgDeck,
  byId: Map<string, MtgCard>
): SuggestReduce | null {
  let best: SuggestReduce | null = null;
  deck.cards.forEach((qty, cardId) => {
    if (qty <= 0) {
      return;
    }
    const card = byId.get(String(cardId));
    if (!card || isBasicLand(card)) {
      return;
    }
    const peak = histogramPeak(community.copies[String(cardId)]);
    if (peak == null || qty <= peak) {
      return;
    }
    const excess = qty - peak;
    const bestExcess = best ? best.copies - best.peak : -1;
    if (excess > bestExcess || (excess === bestExcess && card.name.localeCompare(best!.card.name) < 0)) {
      best = { card, copies: qty, peak, deckCount: community.deckCount };
    }
  });
  return best;
}

function pickColorFix(
  deck: MtgDeck,
  catalog: readonly MtgCard[],
  byId: Map<string, MtgCard>
): ColorFix | null {
  const demanded = demandedColors(deck, byId);
  const lands = deckLandIdentityColors(deck, catalog);
  const landSet = new Set(lands);
  const missing = demanded.find((color) => !landSet.has(color));
  if (missing) {
    return { kind: 'need-fixing', color: missing };
  }
  const extra = lands.find((color) => !demanded.includes(color));
  if (extra && demanded.length > 0) {
    return { kind: 'cut-color', color: extra };
  }
  return null;
}

function demandedColors(deck: MtgDeck, byId: Map<string, MtgCard>): ManaColor[] {
  const seen = new Set<ManaColor>();
  deck.cards.forEach((qty, cardId) => {
    if (qty <= 0) {
      return;
    }
    const card = byId.get(String(cardId));
    if (!card || isLandCard(card)) {
      return;
    }
    for (const color of collectionColors(card)) {
      seen.add(color);
    }
    for (const pip of parseManaPips(card.manaCost)) {
      const color = pip.toUpperCase();
      if ((MANA_COLORS as readonly string[]).includes(color)) {
        seen.add(color as ManaColor);
      }
    }
  });
  return MANA_COLORS.filter((color) => seen.has(color));
}
