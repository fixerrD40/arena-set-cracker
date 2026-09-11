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
import {
  COMMUNITY_DECK_FLOOR,
  COMMUNITY_PAIR_TOGETHER_FLOOR,
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
  remaining: readonly MtgCard[]
): CommunitySuggestions {
  const byId = new Map(catalog.map((card) => [String(card.id), card]));
  return {
    suggestCard:
      community.deckCount >= COMMUNITY_DECK_FLOOR
        ? pickSuggestCard(community, deck, byId, remaining)
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
  remaining: readonly MtgCard[]
): SuggestCard | null {
  const inDeck = new Set<string>();
  deck.cards.forEach((qty, cardId) => {
    if (qty > 0) {
      inDeck.add(String(cardId));
    }
  });
  const remainingIds = new Set(remaining.map((card) => String(card.id)));

  let best: { suggestion: SuggestCard; lift: number } | null = null;
  for (const pair of community.pairs) {
    if (pair.together < COMMUNITY_PAIR_TOGETHER_FLOOR) {
      continue;
    }
    const sides: Array<{ candidateId: string; pullerId: string }> = [
      { candidateId: pair.a, pullerId: pair.b },
      { candidateId: pair.b, pullerId: pair.a }
    ];
    for (const side of sides) {
      if (!inDeck.has(side.pullerId) || !remainingIds.has(side.candidateId)) {
        continue;
      }
      const card = byId.get(side.candidateId);
      const puller = byId.get(side.pullerId);
      if (!card || !puller || isBasicLand(card) || isBasicLand(puller)) {
        continue;
      }
      const suggestion: SuggestCard = {
        card,
        puller,
        together: pair.together,
        deckCount: community.deckCount
      };
      if (
        !best ||
        pair.lift > best.lift ||
        (pair.lift === best.lift && pair.together > best.suggestion.together) ||
        (pair.lift === best.lift &&
          pair.together === best.suggestion.together &&
          card.name.localeCompare(best.suggestion.card.name) < 0)
      ) {
        best = { suggestion, lift: pair.lift };
      }
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
