import { MtgSet, CloudSetPayload } from './set';
import { SetRow, SetInsert } from '../../../core/sqlite/sqlite.schema';
import { ScryfallSet } from '../../../core/services/api/scryfall/models/set.scryfall';
import { nowIso } from '../sync-timestamp';

/** Maps a SQLite set row to domain. localArtUri is resolved later by SetService. */
export function mapRowToSet(row: SetRow): MtgSet {
  return {
    id: row.id,
    code: row.code.toUpperCase(),
    name: row.name,
    iconSvgUri: row.iconSvgUri,
    localArtUri: '',
    updatedAt: row.updatedAt?.trim() || undefined,
    mergeBaseUpdatedAt: row.mergeBaseUpdatedAt?.trim() || undefined
  };
}

/** Maps a cloud API set payload to domain. */
export function mapJsonToSet(payload: CloudSetPayload): MtgSet {
  return {
    id: payload.id,
    code: (payload.code || '').toUpperCase(),
    name: payload.name || 'Unknown Expansion',
    iconSvgUri: payload.iconSvgUri || '',
    localArtUri: '',
    updatedAt: payload.updatedAt?.trim() || undefined
  };
}

/** Maps a Scryfall set payload to domain. */
export function mapScryfallToDomainSet(apiSet: ScryfallSet): MtgSet {
  return {
    id: apiSet.id,
    code: (apiSet.code || '').toUpperCase().trim(),
    name: apiSet.name || 'Unknown Expansion',
    iconSvgUri: apiSet.icon_svg_uri || '',
    localArtUri: '',
    updatedAt: nowIso()
  };
}

/** Serializes domain set for SQLite insert (codes stored lowercase). */
export function serializeSetToSqlite(set: MtgSet): SetInsert {
  return {
    id: set.id,
    code: set.code.toLowerCase(),
    name: set.name,
    iconSvgUri: set.iconSvgUri,
    // Writes always carry a clock; null would lose every later contest.
    updatedAt: set.updatedAt?.trim() || nowIso(),
    mergeBaseUpdatedAt: set.mergeBaseUpdatedAt?.trim() || null
  };
}

/** Serializes domain set for cloud API payloads. */
export function serializeSetToJSON(set: MtgSet): CloudSetPayload {
  return {
    id: set.id,
    code: set.code.toUpperCase(),
    name: set.name,
    iconSvgUri: set.iconSvgUri,
    updatedAt: set.updatedAt?.trim() || nowIso()
  };
}
