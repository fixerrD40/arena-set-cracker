import { stripGlueFromText } from './oracle-diction';
import { flattenOracleFaces, flattenOracleText, type FlattenedOracle } from './oracle-parser';

export const NAMED_HOLES = [
  'keyword_reminder',
  'choose_one',
  'dfc_layout',
  'saga_layout',
  'adventure_layout',
  'split_layout',
  'case_layout',
  'class_layout'
] as const;

export type NamedHole = (typeof NAMED_HOLES)[number];

export interface TaggerCardInput {
  name: string;
  oracleText: string;
  faces?: readonly string[];
  keywords?: readonly string[];
  layout?: string;
}

export interface TaggerCoverage {
  name: string;
  flat: FlattenedOracle;
  holes: NamedHole[];
  drawers: string[];
  remainder: string;
  unexplained: boolean;
}

const REMINDER_PATTERN = /\([^)]*\)/g;
const CHOOSE_PATTERN =
  /\bchoose\s+(?:up\s+to\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+|x|that many)(?:\s+or\s+(?:both|more))?\b/gi;

const CHANNEL_PREFIXES = [
  'whenever',
  'as long as',
  'at the beginning of',
  'at the beginning',
  'when',
  'after',
  'then',
  'if'
].sort((a, b) => b.length - a.length);

const LAYOUT_HOLES: Record<string, NamedHole> = {
  transform: 'dfc_layout',
  modal_dfc: 'dfc_layout',
  double_faced_token: 'dfc_layout',
  saga: 'saga_layout',
  adventure: 'adventure_layout',
  split: 'split_layout',
  case: 'case_layout',
  class: 'class_layout'
};

export function coverOracleCard(card: TaggerCardInput): TaggerCoverage {
  const holes: NamedHole[] = [];
  const hadReminder = REMINDER_PATTERN.test(card.oracleText);
  REMINDER_PATTERN.lastIndex = 0;
  if (hadReminder) {
    holes.push('keyword_reminder');
  }

  const keywords = card.keywords ?? [];
  const stripReminder = (text: string): string => {
    REMINDER_PATTERN.lastIndex = 0;
    return text.replace(REMINDER_PATTERN, ' ');
  };
  const faceTexts = (card.faces ?? []).map(stripReminder);
  const withoutReminder = stripReminder(card.oracleText);
  const flat = faceTexts.some((face) => face.trim())
    ? flattenOracleFaces(faceTexts, keywords)
    : flattenOracleText(withoutReminder, keywords);

  let remainder = norm(withoutReminder);
  const spans = [...flat.triggers, ...flat.conditions, ...flat.costs, ...flat.effects, ...flat.keywords]
    .map(norm)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const span of spans) {
    remainder = removeOnce(remainder, span);
  }

  if (CHOOSE_PATTERN.test(card.oracleText)) {
    holes.push('choose_one');
    remainder = remainder.replace(CHOOSE_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  }

  const layoutHole = LAYOUT_HOLES[card.layout ?? ''];
  if (layoutHole) {
    holes.push(layoutHole);
  }

  remainder = stripChannelPrefixes(remainder);
  remainder = stripLinkedEffectGlue(remainder);
  remainder = stripGlueFromText(remainder);
  remainder = remainder.replace(/\b(and|or|to)\b/g, ' ').replace(/\s+/g, ' ').trim();

  const drawers = flagDrawers(flat);
  return {
    name: card.name,
    flat,
    holes: [...new Set(holes)],
    drawers,
    remainder,
    unexplained: remainder.length > 0
  };
}

/** Effect leaf still carrying this layer's diction — that is the junk drawer. */
export function flagDrawers(flat: FlattenedOracle): string[] {
  const flags: string[] = [];
  for (const effect of flat.effects) {
    const leaf = effect.trim();
    if (!leaf) {
      continue;
    }
    if (/\bwhenever\b/i.test(leaf) || /\bat the beginning\b/i.test(leaf)) {
      flags.push('effect-holds-trigger');
    }
    if (
      /\bchoose\s+(?:up\s+to\s+)?(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+|x|that many)\b/i.test(
        leaf
      ) ||
      leaf.includes('•')
    ) {
      flags.push('effect-holds-choice');
    }
    if (/^equip(?:\s+\w+)?\s*\{/i.test(leaf)) {
      flags.push('effect-holds-equip');
    }
    if (/\bwhen you do\b/i.test(leaf)) {
      flags.push('effect-holds-you-do');
    }
  }
  return [...new Set(flags)];
}

export function clusterUnexplained(rows: readonly TaggerCoverage[]): Array<{
  remainder: string;
  count: number;
  examples: string[];
}> {
  return clusterKeys(rows.filter((row) => row.unexplained).map((row) => ({ key: row.remainder, name: row.name })));
}

export function clusterDrawers(rows: readonly TaggerCoverage[]): Array<{
  remainder: string;
  count: number;
  examples: string[];
}> {
  const entries: Array<{ key: string; name: string }> = [];
  for (const row of rows) {
    for (const drawer of row.drawers) {
      entries.push({ key: drawer, name: row.name });
    }
  }
  return clusterKeys(entries);
}

function clusterKeys(entries: readonly { key: string; name: string }[]): Array<{
  remainder: string;
  count: number;
  examples: string[];
}> {
  const buckets = new Map<string, { count: number; examples: string[] }>();
  for (const entry of entries) {
    const bucket = buckets.get(entry.key) ?? { count: 0, examples: [] };
    bucket.count += 1;
    if (bucket.examples.length < 8) {
      bucket.examples.push(entry.name);
    }
    buckets.set(entry.key, bucket);
  }
  return [...buckets.entries()]
    .map(([remainder, bucket]) => ({ remainder, ...bucket }))
    .sort((a, b) => b.count - a.count);
}

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[^\w\s{}+/ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeOnce(haystack: string, needle: string): string {
  if (!needle) {
    return haystack;
  }
  const index = haystack.indexOf(needle);
  if (index < 0) {
    return haystack;
  }
  return `${haystack.slice(0, index)} ${haystack.slice(index + needle.length)}`.replace(/\s+/g, ' ').trim();
}

function stripChannelPrefixes(text: string): string {
  let result = text;
  for (const prefix of CHANNEL_PREFIXES) {
    result = result.replace(new RegExp(`\\b${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function stripLinkedEffectGlue(text: string): string {
  return text
    .replace(/\byou may\b/g, ' ')
    .replace(/\b(if|when) you do\b/g, ' ')
    .replace(/\byou do\b/g, ' ')
    .replace(/\binstead of\b[\w\s'’/+-]*/g, ' ')
    .replace(/\binstead\b/g, ' ')
    .replace(/\botherwise\b/g, ' ')
    .replace(/\bif able\b/g, ' ')
    .replace(/\buntil your next turn\b/g, ' ')
    .replace(/\bactivate only\b[^.!]*/gi, ' ')
    .replace(/\bthat hasn['’]?t been chosen\b/g, ' ')
    .replace(/\bthat hasn t been chosen\b/g, ' ')
    .replace(/\bwhere [xyz]\b[\w\s'’/+-]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
