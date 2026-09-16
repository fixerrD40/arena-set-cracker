import { SetVocabularyInsert, SetVocabularyRow } from '../../../core/sqlite/sqlite.schema';
import { ScryfallCard } from '../../../core/services/api/scryfall/models/card.scryfall';
import { SetVocabulary } from './set-vocabulary';

export function mapRowToVocabulary(row: SetVocabularyRow): SetVocabulary {
  return {
    id: row.id,
    setId: row.setId,
    name: row.name,
    typeLine: row.typeLine,
    oracleText: row.oracleText || '',
    keywords: row.keywords ?? []
  };
}

export function mapVocabularyToInsert(entry: SetVocabulary): SetVocabularyInsert {
  return {
    id: entry.id,
    setId: entry.setId,
    name: entry.name,
    typeLine: entry.typeLine,
    oracleText: entry.oracleText || '',
    keywords: entry.keywords ?? []
  };
}

export function mapScryfallToVocabulary(apiCard: ScryfallCard, setId: string): SetVocabulary {
  return {
    id: apiCard.id,
    setId,
    name: apiCard.name,
    typeLine: apiCard.type_line || '',
    oracleText: apiCard.oracle_text || (apiCard.card_faces || [])
      .map((face) => face.oracle_text || '')
      .filter((text) => text.length > 0)
      .join('\n'),
    keywords: apiCard.keywords ?? []
  };
}
