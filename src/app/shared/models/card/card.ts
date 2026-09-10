/**
 * Pure, decoupled application UI domain model.
 */
export interface MtgCard {
  id: string;
  setId: string;
  arenaId: number;
  collectorNumber: string;
  scryfallId: string;
  name: string;
  localArtUri: string;
  localIllustrationUri: string;
  typeLine: string;
  colors: string[];
  rarity: string;
  manaCost: string;
  oracleText: string;
  keywords: string[];
  power: string;
  toughness: string;
}
