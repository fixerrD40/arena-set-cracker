import { describe, expect, it } from 'vitest';
import { clusterDrawers, clusterUnexplained, coverOracleCard } from './oracle-tagger-coverage';

const dumpPath = process.env.ORACLE_EVAL_DUMP;

describe.skipIf(!dumpPath)('oracle tagger catalog eval', () => {
  it('prints coverage and unexplained clusters', async () => {
    const { readFileSync, writeFileSync } = await import('node:fs');
    const raw = JSON.parse(readFileSync(dumpPath!, 'utf8')) as ScryfallCard[];
    const seen = new Set<string>();
    const rows = [];
    for (const card of raw) {
      const oracleText = oracleOf(card);
      if (!oracleText.trim()) {
        continue;
      }
      const key = `${card.oracle_id ?? card.name}::${oracleText}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      rows.push(
        coverOracleCard({
          name: card.name,
          oracleText,
          faces: facesOf(card),
          keywords: card.keywords ?? [],
          layout: card.layout
        })
      );
    }

    const unexplained = rows.filter((row) => row.unexplained);
    const drawerRows = rows.filter((row) => row.drawers.length > 0);
    const clusters = clusterUnexplained(rows);
    const drawers = clusterDrawers(rows);
    const holeCounts: Record<string, number> = {};
    for (const row of rows) {
      for (const hole of row.holes) {
        holeCounts[hole] = (holeCounts[hole] ?? 0) + 1;
      }
    }
    const channels = rows.reduce(
      (acc, row) => {
        acc.triggers += row.flat.triggers.length;
        acc.conditions += row.flat.conditions.length;
        acc.costs += row.flat.costs.length;
        acc.effects += row.flat.effects.length;
        acc.keywords += row.flat.keywords.length;
        acc.pointers += row.flat.pointers.length;
        return acc;
      },
      { triggers: 0, conditions: 0, costs: 0, effects: 0, keywords: 0, pointers: 0 }
    );

    const report = {
      cards: rows.length,
      covered: rows.length - unexplained.length,
      unexplained: unexplained.length,
      drawers: drawerRows.length,
      channels,
      holes: holeCounts,
      clusters: clusters.slice(0, 20),
      drawerClusters: drawers.slice(0, 12)
    };
    writeFileSync('/tmp/oracle-parse-eval/coverage.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (clusters.length > 0) {
      console.log('\nPAUSE — unexplained remainder. Reclassify; do not stuff into effect.\n');
      for (const cluster of clusters.slice(0, 12)) {
        console.log(`  [${cluster.count}] "${cluster.remainder}"`);
        console.log(`      e.g. ${cluster.examples.join(', ')}`);
      }
    }
    if (drawers.length > 0) {
      console.log('\nPAUSE — effect leaves still hold this layer\'s diction (not a VP to punt).\n');
      for (const cluster of drawers.slice(0, 12)) {
        console.log(`  [${cluster.count}] ${cluster.remainder}`);
        console.log(`      e.g. ${cluster.examples.join(', ')}`);
      }
    }
    expect(rows.length).toBeGreaterThan(0);
  });
});

interface ScryfallCard {
  name: string;
  oracle_id?: string;
  oracle_text?: string;
  keywords?: string[];
  layout?: string;
  card_faces?: Array<{ oracle_text?: string }>;
}

function facesOf(card: ScryfallCard): string[] {
  return (card.card_faces ?? []).map((face) => face.oracle_text ?? '').filter(Boolean);
}

function oracleOf(card: ScryfallCard): string {
  const faces = facesOf(card);
  if (faces.length > 0) {
    return faces.join('\n');
  }
  return card.oracle_text ?? '';
}
