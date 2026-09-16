/** Token or helper object for the focused set. Not a catalog card. */
export interface SetVocabulary {
  id: string;
  setId: string;
  name: string;
  typeLine: string;
  oracleText: string;
  keywords: string[];
}

const COMPANION_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem']);

/** Token, emblem, or a typeless helper face (The Ring). Allowlist — empty lines are not this. */
export function isCompanionVocabulary(entry: Pick<SetVocabulary, 'typeLine'>): boolean {
  const typeLine = (entry.typeLine ?? '').trim();
  if (!typeLine) {
    return false;
  }
  return /\b(?:Token|Emblem)\b/i.test(typeLine) || /(?:^|\/\/\s*)Card$/i.test(typeLine);
}

/** Scryfall extras for a token child. Layout covers DFC helpers if the type line is thin. */
export function isCompanionPrinting(card: { layout?: string; type_line?: string }): boolean {
  if (COMPANION_LAYOUTS.has(card.layout ?? '')) {
    return true;
  }
  return isCompanionVocabulary({ typeLine: card.type_line ?? '' });
}
