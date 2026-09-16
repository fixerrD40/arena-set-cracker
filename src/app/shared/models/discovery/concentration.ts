import { MtgCard } from '../card/card';
import { SetVocabulary } from '../card/set-vocabulary';
import { discoveryKeywordPhrases, discoveryTextChunks, discoveryTypeTokens } from './discovery-corpus';
import {
  foldPlurals,
  isStructuralPattern,
  NUM_TOKEN,
  phrasePatternTokens,
  phraseToDisplay,
  tokenizeNormalizedText
} from './oracle-diction';
import { cardMatchesOracleTheme, isSignificantThemeMatch } from './theme-match';
import {
  buildVocabularyExpansion,
  vocabularyNodePhrases,
  VocabularyExpansion
} from './vocabulary-expansion';

export interface ConcentratedPattern {
  phrase: string;
  hitCount: number;
  cardCount: number;
  poolSize: number;
}

type Bigram = readonly [string, string];
type Ngram = readonly Bigram[];

const ROUGH_MIN_PROP = 0.05;

function extractBigrams(tokens: readonly string[]): Bigram[] {
  const bigrams: Bigram[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.push([tokens[i], tokens[i + 1]]);
  }
  return bigrams;
}

function ngramToTokens(ngram: Ngram): string[] {
  if (ngram.length === 0) {
    return [];
  }
  const tokens = [ngram[0][0]];
  for (const [, right] of ngram) {
    tokens.push(right);
  }
  return tokens;
}

function countNgramInTokens(tokens: readonly string[], pattern: readonly string[]): number {
  if (pattern.length === 0 || tokens.length < pattern.length) {
    return 0;
  }
  let count = 0;
  for (let i = 0; i <= tokens.length - pattern.length; i++) {
    let matched = true;
    for (let j = 0; j < pattern.length; j++) {
      if (tokens[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      count++;
    }
  }
  return count;
}

function mergeNgramsViaChains(ngramsFreq: Map<string, number>): Map<string, number> {
  const entries = [...ngramsFreq.entries()].map(([key, freq]) => ({
    ngram: JSON.parse(key) as Ngram,
    freq
  }));
  if (entries.length === 0) {
    return new Map();
  }

  const ngramLen = entries[0].ngram.length;
  const candidates = new Map<string, number>();

  if (ngramLen === 1) {
    const prefixMap = new Map<string, typeof entries>();
    const suffixMap = new Map<string, typeof entries>();
    for (const entry of entries) {
      const bigram = entry.ngram[0];
      pushMap(prefixMap, bigram[0], entry);
      pushMap(suffixMap, bigram[1], entry);
    }
    for (const [token, leftEntries] of suffixMap) {
      const rightEntries = prefixMap.get(token) ?? [];
      for (const left of leftEntries) {
        for (const right of rightEntries) {
          const merged: Ngram = [...left.ngram, right.ngram[0]];
          setCandidate(candidates, merged, Math.min(left.freq, right.freq));
        }
      }
    }
    return candidates;
  }

  const overlapLen = ngramLen - 1;
  const prefixMap = new Map<string, typeof entries>();
  const suffixMap = new Map<string, typeof entries>();
  for (const entry of entries) {
    const prefix = entry.ngram.slice(0, overlapLen);
    const suffix = entry.ngram.slice(-overlapLen);
    pushMap(prefixMap, JSON.stringify(prefix), entry);
    pushMap(suffixMap, JSON.stringify(suffix), entry);
  }
  for (const [overlapKey, leftEntries] of suffixMap) {
    const rightEntries = prefixMap.get(overlapKey) ?? [];
    for (const left of leftEntries) {
      for (const right of rightEntries) {
        const merged: Ngram = [...left.ngram, right.ngram[right.ngram.length - 1]];
        setCandidate(candidates, merged, Math.min(left.freq, right.freq));
      }
    }
  }
  return candidates;
}

function pushMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}

function setCandidate(candidates: Map<string, number>, ngram: Ngram, freq: number): void {
  candidates.set(JSON.stringify(ngram), freq);
}

function validateNgrams(
  candidates: Map<string, number>,
  tokenizedTexts: string[][]
): Map<string, number> {
  const validated = new Map<string, number>();
  const pTolerance = 0.8;
  const nTolerance = 1;

  for (const [key, predicted] of candidates) {
    const ngram = JSON.parse(key) as Ngram;
    const pattern = ngramToTokens(ngram);
    let actual = 0;
    for (const tokens of tokenizedTexts) {
      actual += countNgramInTokens(tokens, pattern);
    }
    if (
      actual >= Math.floor(predicted * pTolerance) ||
      (predicted - actual > nTolerance && actual > 1)
    ) {
      validated.set(key, actual);
    }
  }
  return validated;
}

function tokensDifferAtOnePosition(a: string[], b: string[]): number | null {
  if (a.length !== b.length) {
    return null;
  }
  const diffs: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diffs.push(i);
    }
  }
  return diffs.length === 1 ? diffs[0] : null;
}

function isPluralPair(a: string, b: string): boolean {
  return a === `${b}s` || b === `${a}s`;
}

function matchesGeneralizedPattern(tokens: readonly string[], pattern: readonly string[]): boolean {
  if (tokens.length !== pattern.length) {
    return false;
  }
  for (let i = 0; i < pattern.length; i++) {
    const slot = pattern[i];
    if (slot === '*') {
      continue;
    }
    if (slot === NUM_TOKEN) {
      if (tokens[i] !== NUM_TOKEN && !/^\d+$/.test(tokens[i])) {
        return false;
      }
      continue;
    }
    if (tokens[i] !== slot) {
      return false;
    }
  }
  return true;
}

function tokenListToNgram(tokens: string[]): Ngram {
  const pairs: Bigram[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    pairs.push([tokens[i], tokens[i + 1]]);
  }
  return pairs;
}

function generalizeNgrams(
  ngramsFreq: Map<string, number>,
  tokenizedTexts: string[][]
): Map<string, number> {
  const merged = new Map(ngramsFreq);
  const grouped = new Map<number, Ngram[]>();

  for (const key of ngramsFreq.keys()) {
    const ngram = JSON.parse(key) as Ngram;
    const list = grouped.get(ngram.length) ?? [];
    list.push(ngram);
    grouped.set(ngram.length, list);
  }

  for (const [length, group] of grouped) {
    if (length < 2) {
      continue;
    }
    const tokenLists = group.map(ngramToTokens);
    for (let i = 0; i < tokenLists.length; i++) {
      for (let j = i + 1; j < tokenLists.length; j++) {
        const left = tokenLists[i];
        const right = tokenLists[j];
        const diffPos = tokensDifferAtOnePosition(left, right);
        if (diffPos == null || diffPos === 0 || diffPos === left.length - 1) {
          continue;
        }
        if (isPluralPair(left[diffPos], right[diffPos])) {
          continue;
        }
        const generalized = left.slice();
        generalized[diffPos] = '*';
        let count = 0;
        for (const tokens of tokenizedTexts) {
          for (let idx = 0; idx <= tokens.length - generalized.length; idx++) {
            if (matchesGeneralizedPattern(tokens.slice(idx, idx + generalized.length), generalized)) {
              count++;
            }
          }
        }
        const minHits = Math.max(1, Math.floor(tokenizedTexts.length * ROUGH_MIN_PROP));
        if (count >= minHits) {
          const key = JSON.stringify(tokenListToNgram(generalized));
          const current = merged.get(key) ?? 0;
          if (count > current) {
            merged.set(key, count);
          }
        }
      }
    }
  }

  return merged;
}

/** Tokenize parsed oracle with card subtypes prefixed into each chunk. */
function tokenizedParsedChunks(cards: readonly MtgCard[]): string[][] {
  const chunks: string[][] = [];

  for (const card of cards) {
    chunks.push(...discoveryTextChunks(card));
  }

  return chunks;
}

function subtypePatterns(
  cards: readonly MtgCard[],
  poolSize: number,
  expansion: VocabularyExpansion
): ConcentratedPattern[] {
  const candidates = new Set<string>();

  for (const card of cards) {
    for (const token of discoveryTypeTokens(card.typeLine)) {
      candidates.add(token);
    }
    for (const phrase of discoveryKeywordPhrases(card)) {
      candidates.add(phrase);
    }
  }
  for (const phrase of vocabularyNodePhrases(expansion)) {
    candidates.add(phrase);
  }

  const patterns: ConcentratedPattern[] = [];
  for (const token of candidates) {
    const phrase = token.replace(/_/g, ' ');
    if (isStructuralPattern(phrase)) {
      continue;
    }
    const cardCount = cards.filter((card) => cardMatchesOracleTheme(card, phrase, expansion)).length;
    if (cardCount === 0 || !isSignificantThemeMatch(cardCount, poolSize)) {
      continue;
    }
    patterns.push({ phrase, hitCount: cardCount, cardCount, poolSize });
  }

  return patterns;
}

function constructNgrams(tokenizedTexts: string[][], poolSize: number): Map<string, number> {
  const roughMin = Math.max(1, Math.floor(poolSize * ROUGH_MIN_PROP));
  const bigramFreq = new Map<string, number>();

  for (const tokens of tokenizedTexts) {
    for (const bigram of extractBigrams(tokens)) {
      const ngram: Ngram = [bigram];
      const key = JSON.stringify(ngram);
      bigramFreq.set(key, (bigramFreq.get(key) ?? 0) + 1);
    }
  }

  const filtered = new Map<string, number>();
  for (const [key, freq] of bigramFreq) {
    if (freq >= roughMin) {
      filtered.set(key, freq);
    }
  }

  let current = filtered;
  const all = new Map(filtered);

  while (true) {
    const candidates = mergeNgramsViaChains(current);
    if (candidates.size === 0) {
      break;
    }
    const validated = validateNgrams(candidates, tokenizedTexts);
    if (validated.size === 0) {
      break;
    }
    for (const [key, freq] of validated) {
      all.set(key, freq);
    }
    current = validated;
  }

  return generalizeNgrams(all, tokenizedTexts);
}

export function concentrate(
  cards: readonly MtgCard[],
  vocabulary: readonly SetVocabulary[] = []
): ConcentratedPattern[] {
  const poolSize = cards.length;
  if (poolSize === 0) {
    return [];
  }

  const expansion = buildVocabularyExpansion(vocabulary, cards);
  const tokenizedTexts = tokenizedParsedChunks(cards);
  const ngrams = reduceNgrams(constructNgrams(tokenizedTexts, poolSize));
  const patterns: ConcentratedPattern[] = [...subtypePatterns(cards, poolSize, expansion)];

  for (const [key, hitCount] of ngrams) {
    const phrase = phraseToDisplay(ngramToTokens(JSON.parse(key) as Ngram));
    const phraseTokens = phrasePatternTokens(phrase);
    if (!phrase || phraseTokens.length < 2 || isStructuralPattern(phrase) || isWeakFragment(phraseTokens)) {
      continue;
    }
    const cardCount = cards.filter((card) => cardMatchesOracleTheme(card, phrase, expansion)).length;
    if (cardCount === 0 || !isSignificantThemeMatch(cardCount, poolSize)) {
      continue;
    }
    patterns.push({ phrase, hitCount, cardCount, poolSize });
  }

  patterns.sort((a, b) => b.cardCount - a.cardCount || b.hitCount - a.hitCount || a.phrase.localeCompare(b.phrase));

  const seen = new Set<string>();
  const deduped: ConcentratedPattern[] = [];
  for (const pattern of patterns) {
    if (seen.has(pattern.phrase)) {
      continue;
    }
    seen.add(pattern.phrase);
    deduped.push(pattern);
  }

  return deduped.slice(0, 40);
}

function reduceNgrams(ngrams: Map<string, number>): Map<string, number> {
  const selections = new Map<string, number>();
  let remaining = new Map(ngrams);

  while (remaining.size > 0) {
    const key = selectNextNgramKey(remaining);
    if (!key) {
      break;
    }
    selections.set(key, remaining.get(key)!);
    remaining = contestNgram(remaining, key);
  }

  return selections;
}

function selectNextNgramKey(remaining: Map<string, number>): string {
  let bestKey = '';
  let bestLen = -1;
  let bestFreq = -1;

  for (const [key, freq] of remaining) {
    const len = ngramToTokens(JSON.parse(key) as Ngram).length;
    if (len > bestLen || (len === bestLen && freq > bestFreq)) {
      bestKey = key;
      bestLen = len;
      bestFreq = freq;
    }
  }

  return bestKey;
}

function contestNgram(remaining: Map<string, number>, superKey: string): Map<string, number> {
  const superFreq = remaining.get(superKey) ?? 0;
  const superTokens = ngramToTokens(JSON.parse(superKey) as Ngram);
  const pTolerance = 0.8;
  const nTolerance = 1;
  const next = new Map<string, number>();

  for (const [key, freq] of remaining) {
    if (key === superKey) {
      continue;
    }
    const tokens = ngramToTokens(JSON.parse(key) as Ngram);
    const subsumed = isLooseTokenSubsequence(tokens, superTokens);
    if (
      !subsumed ||
      (freq !== superFreq && superFreq / freq > pTolerance && freq - superFreq > nTolerance)
    ) {
      next.set(key, freq);
    }
  }

  return next;
}

function isLooseTokenSubsequence(short: readonly string[], long: readonly string[]): boolean {
  if (short.length === 0 || short.length >= long.length) {
    return false;
  }
  let cursor = 0;
  for (const token of long) {
    if (token === short[cursor]) {
      cursor++;
      if (cursor === short.length) {
        return true;
      }
    }
  }
  return false;
}

function isWeakFragment(tokens: readonly string[]): boolean {
  if (tokens.length !== 2) {
    return false;
  }
  return tokens[0] === 'of' || tokens[1] === 'of';
}

/** Yield so the set board can paint loading, then concentrate off the UI thread. */
export function scheduleConcentrate(
  cards: readonly MtgCard[],
  vocabulary: readonly SetVocabulary[] = []
): Promise<ConcentratedPattern[]> {
  const worker = ensureConcentrateWorker();
  if (!worker) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(concentrate(cards, vocabulary)), 0);
    });
  }

  return new Promise((resolve, reject) => {
    const id = ++concentrateJobId;
    concentrateJobs.set(id, { resolve, reject });
    worker.postMessage({ id, cards: [...cards], vocabulary: [...vocabulary] } satisfies ConcentrateJob);
  });
}

interface ConcentrateJob {
  id: number;
  cards: MtgCard[];
  vocabulary: SetVocabulary[];
}

interface ConcentrateResult {
  id: number;
  patterns: ConcentratedPattern[];
}

let concentrateWorker: Worker | null = null;
let concentrateJobId = 0;
const concentrateJobs = new Map<
  number,
  {
    resolve: (patterns: ConcentratedPattern[]) => void;
    reject: (error: unknown) => void;
  }
>();

function ensureConcentrateWorker(): Worker | null {
  if (typeof Worker === 'undefined') {
    return null;
  }
  if (concentrateWorker) {
    return concentrateWorker;
  }

  try {
    // Path string must stay a build-time literal for the Angular application builder.
    const worker = new Worker(new URL('./concentration.worker', import.meta.url));
    worker.onmessage = (event: MessageEvent<ConcentrateResult>) => {
      const job = concentrateJobs.get(event.data.id);
      if (!job) {
        return;
      }
      concentrateJobs.delete(event.data.id);
      job.resolve(event.data.patterns);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'concentration worker failed');
      for (const job of concentrateJobs.values()) {
        job.reject(error);
      }
      concentrateJobs.clear();
      worker.terminate();
      concentrateWorker = null;
    };
    concentrateWorker = worker;
    return worker;
  } catch {
    return null;
  }
}
