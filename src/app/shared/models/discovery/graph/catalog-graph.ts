export type NodeKind = 'card' | 'phrase';

export type IncidenceKind = 'trigger' | 'condition' | 'effect' | 'type' | 'keyword';

export type HarvestKind = 'produce' | 'count';

export type EdgeKind = IncidenceKind | HarvestKind | 'pair';

export const INCIDENCE_KINDS: readonly IncidenceKind[] = [
  'trigger',
  'condition',
  'effect',
  'type',
  'keyword'
];

export const LOCK_INCIDENCE_KINDS: readonly IncidenceKind[] = ['trigger', 'condition', 'effect'];

export interface CatalogEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: EdgeKind;
  readonly together?: number;
  readonly lift?: number;
}

export interface PairPayload {
  together: number;
  lift: number;
}

export class CatalogGraph {
  private constructor(
    readonly cards: ReadonlySet<string>,
    readonly phrases: ReadonlySet<string>,
    readonly edges: readonly CatalogEdge[]
  ) {}

  static empty(): CatalogGraph {
    return new CatalogGraph(new Set(), new Set(), []);
  }

  static from(cards: Iterable<string>, phrases: Iterable<string>, edges: readonly CatalogEdge[]): CatalogGraph {
    return new CatalogGraph(new Set(cards), new Set(phrases), edges);
  }

  incidenceKinds(cardId: string, phrase: string): IncidenceKind[] {
    const kinds: IncidenceKind[] = [];
    for (const edge of this.edges) {
      if (edge.from !== cardId || edge.to !== phrase || !isIncidenceKind(edge.kind)) {
        continue;
      }
      if (!kinds.includes(edge.kind)) {
        kinds.push(edge.kind);
      }
    }
    return kinds;
  }

  harvestEdges(): CatalogEdge[] {
    return this.edges.filter((edge) => isHarvestKind(edge.kind));
  }

  pairEdges(): CatalogEdge[] {
    return this.edges.filter((edge) => edge.kind === 'pair');
  }
}

export class CatalogGraphBuilder {
  private readonly cards = new Set<string>();
  private readonly phrases = new Set<string>();
  private readonly edges: CatalogEdge[] = [];
  private readonly edgeKeys = new Set<string>();

  addCard(id: string): this {
    if (id) {
      this.cards.add(id);
    }
    return this;
  }

  addPhrase(key: string): this {
    if (key) {
      this.phrases.add(key);
    }
    return this;
  }

  addEdge(edge: CatalogEdge): this {
    if (!edge.from || !edge.to || edge.from === edge.to) {
      return this;
    }
    const key = `${edge.kind}\0${edge.from}\0${edge.to}`;
    if (this.edgeKeys.has(key)) {
      return this;
    }
    this.edgeKeys.add(key);
    this.edges.push(edge);
    return this;
  }

  get phraseKeys(): ReadonlySet<string> {
    return this.phrases;
  }

  build(): CatalogGraph {
    return CatalogGraph.from(this.cards, this.phrases, this.edges);
  }
}

export function emptyCatalogGraph(): CatalogGraph {
  return CatalogGraph.empty();
}

export function isIncidenceKind(kind: EdgeKind): kind is IncidenceKind {
  return (INCIDENCE_KINDS as readonly string[]).includes(kind);
}

export function isHarvestKind(kind: EdgeKind): kind is HarvestKind {
  return kind === 'produce' || kind === 'count';
}

export function isLockIncidence(kind: IncidenceKind): boolean {
  return (LOCK_INCIDENCE_KINDS as readonly string[]).includes(kind);
}
