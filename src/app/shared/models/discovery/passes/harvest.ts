import { MtgCard } from '../../card/card';
import { isCompanionVocabulary, SetVocabulary } from '../../card/set-vocabulary';
import {
  foldPlurals,
  isStructuralPattern,
  NUM_TOKEN,
  tokenizeNormalizedText
} from '../oracle-diction';
import { CatalogGraphBuilder } from '../graph/catalog-graph';
import { phraseKey } from '../graph/phrase-key';

/** Face names on a DFC helper, not the `//` concat. */
export function vocabularyFaceKeys(name: string): string[] {
  return name
    .split(/\s*\/\/\s*/)
    .map((face) => phraseKey(face))
    .filter((key) => key.length > 0);
}

export function vocabularyNodeKeys(entry: SetVocabulary): string[] {
  const keys = new Set<string>(vocabularyFaceKeys(entry.name));
  for (const keyword of entry.keywords ?? []) {
    const phrase = phraseKey(keyword);
    if (phrase) {
      keys.add(phrase);
    }
  }
  return [...keys];
}

/** Chip candidates — drop a face that is only a prefix of a longer node (`the ring`). */
export function vocabularyNodePhrases(phrases: ReadonlySet<string> | readonly string[]): string[] {
  const keys = [...phrases];
  return keys.filter((key) => !keys.some((other) => other !== key && isTokenSubsequence(key, other)));
}

export function applyHarvest(
  builder: CatalogGraphBuilder,
  entries: readonly SetVocabulary[],
  catalog: readonly MtgCard[]
): CatalogGraphBuilder {
  for (const entry of entries) {
    if (!isCompanionVocabulary(entry)) {
      continue;
    }
    const faceKeys = vocabularyNodeKeys(entry);
    for (const key of faceKeys) {
      builder.addPhrase(key);
    }
    const named = harvestNamedObjects(entry.oracleText);
    const feeder = longestFaceKey(faceKeys);
    if (feeder) {
      for (const object of named) {
        addHarvest(builder, feeder, object, 'produce');
      }
    }
  }

  for (const card of catalog) {
    for (const { key, reminder } of harvestKeywordReminders(card)) {
      builder.addPhrase(key);
      const counted = new Set(harvestForEachTypes(reminder));
      for (const named of harvestNamedObjects(reminder)) {
        addHarvest(builder, key, named, 'produce');
      }
      for (const named of harvestTitleNames(reminder)) {
        if (counted.has(named)) {
          continue;
        }
        addHarvest(builder, key, named, 'produce');
      }
      for (const type of counted) {
        addHarvest(builder, type, key, 'count');
      }
    }
  }

  return builder;
}

function addHarvest(
  builder: CatalogGraphBuilder,
  feeder: string,
  feedsPhrase: string,
  kind: 'produce' | 'count'
): void {
  if (!feeder || !feedsPhrase || feeder === feedsPhrase) {
    return;
  }
  if (isTokenSubsequence(feedsPhrase, feeder)) {
    return;
  }
  builder.addPhrase(feeder);
  builder.addPhrase(feedsPhrase);
  builder.addEdge({ from: feeder, to: feedsPhrase, kind });
}

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
    for (const keyword of keywords) {
      const key = phraseKey(keyword);
      if (!key || !line.toLowerCase().includes(key)) {
        continue;
      }
      const phrase = printedKeywordPhrase(line, key);
      for (const reminder of reminders) {
        harvested.push({ key: phrase, reminder });
      }
    }
  }
  return harvested;
}

function printedKeywordPhrase(line: string, keywordKey: string): string {
  const prefix = phraseKey(line.split('(')[0].replace(/\.+$/, ''));
  if (prefix === `${keywordKey} for` || prefix.startsWith(`${keywordKey} for `)) {
    return prefix;
  }
  return keywordKey;
}

function harvestNamedObjects(oracleText: string): string[] {
  const named: string[] = [];
  for (const token of foldPlurals(tokenizeNormalizedText(oracleText))) {
    if (token.includes('-') && usableNamedObject(token)) {
      named.push(token);
    }
  }
  for (const token of copulaComplements(oracleText)) {
    named.push(token);
  }
  return named;
}

function harvestTitleNames(text: string): string[] {
  return [...text.matchAll(/\b([A-Z][a-zA-Z]{2,})\b/g)]
    .map((match) => phraseKey(singularTitle(match[1])))
    .filter((key) => usableNamedObject(key));
}

function harvestForEachTypes(reminder: string): string[] {
  const types: string[] = [];
  const tokens = foldPlurals(tokenizeNormalizedText(reminder));
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i] === 'for' && tokens[i + 1] === 'each' && usableNamedObject(tokens[i + 2])) {
      types.push(tokens[i + 2]);
    }
  }
  return types;
}

function singularTitle(word: string): string {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

function usableNamedObject(key: string): boolean {
  if (!key || key === NUM_TOKEN || key.includes('_') || isStructuralPattern(key)) {
    return false;
  }
  return !HARVEST_NAME_STOP.has(key);
}

function longestFaceKey(faceKeys: readonly string[]): string | undefined {
  return dropPrefixPhrases(longestFirst([...faceKeys]))[0];
}

export function dropPrefixPhrases(phrases: readonly string[]): string[] {
  return phrases.filter(
    (phrase) => !phrases.some((other) => other !== phrase && isTokenSubsequence(phrase, other))
  );
}

export function longestFirst(phrases: string[]): string[] {
  return [...phrases].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export function isTokenSubsequence(shorter: string, longer: string): boolean {
  const left = shorter.split(' ');
  const right = longer.split(' ');
  if (left.length === 0 || left.length >= right.length) {
    return false;
  }
  let cursor = 0;
  for (const token of right) {
    if (token === left[cursor]) {
      cursor++;
      if (cursor === left.length) {
        return true;
      }
    }
  }
  return false;
}

const COPULA = new Set(['is', 'was', 'are', 'were']);

const HARVEST_NAME_STOP = new Set([
  'the',
  'then',
  'this',
  'that',
  'your',
  'each',
  'when',
  'whenever',
  'to',
  'if',
  'as',
  'its',
  'also',
  'first',
  'put',
  'you',
  'an',
  'a',
  'on',
  'or',
  'and',
  'of',
  'for',
  'with',
  'from',
  'into',
  'onto',
  'than',
  'can',
  'only',
  'one',
  'have',
  'has',
  'named',
  'even',
  'dont',
  'control',
  'creature',
  'token',
  'emblem'
]);

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
  return token.length >= 6 && !isStructuralPattern(token) && !HARVEST_NAME_STOP.has(token);
}
