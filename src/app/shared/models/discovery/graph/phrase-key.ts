import { foldPlurals, tokenizeNormalizedText } from '../oracle-diction';

/** One identity for chips, deck pins, harvest endpoints, and reviewFeed. */
export function phraseKey(phrase: string): string {
  return foldPlurals(tokenizeNormalizedText(phrase)).join(' ');
}

export const vocabularyPhraseKey = phraseKey;
