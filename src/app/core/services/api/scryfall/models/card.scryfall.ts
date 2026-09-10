export interface ScryfallImageUris {
  normal: string;
  small?: string;
  large?: string;
  art_crop?: string;
}

export interface ScryfallCardFace {
  name: string;
  type_line?: string;
  colors?: string[];
  oracle_text?: string;
  power?: string;
  toughness?: string;
  image_uris?: ScryfallImageUris;
}

export class ScryfallCard {
  id!: string;
  name!: string;
  arena_id?: number;
  collector_number?: string;
  type_line?: string;
  rarity?: string;
  mana_cost?: string;
  oracle_text?: string;
  colors?: string[];
  keywords?: string[];
  power?: string;
  toughness?: string;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];

  constructor(init?: Partial<ScryfallCard>) {
    if (init) {
      Object.assign(this, init);
    }
  }

  /**
   * Computed Helper: Safely extracts normal artwork across single-faced
   * or multi-faced/modal double-faced cards (MDFCs)
   */
  get normalArtworkUrl(): string {
    return this.imageUrl('normal');
  }

  get illustrationArtworkUrl(): string {
    return this.imageUrl('art_crop');
  }

  private imageUrl(kind: 'normal' | 'art_crop'): string {
    return this.image_uris?.[kind] || this.card_faces?.[0]?.image_uris?.[kind] || '';
  }
}
