import { CatalogGraph } from '../graph/catalog-graph';
import { phraseKey } from '../graph/phrase-key';
import { dropPrefixPhrases, longestFirst } from '../passes/harvest';

export interface VocabularyFeed {
  feeder: string;
  feeds: string;
}

/** Feeders that supply a theme — Legendary ← The Ring tempts you. */
export function feedersForTheme(graph: CatalogGraph, theme: string): string[] {
  const key = phraseKey(theme);
  if (!key) {
    return [];
  }
  const feeders: string[] = [];
  const seen = new Set<string>();
  for (const edge of graph.harvestEdges()) {
    if (edge.to !== key || seen.has(edge.from)) {
      continue;
    }
    seen.add(edge.from);
    feeders.push(edge.from);
  }
  return dropPrefixPhrases(longestFirst(feeders));
}

/** Unattached ends of edges that touch attached themes. Deck contents do not vote. */
export function pickThemeFeeds(graph: CatalogGraph, attached: readonly string[]): VocabularyFeed[] {
  const attachedKeys = new Set(attached.map((theme) => phraseKey(theme)).filter((key) => key.length > 0));
  const picked: VocabularyFeed[] = [];
  const seen = new Set<string>();
  const harvest = graph.harvestEdges();

  const push = (feed: VocabularyFeed): void => {
    const id = `${feed.feeder}\0${feed.feeds}`;
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    picked.push(feed);
  };

  for (const theme of attached) {
    const key = phraseKey(theme);
    if (!key) {
      continue;
    }
    for (const feeder of feedersForTheme(graph, key)) {
      if (!attachedKeys.has(feeder)) {
        push({ feeder, feeds: key });
        break;
      }
    }
    const counted = longestFirst(
      harvest.filter((edge) => edge.from === key && edge.kind === 'count').map((edge) => edge.to)
    );
    for (const feedsPhrase of counted) {
      if (!attachedKeys.has(feedsPhrase)) {
        push({ feeder: key, feeds: feedsPhrase });
        break;
      }
    }
  }

  return picked;
}

export function pickThemeFeed(graph: CatalogGraph, attached: readonly string[]): VocabularyFeed | null {
  return pickThemeFeeds(graph, attached)[0] ?? null;
}
