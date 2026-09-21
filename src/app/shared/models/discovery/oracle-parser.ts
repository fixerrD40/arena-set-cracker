import type { MtgCard } from '../card/card';

export type ClauseType = 'trigger' | 'condition';

export interface StructuralMark {
  type: string;
  prefix?: string;
  start: number;
  end: number;
  text: string;
}

export interface ParsedClause {
  type: ClauseType;
  text: string;
  subjects: string[];
}

export interface ParsedEffect {
  text?: string;
  clauses?: ParsedClause[];
  effects?: ParsedEffect[];
  modifiers?: string[];
  replacement?: ParsedEffect;
  cost?: string[];
  keyword?: string;
}

export interface FlattenedOracle {
  triggers: string[];
  conditions: string[];
  effects: string[];
  costs: string[];
  keywords: string[];
  pointers: string[];
}

const TRIGGER = 'trigger';
const CONDITION = 'condition';

const TRIGGER_PREFIX = ['whenever', 'when', 'at the beginning of', 'at the beginning', 'after'] as const;
const CONDITION_PREFIX = ['if', 'as long as'] as const;

const REFLEXIVE_SUBORDINATE_CLAUSE_PATTERN = /\byou do\b/i;
const EFFECT_CHOICE_PATTERN =
  /\bchoose\s+(?:up\s+to\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+|x|that many)(?:\s+or\s+(?:both|more))?\b/i;
const EFFECT_OPTIONAL_PATTERN = /\byou may\b/i;
/**
 * Sentence-level replacement fork (`instead create…` / `Otherwise, …`).
 * Not `instead of` (destination framing) and not trailing adverbial `… instead.`
 */
const EFFECT_REPLACEMENT_PATTERN = /\botherwise\b|\binstead(?!\s+of)(?=\s+\S)/i;
const MANA_SYMBOL_PATTERN = /\{(?:[WUBRG]\/[WUBRG]|[WUBRGCEP]|\d+|X)\}/i;
const TAP_SYMBOL_PATTERN = /\{T\}/i;
const EQUIP_PATTERN = /^equip(?:\s+\w+)?(?=\s*\{)/i;
const ASSIGNED_TEXT_PATTERN = /"(.*?)"/;

const ALL_PREFIXES = [
  ...TRIGGER_PREFIX.map((prefix) => [TRIGGER, prefix] as const),
  ...CONDITION_PREFIX.map((prefix) => [CONDITION, prefix] as const)
].sort((a, b) => b[1].length - a[1].length);

const PREFIX_PATTERNS = ALL_PREFIXES.map(([type, prefix]) => ({
  type,
  prefix,
  pattern: new RegExp(`\\b${escapeRegExp(prefix)}\\b`, 'i')
}));

export function parseOracleText(oracleText: string, keywords: readonly string[] = []): ParsedEffect[] {
  const stripped = stripKeywords(oracleText, keywords);
  const labeled = stripAbilityLabels(stripped.remainder);
  const nested = stripKeywords(labeled.remainder, keywords);
  return parseText(nested.remainder, markStructuralElements(nested.remainder));
}

export function flattenOracleText(oracleText: string, keywords: readonly string[] = []): FlattenedOracle {
  const stripped = stripKeywords(oracleText, keywords);
  const labeled = stripAbilityLabels(stripped.remainder);
  // Labels can expose a nested costed keyword ability (`Exhaust — Waterbend {3}:`).
  const nested = stripKeywords(labeled.remainder, keywords);
  const parsed = parseText(nested.remainder, markStructuralElements(nested.remainder));
  const flat = flattenParsedOracle(parsed);
  return retagCostedKeywords(
    {
      ...flat,
      keywords: [...stripped.keywordText, ...labeled.labels, ...nested.keywordText, ...flat.keywords],
      costs: [...stripped.costs, ...labeled.costs, ...nested.costs, ...flat.costs]
    },
    keywords
  );
}

export function flattenOracleCard(card: Pick<MtgCard, 'oracleText' | 'keywords'>): FlattenedOracle {
  return flattenOracleText(card.oracleText ?? '', card.keywords ?? []);
}

/** Each face is its own oracle document. Layout (not `//`) says why there is more than one. */
export function flattenOracleFaces(
  faces: readonly string[],
  keywords: readonly string[] = []
): FlattenedOracle {
  const nonempty = faces.map((face) => face.trim()).filter(Boolean);
  if (nonempty.length <= 1) {
    return flattenOracleText(nonempty[0] ?? '', keywords);
  }
  return mergeFlattenedOracle(nonempty.map((face) => flattenOracleText(face, keywords)));
}

export function mergeFlattenedOracle(parts: readonly FlattenedOracle[]): FlattenedOracle {
  const triggers: string[] = [];
  const conditions: string[] = [];
  const effects: string[] = [];
  const costs: string[] = [];
  const keywords: string[] = [];
  const pointers: string[] = [];
  const seenPointers = new Set<string>();
  for (const part of parts) {
    triggers.push(...part.triggers);
    conditions.push(...part.conditions);
    effects.push(...part.effects);
    costs.push(...part.costs);
    keywords.push(...part.keywords);
    for (const pointer of part.pointers) {
      if (!seenPointers.has(pointer)) {
        seenPointers.add(pointer);
        pointers.push(pointer);
      }
    }
  }
  return { triggers, conditions, effects, costs, keywords, pointers };
}

export function flattenParsedOracle(parsed: readonly ParsedEffect[]): FlattenedOracle {
  const triggers: string[] = [];
  const conditions: string[] = [];
  const effects: string[] = [];
  const costs: string[] = [];
  const keywords: string[] = [];

  for (const entry of parsed) {
    collectClauses(entry, triggers, conditions);
    collectCosts(entry, costs);
    collectKeywords(entry, keywords);
    collectEffectLeaves(entry, effects);
  }

  const leaves = [...triggers, ...conditions, ...effects, ...costs, ...keywords];
  return { triggers, conditions, effects, costs, keywords, pointers: collectPointers(leaves) };
}

function retagCostedKeywords(flat: FlattenedOracle, printed: readonly string[]): FlattenedOracle {
  if (printed.length === 0) {
    return flat;
  }
  const names = printed.map((keyword) => keyword.trim()).filter(Boolean);
  const effects: string[] = [];
  const keywords = [...flat.keywords];
  const costs = [...flat.costs];
  for (const effect of flat.effects) {
    const tagged = names.find((name) =>
      new RegExp(`^${escapeRegExp(name)}\\s+(\\{[^}]+\\})+\\.?$`, 'i').test(effect.trim())
    );
    if (!tagged) {
      effects.push(effect);
      continue;
    }
    keywords.push(tagged);
    for (const mana of effect.matchAll(/\{[^}]+\}/g)) {
      costs.push(mana[0]);
    }
  }
  return { ...flat, effects, keywords, costs };
}

function collectEffectLeaves(entry: ParsedEffect, effects: string[]): void {
  if (entry.effects) {
    effects.push(...extractLeafEffects(entry.effects).map(stripInsteadOfFraming));
  } else if (!entry.keyword && entry.text) {
    effects.push(stripInsteadOfFraming(entry.text));
  }
  if (entry.replacement) {
    collectEffectLeaves(entry.replacement, effects);
  }
}

/** Destination `instead of…` and trailing adverbial `… instead` stay on the same VP. */
function stripInsteadOfFraming(text: string): string {
  return text
    .replace(/\binstead of\b[\w\s'’/+-]*/gi, ' ')
    .replace(/\binstead\b\.?$/i, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.;,])/g, '$1')
    .trim();
}

function collectKeywords(entry: ParsedEffect, keywords: string[]): void {
  if (entry.keyword?.trim()) {
    keywords.push(entry.keyword.trim());
  }
  for (const nested of entry.effects ?? []) {
    collectKeywords(nested, keywords);
  }
  if (entry.replacement) {
    collectKeywords(entry.replacement, keywords);
  }
}

function collectCosts(entry: ParsedEffect, costs: string[]): void {
  for (const part of entry.cost ?? []) {
    const trimmed = part.trim().replace(/^,|,$/g, '').trim();
    if (trimmed) {
      costs.push(trimmed);
    }
  }
  for (const nested of entry.effects ?? []) {
    collectCosts(nested, costs);
  }
  if (entry.replacement) {
    collectCosts(entry.replacement, costs);
  }
}

const POINTER_PATTERN = /\b(this|that)(?:\s+[a-z0-9]+)?\b/gi;

function collectPointers(texts: readonly string[]): string[] {
  const pointers: string[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(POINTER_PATTERN)) {
      const key = match[0].toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        pointers.push(key);
      }
    }
  }
  return pointers;
}

function collectClauses(entry: ParsedEffect, triggers: string[], conditions: string[]): void {
  for (const clause of entry.clauses ?? []) {
    const subjects = clause.subjects.filter(
      (subject) =>
        !REFLEXIVE_SUBORDINATE_CLAUSE_PATTERN.test(subject) && !/^able\b/i.test(subject.trim())
    );
    if (clause.type === TRIGGER) {
      triggers.push(...subjects);
    } else if (clause.type === CONDITION) {
      conditions.push(...subjects);
    }
  }
  for (const nested of entry.effects ?? []) {
    collectClauses(nested, triggers, conditions);
  }
  if (entry.replacement) {
    collectClauses(entry.replacement, triggers, conditions);
  }
}

const COSTED_PRINTED_KEYWORD = /^(.+?)\s*((?:\{[^}]+\})+)\.?$/;
const COSTED_KEYWORD_ABILITY = /^(.+?)\s*((?:\{[^}]+\})+)\s*:/;

/** Fold trailing bang/period so printed `Start your engines!` matches the oracle line. */
function normalizeKeywordKey(text: string): string {
  return text.toLowerCase().replace(/[!?.]+$/g, '').trim();
}

function stripKeywords(
  text: string,
  keywords: readonly string[]
): { keywordText: string[]; remainder: string; costs: string[] } {
  const lines = text.split('\n');
  const stripped: string[] = [];
  const printed = [...new Set(keywords.map((kw) => kw.trim()).filter(Boolean))];
  const keywordSet = new Set(printed.map(normalizeKeywordKey));
  const keywordText: string[] = [];
  const costs: string[] = [];

  for (const line of lines) {
    let lineClean = line.replace(/ ?\([^)]*\)/g, '');
    const lineLower = lineClean.toLowerCase();

    for (const kw of printed) {
      const key = normalizeKeywordKey(kw);
      const pattern = new RegExp(`^${escapeRegExp(key)}(?:[!?.]+)?(?:\\b|(?=[\\s,:{]|$))`, 'i');
      if (pattern.test(lineLower)) {
        if (/ — /.test(lineClean)) {
          break;
        }
        const ability = COSTED_KEYWORD_ABILITY.exec(lineClean);
        if (ability && keywordSet.has(normalizeKeywordKey(ability[1]))) {
          keywordText.push(ability[1]);
          lineClean = lineClean.slice(ability[1].length).trim();
          break;
        }
        const clauses = lineClean.split(',').map((clause) => clause.trim());
        const kept: string[] = [];
        for (const clause of clauses) {
          if (keywordSet.has(normalizeKeywordKey(clause))) {
            keywordText.push(clause.replace(/[!?.]+$/g, '').trim() || clause);
            continue;
          }
          const costed = COSTED_PRINTED_KEYWORD.exec(clause);
          if (costed && keywordSet.has(normalizeKeywordKey(costed[1]))) {
            keywordText.push(costed[1]);
            costs.push(...(costed[2].match(/\{[^}]+\}/g) ?? []));
            continue;
          }
          kept.push(clause);
        }
        lineClean = kept.join(', ').trim();
        break;
      }
    }

    if (lineClean) {
      stripped.push(lineClean);
    }
  }

  return { keywordText, remainder: stripped.join('\n'), costs };
}

const SAGA_CHAPTER_LABEL = /^[IVXLCDM]+(?:,\s*[IVXLCDM]+)*$/i;
const MODE_EXTRA_COST = /^((?:\{[^}]+\})+)\s+—\s+(.+)$/;

function stripAbilityLabels(text: string): { labels: string[]; remainder: string; costs: string[] } {
  const labels: string[] = [];
  const costs: string[] = [];
  const lines = text.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    const peeled = peelLabeledLine(line, labels, costs);
    if (peeled) {
      kept.push(peeled);
    }
  }

  return { labels, remainder: kept.join('\n'), costs };
}

function peelLabeledLine(line: string, labels: string[], costs: string[]): string {
  const trimmed = line.trim();
  const bullet = trimmed.startsWith('•') ? '• ' : '';
  const body = bullet ? trimmed.replace(/^•\s*/, '') : trimmed;
  const labeled = /^(.+?) — (.+)$/.exec(body);
  if (!labeled) {
    return trimmed;
  }
  const name = labeled[1].trim();
  if (EFFECT_CHOICE_PATTERN.test(name) || SAGA_CHAPTER_LABEL.test(name) || /[{}:]/.test(name)) {
    return trimmed;
  }

  labels.push(name);
  return peelModeCost(`${bullet}${labeled[2].trim()}`, costs);
}

function peelModeCost(line: string, costs: string[]): string {
  const bullet = line.startsWith('•') ? '• ' : '';
  const body = bullet ? line.replace(/^•\s*/, '') : line;
  const extra = MODE_EXTRA_COST.exec(body);
  if (!extra) {
    return line;
  }
  costs.push(...(extra[1].match(/\{[^}]+\}/g) ?? []));
  return extra[2].trim();
}

export function markStructuralElements(text: string): StructuralMark[] {
  const marks: StructuralMark[] = [];
  const lower = text.toLowerCase();
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    const assignedTextMatch = ASSIGNED_TEXT_PATTERN.exec(text.slice(i));
    if (assignedTextMatch && assignedTextMatch.index === 0) {
      marks.push({
        type: 'assigned_text',
        start: i,
        end: i + assignedTextMatch[0].length,
        text: assignedTextMatch[0]
      });
      i += assignedTextMatch[0].length;
      continue;
    }

    if (ch === '.' || ch === ';' || ch === '\n') {
      marks.push({ type: 'delimiter', start: i, end: i + 1, text: ch });
      i += 1;
      continue;
    }

    if (i === 0 || text[i - 1] === '\n') {
      const equipSlice = text.slice(i);
      const equipMatch = EQUIP_PATTERN.exec(equipSlice);
      if (equipMatch && equipMatch.index === 0) {
        marks.push({
          type: 'equip',
          start: i,
          end: i + equipMatch[0].length,
          text: text.slice(i, i + equipMatch[0].length)
        });
        i += equipMatch[0].length;
        continue;
      }
    }

    const manaSlice = text.slice(i);
    const manaMatch = MANA_SYMBOL_PATTERN.exec(manaSlice);
    if (manaMatch && manaMatch.index === 0) {
      marks.push({
        type: 'mana_cost',
        start: i,
        end: i + manaMatch[0].length,
        text: manaMatch[0]
      });
      i += manaMatch[0].length;
      continue;
    }

    const tapMatch = TAP_SYMBOL_PATTERN.exec(manaSlice);
    if (tapMatch && tapMatch.index === 0) {
      marks.push({
        type: 'tap_cost',
        start: i,
        end: i + tapMatch[0].length,
        text: tapMatch[0]
      });
      i += tapMatch[0].length;
      continue;
    }

    if (ch === ':') {
      marks.push({ type: 'cost_divider', start: i, end: i + 1, text: ':' });
      i += 1;
      continue;
    }

    if (/[a-z]/i.test(ch) && (i === 0 || !/\w/.test(text[i - 1]))) {
      const prefixMatch = matchBestPrefix(text, i);
      if (prefixMatch) {
        if (prefixMatch.prefix === 'if' && /^\s*able\b/i.test(text.slice(prefixMatch.end))) {
          i += 1;
          continue;
        }
        marks.push(prefixMatch);
        i = prefixMatch.end;
        continue;
      }

      const reflexiveMatch = REFLEXIVE_SUBORDINATE_CLAUSE_PATTERN.exec(lower.slice(i));
      if (reflexiveMatch && reflexiveMatch.index === 0) {
        marks.push({
          type: 'reflexive_subordinate_clause',
          start: i,
          end: i + reflexiveMatch[0].length,
          text: text.slice(i, i + reflexiveMatch[0].length)
        });
        i += reflexiveMatch[0].length;
        continue;
      }

      const optionalMatch = EFFECT_OPTIONAL_PATTERN.exec(lower.slice(i));
      if (optionalMatch && optionalMatch.index === 0) {
        marks.push({
          type: 'optional',
          start: i,
          end: i + optionalMatch[0].length,
          text: text.slice(i, i + optionalMatch[0].length)
        });
        i += optionalMatch[0].length;
        continue;
      }

      const choiceMatch = EFFECT_CHOICE_PATTERN.exec(lower.slice(i));
      if (choiceMatch && choiceMatch.index === 0) {
        marks.push({
          type: 'choice',
          start: i,
          end: i + choiceMatch[0].length,
          text: text.slice(i, i + choiceMatch[0].length)
        });
        i += choiceMatch[0].length;
        continue;
      }

      const replacementMatch = EFFECT_REPLACEMENT_PATTERN.exec(lower.slice(i));
      if (replacementMatch && replacementMatch.index === 0) {
        marks.push({
          type: 'replacement',
          start: i,
          end: i + replacementMatch[0].length,
          text: text.slice(i, i + replacementMatch[0].length)
        });
        i += replacementMatch[0].length;
        continue;
      }
    }

    i += 1;
  }

  return marks.sort((a, b) => a.start - b.start);
}

function matchBestPrefix(text: string, start: number): StructuralMark | null {
  const slice = text.slice(start);
  for (const { type, prefix, pattern } of PREFIX_PATTERNS) {
    const match = pattern.exec(slice);
    if (match && match.index === 0) {
      return {
        type,
        prefix,
        start,
        end: start + match[0].length,
        text: text.slice(start, start + match[0].length)
      };
    }
  }
  return null;
}

function parseText(text: string, marks: StructuralMark[]): ParsedEffect[] {
  const n = marks.length;
  let i = 0;
  let start = 0;
  const chunks = new Map<number, { text: string; marks: StructuralMark[]; end_pos: number; start_pos: number }>();
  let key = 1;
  let segmentKey = 0;
  let segmentStart = 0;
  let segmentText = '';
  let segmentMarks: StructuralMark[] = [];
  let segmentSawBullet = false;
  let activatedAbility = false;

  while (i < n) {
    const mark = marks[i];
    if (mark.type === 'delimiter') {
      if (activatedAbility || segmentKey) {
        const laterDelimiter = marks.slice(i + 1).some((entry) => entry.type === 'delimiter');
        if (mark.text !== '\n' && laterDelimiter) {
          i += 1;
          continue;
        }
        if (mark.text === '\n' && activatedAbility) {
          activatedAbility = false;
        }
      }

      const endPos = mark.end;
      const startPos = start;
      const currentMarks = marksInRange(marks, start, endPos);
      const currentText = text.slice(start, endPos);
      start = endPos;
      i += 1;

      if (currentText === '\n') {
        segmentText += currentText;
        segmentMarks = segmentMarks.concat(currentMarks);
        continue;
      }

      if (currentMarks.some((entry) => entry.type === 'replacement')) {
        if (segmentKey) {
          segmentText += currentText;
          segmentMarks = segmentMarks.concat(currentMarks);
          continue;
        }
        chunks.set(key, { text: currentText, marks: currentMarks, end_pos: endPos, start_pos: startPos });
        key += 1;
        continue;
      }

      const isForwardJoin = currentMarks.some((entry) => entry.type === 'choice');
      const isBullet = /^\s*\u2022/.test(currentText);

      if (isForwardJoin) {
        if (segmentKey) {
          segmentText += currentText;
          segmentMarks = segmentMarks.concat(currentMarks);
          continue;
        }
        segmentStart = startPos;
        segmentKey = key;
        segmentText = currentText;
        segmentMarks = currentMarks;
        segmentSawBullet = false;
        key += 1;
        continue;
      }

      if (segmentKey && isBullet) {
        segmentText += currentText;
        segmentMarks = segmentMarks.concat(currentMarks);
        segmentSawBullet = true;
        continue;
      }

      if (segmentKey && !segmentSawBullet) {
        segmentText += currentText;
        segmentMarks = segmentMarks.concat(currentMarks);
        continue;
      }

      if (segmentKey) {
        chunks.set(segmentKey, {
          text: segmentText,
          marks: segmentMarks,
          end_pos: segmentMarks[segmentMarks.length - 1]?.end ?? endPos,
          start_pos: segmentStart
        });
        segmentText = '';
        segmentMarks = [];
        segmentKey = 0;
        segmentSawBullet = false;
      }

      chunks.set(key, { text: currentText, marks: currentMarks, end_pos: endPos, start_pos: startPos });
      key += 1;
    } else {
      if (mark.type === 'cost_divider') {
        activatedAbility = true;
      }
      i += 1;
    }
  }

  if (segmentKey) {
    chunks.set(segmentKey, {
      text: text.slice(segmentStart),
      marks: marks.filter((mark) => mark.start >= segmentStart),
      end_pos: text.length,
      start_pos: segmentStart
    });
  } else {
    const lastDelim = marks.filter((mark) => mark.type === 'delimiter').sort((a, b) => b.end - a.end)[0];
    if (lastDelim && lastDelim.end < text.length) {
      chunks.set(key, {
        text: text.slice(lastDelim.end),
        marks: marks.filter((mark) => mark.start >= lastDelim.end),
        end_pos: text.length,
        start_pos: start
      });
    } else if (chunks.size === 0 && text.trim()) {
      chunks.set(key, { text, marks, end_pos: text.length, start_pos: 0 });
    }
  }

  const parsed = new Map<number, ParsedEffect>();
  for (const [chunkKey, chunk] of chunks) {
    const adjustedMarks = shiftMarksRelativeToSubtext(chunk.marks, chunk.start_pos);
    if (adjustedMarks.some((entry) => entry.type === 'equip')) {
      parsed.set(chunkKey, parseEquip(chunk.text, adjustedMarks));
    } else if (adjustedMarks.some((entry) => entry.type === 'cost_divider')) {
      parsed.set(chunkKey, parseActivatedAbility(chunk.text, adjustedMarks));
    } else if (
      adjustedMarks.some((entry) => entry.type === 'replacement') &&
      !adjustedMarks.some((entry) => entry.type === 'choice')
    ) {
      parsed.set(chunkKey, parseReplacementWithDefault(chunk.text, adjustedMarks));
    } else {
      const effect = parseEffect(chunk.text, adjustedMarks);
      effect.text = chunk.text.trim();
      parsed.set(chunkKey, effect);
    }
  }

  const merged: ParsedEffect[] = [];
  const keys = [...parsed.keys()].sort((a, b) => a - b);
  let mergeIndex = 0;
  while (mergeIndex < keys.length) {
    const chunkKey = keys[mergeIndex];
    const current = parsed.get(chunkKey)!;
    const nextKey = keys[mergeIndex + 1];
    const nextChunk = nextKey != null ? chunks.get(nextKey) : undefined;
    const nextParsed = nextKey != null ? parsed.get(nextKey) : undefined;

    if (nextChunk && nextParsed) {
      const markTypes = new Set(nextChunk.marks.map((entry) => entry.type));
      if (markTypes.has('reflexive_subordinate_clause')) {
        merged.push({
          text: `${current.text ?? ''} ${nextParsed.text ?? ''}`.trim(),
          effects: [current, nextParsed],
          modifiers: ['compound:reflexive']
        });
        mergeIndex += 2;
        continue;
      }
      if (markTypes.has('replacement')) {
        current.replacement = nextParsed;
        merged.push(current);
        mergeIndex += 2;
        continue;
      }
    }

    merged.push(current);
    mergeIndex += 1;
  }

  return merged;
}

function parseEffect(text: string, marks: StructuralMark[]): ParsedEffect {
  const effect: ParsedEffect = {};
  const clauses: ParsedClause[] = [];
  const nestedEffects: ParsedEffect[] = [];
  const modifiers: string[] = [];
  const consumedRanges: Array<[number, number]> = [];
  let i = 0;

  while (i < marks.length) {
    const mark = marks[i];
    if (mark.type === TRIGGER || mark.type === CONDITION) {
      const [clause, consumed, end] = consumeClause(text, marks.slice(i));
      clauses.push(clause);
      consumedRanges.push([mark.start, end]);
      i += consumed;
    } else if (mark.type === 'choice') {
      const [choice, consumed, end] = consumeChoiceEffect(text, marks.slice(i));
      nestedEffects.push(choice);
      modifiers.push('choice');
      consumedRanges.push([mark.start, end]);
      i += consumed;
    } else if (mark.type === 'optional') {
      modifiers.push('optional');
      consumedRanges.push([mark.start, mark.end]);
      i += 1;
    } else if (mark.type === 'assigned_text') {
      const inner = unwrapAssignedText(mark.text);
      if (inner) {
        nestedEffects.push(...parseText(inner, markStructuralElements(inner)));
      }
      consumedRanges.push([mark.start, mark.end]);
      i += 1;
    } else {
      i += 1;
    }
  }

  for (const [rangeStart, rangeEnd] of findUnmarkedRanges(text.length, consumedRanges)) {
    const residual = text.slice(rangeStart, rangeEnd).trim();
    if (residual && residual !== text.trim()) {
      nestedEffects.push({ text: residual });
    }
  }

  if (clauses.length > 0) {
    effect.clauses = clauses;
  }
  if (nestedEffects.length > 0) {
    effect.effects = nestedEffects;
  }
  if (modifiers.length > 0) {
    effect.modifiers = modifiers;
  }

  return effect;
}

function replacementClauseStart(marks: readonly StructuralMark[]): number {
  const instead = marks.find((mark) => mark.type === 'replacement');
  if (!instead) {
    return 0;
  }
  const condition = [...marks]
    .reverse()
    .find((mark) => mark.type === CONDITION && mark.start < instead.start);
  return condition?.start ?? instead.start;
}

function parseReplacementWithDefault(text: string, marks: StructuralMark[]): ParsedEffect {
  const start = replacementClauseStart(marks);
  const prefix = text
    .slice(0, start)
    .replace(/\s*,?\s*and\s*$/i, '')
    .trim();
  if (!prefix || start <= 0) {
    return parseReplacement(text, marks);
  }
  const prefixMarks = marks.filter((mark) => mark.end <= start);
  const main = parseEffect(prefix, prefixMarks);
  main.text = prefix;
  main.replacement = parseReplacement(
    text.slice(start),
    shiftMarksRelativeToSubtext(marks, start)
  );
  return main;
}

function parseReplacement(text: string, marks: StructuralMark[]): ParsedEffect {
  const replacement: ParsedEffect = { text: text.trim() };
  const replacementEffects: ParsedEffect[] = [];
  const clauses: ParsedClause[] = [];
  const modifiers: string[] = [];
  let i = 0;
  let lastConsumed = 0;

  while (i < marks.length) {
    const mark = marks[i];
    if (mark.type === CONDITION || mark.type === TRIGGER) {
      const [clause, consumed, end] = consumeClause(text, marks.slice(i));
      clauses.push(clause);
      lastConsumed = end;
      i += consumed;
    } else if (mark.type === 'optional') {
      modifiers.push('optional');
      lastConsumed = mark.end;
      i += 1;
    } else {
      i += 1;
    }
  }

  if (lastConsumed < text.length) {
    let residualEffect = text.slice(lastConsumed);
    residualEffect = residualEffect.replace(EFFECT_REPLACEMENT_PATTERN, '');
    residualEffect = residualEffect.replace(/^[,.\s]+/, '');
    residualEffect = residualEffect.replace(/\s+([.;\n])/g, '$1');
    if (residualEffect.trim()) {
      replacementEffects.push({ text: residualEffect.trim() });
    }
  }

  if (clauses.length > 0) {
    replacement.clauses = clauses;
  }
  if (replacementEffects.length > 0) {
    replacement.effects = replacementEffects;
  }
  if (modifiers.length > 0) {
    replacement.modifiers = modifiers;
  }

  return replacement;
}

function parseActivatedAbility(text: string, marks: StructuralMark[]): ParsedEffect {
  const sortedMarks = [...marks].sort((a, b) => a.start - b.start);
  const colonMark = sortedMarks.find((mark) => mark.type === 'cost_divider');
  const colonPos = colonMark?.start ?? text.length;
  const costParts: string[] = [];
  let lastCostEnd = 0;

  for (const mark of sortedMarks) {
    if (mark.start >= colonPos) {
      continue;
    }
    if (mark.type === 'mana_cost' || mark.type === 'tap_cost') {
      costParts.push(mark.text);
      lastCostEnd = Math.max(lastCostEnd, mark.end);
    }
  }

  const extraCostText = text.slice(lastCostEnd, colonPos);
  if (extraCostText.trim().replace(/,/g, '')) {
    costParts.push(extraCostText.trim().replace(/^,|,$/g, ''));
  }

  const mainEffectText = text.slice(colonPos + 1);
  const residualMarks = shiftMarksRelativeToSubtext(sortedMarks, colonPos + 1);

  return {
    text: text.trim(),
    cost: costParts,
    effects: parseText(mainEffectText, residualMarks)
  };
}

function parseEquip(text: string, marks: StructuralMark[]): ParsedEffect {
  const costParts: string[] = [];
  let lastCostEnd = marks[1]?.end ?? 0;

  for (const mark of marks) {
    if (mark.type === 'mana_cost') {
      costParts.push(mark.text);
      lastCostEnd = Math.max(lastCostEnd, mark.end);
    }
  }

  const trailingCostText = text.slice(lastCostEnd);
  if (trailingCostText.trim().replace(/[.\n]/g, '')) {
    costParts.push(trailingCostText.trim().replace(/[.\n]/g, ''));
  }

  return {
    text: text.trim(),
    cost: costParts,
    keyword: marks[0]?.text.trim() || undefined
  };
}

function unwrapAssignedText(quoted: string): string {
  const trimmed = quoted.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function consumeClause(text: string, marks: StructuralMark[]): [ParsedClause, number, number] {
  const mark = marks[0];
  const punctMatch = /[,.](\s*)/.exec(text.slice(mark.start));
  let contentEnd = punctMatch ? mark.start + punctMatch.index : text.length;

  if (mark.type === CONDITION) {
    const nextIf = marks
      .slice(1)
      .find((entry) => entry.type === CONDITION && entry.start < contentEnd);
    if (nextIf) {
      const between = text.slice(mark.end, nextIf.start);
      const andSplit = /\sand\s+/i.exec(between);
      if (andSplit) {
        contentEnd = mark.end + andSplit.index;
      }
    }
  }

  const endPos =
    punctMatch && contentEnd === mark.start + punctMatch.index
      ? mark.start + punctMatch.index + punctMatch[0].length
      : contentEnd;
  const clauseText = text.slice(mark.start, endPos).trim();
  const consumed = countMarksInRange(marks, mark.start, endPos);
  const relevantMarks = marks.slice(0, consumed).filter((entry) => entry.type === mark.type);
  const markType = mark.type as ClauseType;

  const subjects: string[] = [];
  for (let index = 0; index < relevantMarks.length; index++) {
    const relevantMark = relevantMarks[index];
    const subjectStart = relevantMark.end + 1;
    let subjectEnd: number;

    if (index + 1 < relevantMarks.length) {
      const rawChunk = text.slice(subjectStart, relevantMarks[index + 1].start);
      const cleanedChunk = rawChunk.replace(/\s*(,?\s*(and|or))?\s*$/i, '');
      subjectEnd = subjectStart + cleanedChunk.length;
    } else {
      subjectEnd = contentEnd;
    }

    const subjectText = text.slice(subjectStart, subjectEnd).trim();
    if (subjectText) {
      subjects.push(subjectText);
    }
  }

  return [{ type: markType, text: clauseText, subjects }, consumed, endPos];
}

function consumeChoiceEffect(text: string, marks: StructuralMark[]): [ParsedEffect, number, number] {
  const start = marks[0].start;
  const match = EFFECT_CHOICE_PATTERN.exec(text.slice(start));
  if (!match) {
    return [{ text: text.slice(start).trim() }, 1, text.length];
  }

  const choiceStart = start + match.index;
  const remainingText = text.slice(choiceStart);
  const lines = remainingText.split('\n');
  const clauseLines = [lines[0]];

  for (const line of lines.slice(1)) {
    if (/^\s*•/.test(line)) {
      clauseLines.push(line);
      continue;
    }
    if (!clauseLines.some((entry) => /^\s*•/.test(entry)) && EFFECT_CHOICE_PATTERN.test(line)) {
      clauseLines.push(line);
      continue;
    }
    break;
  }

  const clauseText = clauseLines.join('\n').trim();
  const headerBlock = clauseLines.filter((line) => !/^\s*•/.test(line)).join(' ');
  const afterChoose = headerBlock.slice(match[0].length).replace(/^[\s.—\-]*/u, '').trim();
  const headerVp = afterChoose
    .replace(/^that hasn['’]?t been chosen\s*/i, '')
    .replace(/^and\s+/i, '')
    .replace(/^,\s*/u, '')
    .replace(/\bwhere\s+[xyz]\b[\w\s'’/+-]*/gi, ' ')
    .replace(EFFECT_CHOICE_PATTERN, ' ')
    .replace(/\b(?:instead|otherwise)\b/gi, ' ')
    .replace(/\byou may\b/gi, ' ')
    .replace(/[.\s—\-]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  const headerEffects = headerVp.length > 0 ? parseText(headerVp, markStructuralElements(headerVp)) : [];

  const choiceItems = [...clauseText.matchAll(/•\s*(.*?)(?:[\n\r]|$)/g)].map((entry) => entry[1].trim());
  const effects = [
    ...headerEffects,
    ...choiceItems.map((item) => {
      const innerMarks = markStructuralElements(item);
      const inner = parseText(item, innerMarks);
      if (inner.length === 1) {
        return inner[0];
      }
      return { text: item, effects: inner };
    })
  ];

  const clauseEnd = choiceStart + clauseLines.join('\n').length;
  const consumed = countMarksInRange(marks, start, clauseEnd);

  return [{ text: clauseText, effects }, consumed, clauseEnd];
}

export function extractLeafEffects(effects: ParsedEffect[] | ParsedEffect | string): string[] {
  const leafTexts: string[] = [];

  if (typeof effects === 'string') {
    return effects.trim() ? [effects.trim()] : [];
  }

  if (Array.isArray(effects)) {
    for (const effect of effects) {
      leafTexts.push(...extractLeafEffects(effect));
    }
    return leafTexts;
  }

  if (effects.effects) {
    leafTexts.push(...extractLeafEffects(effects.effects));
  } else if (effects.text) {
    leafTexts.push(effects.text);
  }
  if (!Array.isArray(effects) && effects.replacement) {
    leafTexts.push(...extractLeafEffects(effects.replacement));
  }

  return leafTexts;
}

function marksInRange(marks: StructuralMark[], start: number, end: number): StructuralMark[] {
  return marks.filter((mark) => start <= mark.start && mark.start < end);
}

function shiftMarksRelativeToSubtext(marks: StructuralMark[], baseOffset: number): StructuralMark[] {
  return marks
    .filter((mark) => mark.start >= baseOffset)
    .map((mark) => ({
      ...mark,
      start: mark.start - baseOffset,
      end: mark.end - baseOffset
    }));
}

function countMarksInRange(marks: StructuralMark[], start: number, end: number): number {
  return marks.filter((mark) => start <= mark.start && mark.start < end).length;
}

function findUnmarkedRanges(textLen: number, consumedRanges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...consumedRanges].sort((a, b) => a[0] - b[0]);
  const unmarked: Array<[number, number]> = [];
  let start = 0;

  for (const [begin, end] of sorted) {
    if (start < begin) {
      unmarked.push([start, begin]);
    }
    start = Math.max(start, end);
  }

  if (start < textLen) {
    unmarked.push([start, textLen]);
  }

  return unmarked;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
