import { MtgCard } from '../card/card';
import { isCompanionVocabulary, SetVocabulary } from '../card/set-vocabulary';
import { discoveryOracleChunksFromText } from './discovery-corpus';
import {
  foldPlurals,
  isStructuralPattern,
  NUM_TOKEN,
  phraseToDisplay,
  tokenizeNormalizedText
} from './oracle-diction';

/** Keyword/name phrase → helper oracle chunks. Vocabulary, never catalog. */
export type VocabularyExpansion = ReadonlyMap<string, readonly (readonly string[])[]>;

export function vocabularyPhraseKey(phrase: string): string {
  return foldPlurals(tokenizeNormalizedText(phrase)).join(' ');
}

export function vocabularyNodeKeys(entry: SetVocabulary): string[] {
  const keys = new Set<string>();
  const name = vocabularyPhraseKey(entry.name);
  if (name) {
    keys.add(name);
  }
  for (const keyword of entry.keywords ?? []) {
    const phrase = vocabularyPhraseKey(keyword);
    if (phrase) {
      keys.add(phrase);
    }
  }
  return [...keys];
}

export function buildVocabularyExpansion(
  entries: readonly SetVocabulary[],
  catalog: readonly MtgCard[] = []
): VocabularyExpansion {
  const merged = new Map<string, string[][]>();
  for (const entry of entries) {
    if (!isCompanionVocabulary(entry)) {
      continue;
    }
    const chunks = oracleBridgeChunks(entry.oracleText, entry.keywords ?? []);
    if (chunks.length === 0) {
      continue;
    }
    for (const key of vocabularyNodeKeys(entry)) {
      merged.set(key, uniqueChunks([...(merged.get(key) ?? []), ...chunks]));
    }
  }
  mergeHarvestedReminders(merged, catalog);
  sharePrefixNodeChunks(merged);
  return merged;
}

export function vocabularyNodePhrases(expansion: VocabularyExpansion): string[] {
  return [...expansion.keys()];
}

export function vocabularySignature(entries: readonly SetVocabulary[]): string {
  return entries.map((entry) => `${entry.id}\0${entry.oracleText}`).join('\n');
}

function mergeHarvestedReminders(merged: Map<string, string[][]>, catalog: readonly MtgCard[]): void {
  for (const card of catalog) {
    for (const { key, reminder } of harvestKeywordReminders(card)) {
      const named = [...reminder.matchAll(/\b([A-Z][a-zA-Z]{2,})\b/g)].map((match) => [
        vocabularyPhraseKey(match[1])
      ]);
      const chunks = [...oracleBridgeChunks(reminder, []), ...named.filter((chunk) => chunk[0])];
      if (chunks.length === 0) {
        continue;
      }
      merged.set(key, uniqueChunks([...(merged.get(key) ?? []), ...chunks]));
    }
  }
}

/** Reminder parens on the keyword line — Amass joins Army / Orc the way the Ring joins Ring-bearer. */
export function harvestKeywordReminders(card: MtgCard): Array<{ key: string; reminder: string }> {
  const harvested: Array<{ key: string; reminder: string }> = [];
  const keywords = card.keywords ?? [];
  if (keywords.length === 0) {
    return harvested;
  }
  for (const line of card.oracleText.split('\n')) {
    const reminders = [...line.matchAll(/\(([^)]+)\)/g)].map((match) => match[1].trim());
    if (reminders.length === 0) {
      continue;
    }
    const owners = keywords
      .map((keyword) => vocabularyPhraseKey(keyword))
      .filter((key) => key.length > 0 && line.toLowerCase().includes(key));
    if (owners.length === 0) {
      continue;
    }
    for (const reminder of reminders) {
      for (const key of owners) {
        harvested.push({ key, reminder });
      }
    }
  }
  return harvested;
}

function oracleBridgeChunks(oracleText: string, keywords: readonly string[]): string[][] {
  const seen = new Set<string>();
  const chunks: string[][] = [];

  const push = (tokens: string[]): void => {
    if (!usableBridgeChunk(tokens)) {
      return;
    }
    const key = tokens.join(' ');
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    chunks.push(tokens);
  };

  for (const chunk of discoveryOracleChunksFromText(oracleText, keywords)) {
    push(chunk);
  }

  for (const quoted of oracleText.matchAll(/"([^"]+)"|“([^”]+)”/g)) {
    const quotedText = quoted[1] ?? quoted[2];
    push(foldPlurals(tokenizeNormalizedText(quotedText)));
    for (const chunk of discoveryOracleChunksFromText(quotedText)) {
      push(chunk);
    }
  }

  for (const line of oracleText.split(/\n|\u2022/)) {
    push(foldPlurals(tokenizeNormalizedText(line)));
  }

  for (const token of foldPlurals(tokenizeNormalizedText(oracleText))) {
    if (token.includes('-')) {
      push([token]);
    }
  }
  for (const token of copulaComplements(oracleText)) {
    push([token]);
  }

  return chunks;
}

function sharePrefixNodeChunks(merged: Map<string, string[][]>): void {
  const keys = [...merged.keys()];
  for (const shorter of keys) {
    for (const longer of keys) {
      if (shorter === longer || !isTokenPrefixKey(shorter, longer)) {
        continue;
      }
      const combined = uniqueChunks([...(merged.get(shorter) ?? []), ...(merged.get(longer) ?? [])]);
      merged.set(shorter, combined);
      merged.set(longer, combined);
    }
  }
}

function isTokenPrefixKey(shorter: string, longer: string): boolean {
  const left = shorter.split(' ');
  const right = longer.split(' ');
  return left.length < right.length && left.every((token, index) => token === right[index]);
}

function uniqueChunks(chunks: string[][]): string[][] {
  const seen = new Set<string>();
  const unique: string[][] = [];
  for (const chunk of chunks) {
    const key = chunk.join(' ');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(chunk);
  }
  return unique;
}

function usableBridgeChunk(tokens: readonly string[]): boolean {
  if (tokens.length >= 2) {
    return !isStructuralPattern(phraseToDisplay(tokens));
  }
  return tokens.length === 1 && (tokens[0].includes('-') || isCopulaComplementToken(tokens[0]));
}

const COPULA = new Set(['is', 'was', 'are', 'were']);

/** `is legendary` on the helper sits next to `was legendary` on a card. */
function copulaComplements(oracleText: string): string[] {
  const tokens = foldPlurals(tokenizeNormalizedText(oracleText));
  const complements: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (COPULA.has(tokens[i]) && isCopulaComplementToken(tokens[i + 1])) {
      complements.push(tokens[i + 1]);
    }
  }
  return complements;
}

function isCopulaComplementToken(token: string): boolean {
  if (token === NUM_TOKEN || token.includes('_') || COPULA.has(token)) {
    return false;
  }
  return token.length >= 6 && !isStructuralPattern(token);
}
