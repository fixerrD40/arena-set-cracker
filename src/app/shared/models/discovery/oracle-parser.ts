import { MtgCard } from '../card/card';

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
}

export interface FlattenedOracle {
  triggers: string[];
  conditions: string[];
  effects: string[];
}

const TRIGGER = 'trigger';
const CONDITION = 'condition';

const TRIGGER_PREFIX = ['whenever', 'when', 'at the beginning', 'after'] as const;
const CONDITION_PREFIX = ['if', 'as long as'] as const;

const CORE_KEYWORDS = new Set([
  'deathtouch',
  'double strike',
  'first strike',
  'flash',
  'flying',
  'indestructible',
  'haste',
  'lifelink',
  'menace',
  'reach',
  'trample',
  'vigilance'
]);

const REFLEXIVE_SUBORDINATE_CLAUSE_PATTERN = /\byou do\b/i;
const EFFECT_CHOICE_PATTERN = /\bchoose\s(one|two)\b/i;
const EFFECT_OPTIONAL_PATTERN = /\byou may\b/i;
const EFFECT_REPLACEMENT_PATTERN = /\binstead\b/i;
const MANA_SYMBOL_PATTERN = /\{(?:[WUBRG]\/[WUBRG]|[WUBRG]|\d+|X)\}/i;
const TAP_SYMBOL_PATTERN = /\{T\}/i;
const EQUIP_PATTERN = /^equip (?:\w+ )?/i;
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
  const { remainder } = stripKeywords(oracleText, keywords);
  const marks = markStructuralElements(remainder);
  return parseText(remainder, marks);
}

export function flattenOracleText(oracleText: string, keywords: readonly string[] = []): FlattenedOracle {
  return flattenParsedOracle(parseOracleText(oracleText, keywords));
}

export function flattenOracleCard(card: Pick<MtgCard, 'oracleText'>): FlattenedOracle {
  return flattenOracleText(card.oracleText ?? '');
}

export function flattenParsedOracle(parsed: readonly ParsedEffect[]): FlattenedOracle {
  const triggers: string[] = [];
  const conditions: string[] = [];
  const effects: string[] = [];

  for (const entry of parsed) {
    collectClauses(entry, triggers, conditions);

    if (entry.effects) {
      effects.push(...extractLeafEffects(entry.effects));
    } else if (entry.text) {
      effects.push(entry.text);
    }
  }

  return { triggers, conditions, effects };
}

function collectClauses(entry: ParsedEffect, triggers: string[], conditions: string[]): void {
  for (const clause of entry.clauses ?? []) {
    if (clause.type === TRIGGER) {
      triggers.push(...clause.subjects);
    } else if (clause.type === CONDITION) {
      conditions.push(...clause.subjects);
    }
  }
  for (const nested of entry.effects ?? []) {
    collectClauses(nested, triggers, conditions);
  }
  if (entry.replacement) {
    collectClauses(entry.replacement, triggers, conditions);
  }
}

function stripKeywords(text: string, keywords: readonly string[]): { keywordText: string[]; remainder: string } {
  const lines = text.split('\n');
  const stripped: string[] = [];
  const coreKeywords = [...new Set(keywords.map((kw) => kw.toLowerCase()))].filter((kw) => CORE_KEYWORDS.has(kw));
  const coreKeywordSet = new Set(coreKeywords);

  for (const line of lines) {
    let lineClean = line.replace(/ ?\([^)]*\)/g, '');
    const lineLower = lineClean.toLowerCase();

    for (const kw of coreKeywords) {
      const pattern = new RegExp(`^${escapeRegExp(kw)}\\b`);
      if (pattern.test(lineLower)) {
        const clauses = lineClean.split(',').map((clause) => clause.trim());
        lineClean = clauses.filter((clause) => !coreKeywordSet.has(clause.toLowerCase())).join(', ').trim();
        break;
      }
    }

    if (lineClean) {
      stripped.push(lineClean);
    }
  }

  return { keywordText: coreKeywords, remainder: stripped.join('\n') };
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
  let activatedAbility = false;

  while (i < n) {
    const mark = marks[i];
    if (mark.type === 'delimiter') {
      if (activatedAbility) {
        if (mark.text !== '\n' && i !== n - 1) {
          i += 1;
          continue;
        }
        if (mark.text === '\n') {
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
        chunks.set(key, { text: currentText, marks: currentMarks, end_pos: endPos, start_pos: startPos });
        key += 1;
        continue;
      }

      const isForwardJoin = currentMarks.some((entry) => entry.type === 'choice');
      const isBullet = currentText.startsWith('\u2022');

      if (isForwardJoin) {
        segmentStart = startPos;
        segmentKey = key;
        segmentText = currentText;
        segmentMarks = currentMarks;
        key += 1;
        continue;
      }

      if (isBullet && segmentKey) {
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
      text: segmentText,
      marks: segmentMarks,
      end_pos: segmentMarks[segmentMarks.length - 1]?.end ?? text.length,
      start_pos: segmentStart
    });
  }

  const lastDelim = marks.filter((mark) => mark.type === 'delimiter').sort((a, b) => b.end - a.end)[0];
  if (lastDelim && lastDelim.end < text.length) {
    chunks.set(key, {
      text: text.slice(lastDelim.end),
      marks: marks.filter((mark) => mark.start >= lastDelim.end),
      end_pos: text.length,
      start_pos: start
    });
  }

  const parsed = new Map<number, ParsedEffect>();
  for (const [chunkKey, chunk] of chunks) {
    const adjustedMarks = shiftMarksRelativeToSubtext(chunk.marks, chunk.start_pos);
    if (adjustedMarks.some((entry) => entry.type === 'replacement')) {
      parsed.set(chunkKey, parseReplacement(chunk.text, adjustedMarks));
    } else if (adjustedMarks.some((entry) => entry.type === 'equip')) {
      parsed.set(chunkKey, parseEquip(chunk.text, adjustedMarks));
    } else if (adjustedMarks.some((entry) => entry.type === 'cost_divider')) {
      parsed.set(chunkKey, parseActivatedAbility(chunk.text, adjustedMarks));
    } else {
      const effect = parseEffect(chunk.text, adjustedMarks);
      const nextChunk = chunks.get(chunkKey + 1);
      let endPos = chunk.end_pos;
      if (nextChunk && nextChunk.marks.some((entry) => entry.type === 'replacement')) {
        endPos = Math.max(endPos, nextChunk.end_pos);
      }
      effect.text = text.slice(chunk.start_pos, endPos).trim();
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
  const costParts: string[] = [];
  let lastCostEnd = 0;

  for (const mark of sortedMarks) {
    if (mark.type === 'mana_cost' || mark.type === 'tap_cost') {
      costParts.push(mark.text);
      lastCostEnd = Math.max(lastCostEnd, mark.end);
    }
  }

  const colonMark = sortedMarks.find((mark) => mark.type === 'cost_divider');
  const colonPos = colonMark?.start ?? text.length;
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
    effects: [{ text: marks[0]?.text.trim() ?? '' }]
  };
}

function consumeClause(text: string, marks: StructuralMark[]): [ParsedClause, number, number] {
  const mark = marks[0];
  const endMatch = /[,.](\s*)/.exec(text.slice(mark.start));
  const toConsume = endMatch ? endMatch.index + 2 : text.length - mark.start;
  const endPos = mark.start + toConsume;
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
      subjectEnd = endPos - 2;
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
    } else {
      break;
    }
  }

  const clauseText = clauseLines.join('\n').trim();
  const choiceItems = [...clauseText.matchAll(/•\s*(.*?)(?:[\n\r]|$)/g)].map((entry) => entry[1].trim());
  const effects = choiceItems.map((item) => ({
    text: `• ${item}`,
    effects: [{ text: item }]
  }));

  const clauseEnd = start + clauseLines.join('\n').length;
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
