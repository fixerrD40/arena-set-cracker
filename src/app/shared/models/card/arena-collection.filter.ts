import { MtgCard } from './card';
import { cardMatchesTheme } from '../discovery/theme-match';
import { CatalogGraph } from '../discovery/graph/catalog-graph';
import { CmcBucket, cmcBucket, compareByCmcThenName, getCmc } from './card.mana';

export const MANA_COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
export type ManaColor = (typeof MANA_COLORS)[number];

export type CollectionColorGroup = ManaColor | 'multi' | 'colorless';

/** Arena collection sections: WUBRG, then gold, then colorless. */
export const COLLECTION_COLOR_GROUP_ORDER: readonly CollectionColorGroup[] = [
  'W',
  'U',
  'B',
  'R',
  'G',
  'multi',
  'colorless'
];

const LAND_TYPE_COLOR: Record<string, ManaColor> = {
  Plains: 'W',
  Island: 'U',
  Swamp: 'B',
  Mountain: 'R',
  Forest: 'G'
};

export const COLLECTION_RARITIES = ['common', 'uncommon', 'rare', 'mythic'] as const;
export type CollectionRarity = (typeof COLLECTION_RARITIES)[number];

/**
 * Arena collection chips on top of an inherent set pool (`s:<code>`).
 * Colorless + multicolor is empty: a card cannot be both.
 * theme is one attached phrase applied this visit; not persisted with the filter.
 */
export interface ArenaCollectionFilter {
  colors: readonly ManaColor[];
  colorless: boolean;
  multicolor: boolean;
  land: boolean;
  rarities: readonly CollectionRarity[];
  cmcBuckets: readonly CmcBucket[];
  theme: string | null;
  text: string;
}

export function emptyArenaCollectionFilter(): ArenaCollectionFilter {
  return {
    colors: [],
    colorless: false,
    multicolor: false,
    land: false,
    rarities: [],
    cmcBuckets: [],
    theme: null,
    text: ''
  };
}

export function isLandCard(card: MtgCard): boolean {
  return /\bLand\b/.test(card.typeLine);
}

export function isBasicLand(card: MtgCard): boolean {
  return isLandCard(card) && /\bBasic\b/.test(card.typeLine);
}

/**
 * Colors Arena uses to section and filter a card.
 * Spells use printed `colors`. Lands with none infer from type line, then oracle pips.
 */
export function collectionColors(card: MtgCard): ManaColor[] {
  const printed = printedManaColors(card.colors);
  if (printed.length > 0) {
    return printed;
  }
  if (!isLandCard(card)) {
    return [];
  }
  const fromTypes = landTypeColors(card.typeLine);
  return fromTypes.length > 0 ? fromTypes : oracleManaColors(card.oracleText);
}

export function collectionColorGroup(card: MtgCard): CollectionColorGroup {
  const colors = collectionColors(card);
  if (colors.length >= 2) return 'multi';
  if (colors.length === 1) return colors[0];
  return 'colorless';
}

/** Color group, then non-lands before lands, then CMC then name. */
export function compareArenaCollection(a: MtgCard, b: MtgCard): number {
  const group =
    COLLECTION_COLOR_GROUP_ORDER.indexOf(collectionColorGroup(a)) -
    COLLECTION_COLOR_GROUP_ORDER.indexOf(collectionColorGroup(b));
  if (group !== 0) return group;

  const land = Number(isLandCard(a)) - Number(isLandCard(b));
  if (land !== 0) return land;

  return compareByCmcThenName(a, b);
}

/** Deck list: CMC then name across colors, lands after every spell. */
export function compareArenaDeckList(a: MtgCard, b: MtgCard): number {
  const land = Number(isLandCard(a)) - Number(isLandCard(b));
  if (land !== 0) return land;
  return compareByCmcThenName(a, b);
}

export function cardMatchesArenaCollectionFilter(
  card: MtgCard,
  filter: ArenaCollectionFilter,
  graph?: CatalogGraph | null
): boolean {
  if (isBasicLand(card) && !filter.land) {
    return false;
  }

  if (filter.land && !isLandCard(card)) {
    return false;
  }

  if (!matchesColorDimension(card, filter)) {
    return false;
  }

  if (filter.rarities.length > 0 && !filter.rarities.includes(card.rarity as CollectionRarity)) {
    return false;
  }

  if (filter.cmcBuckets.length > 0 && !filter.cmcBuckets.includes(cmcBucket(getCmc(card.manaCost)))) {
    return false;
  }

  if (filter.theme && !cardMatchesTheme(card, filter.theme, graph)) {
    return false;
  }

  return matchesCollectionText(card, filter.text);
}

/**
 * Space-separated terms are AND. Each term matches name, type line, or oracle text.
 */
export function matchesCollectionText(card: MtgCard, text: string): boolean {
  const terms = text.trim().toLowerCase().split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) {
    return true;
  }

  const haystack = `${card.name} ${card.typeLine} ${card.oracleText}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function matchesColorDimension(card: MtgCard, filter: ArenaCollectionFilter): boolean {
  const selected = filter.colors;
  const hasColorChips = selected.length > 0;
  const { colorless, multicolor } = filter;

  if (!hasColorChips && !colorless && !multicolor) {
    return true;
  }

  if (colorless && multicolor) {
    return false;
  }

  const colors = collectionColors(card);
  const colorCount = colors.length;
  const hasColor = (mana: ManaColor) => colors.includes(mana);

  if (multicolor) {
    if (colorCount < 2) {
      return false;
    }
    return selected.every(hasColor);
  }

  const matchesColorless = colorless && colorCount === 0;
  const matchesAnySelected = hasColorChips && selected.some(hasColor);

  if (colorless && hasColorChips) {
    return matchesColorless || matchesAnySelected;
  }
  if (colorless) {
    return matchesColorless;
  }
  return matchesAnySelected;
}

/**
 * Set-board remaining pool: colorless always.
 * One chip selected: mono or any gold that includes that color.
 * Two or more chips: every color on the card must lie within the selected set.
 */
export function matchesColorScope(card: MtgCard, selected: readonly ManaColor[]): boolean {
  if (selected.length === 0) {
    return true;
  }

  const colors = collectionColors(card);
  if (colors.length === 0) {
    return true;
  }

  const selectedSet = new Set(selected);

  if (selected.length === 1) {
    return colors.some((color) => selectedSet.has(color));
  }

  return colors.every((color) => selectedSet.has(color));
}

function printedManaColors(colors: string[]): ManaColor[] {
  return MANA_COLORS.filter((color) => colors.includes(color));
}

function landTypeColors(typeLine: string): ManaColor[] {
  return Object.entries(LAND_TYPE_COLOR)
    .filter(([type]) => new RegExp(`\\b${type}\\b`).test(typeLine))
    .map(([, color]) => color);
}

function oracleManaColors(oracleText: string): ManaColor[] {
  const found = new Set<ManaColor>();
  for (const match of oracleText.matchAll(/\{([WUBRGP])(?:\/([WUBRGP]))?\}/g)) {
    addManaPip(found, match[1]);
    addManaPip(found, match[2]);
  }
  return MANA_COLORS.filter((color) => found.has(color));
}

function addManaPip(into: Set<ManaColor>, pip: string | undefined): void {
  if (pip === 'W' || pip === 'U' || pip === 'B' || pip === 'R' || pip === 'G') {
    into.add(pip);
  }
}
