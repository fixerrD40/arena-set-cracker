import { MtgDeck } from '../../../shared/models/deck/deck';
import { mapDeckToJson } from '../../../shared/models/deck/deck.mappers';

/**
 * Map does not JSON.stringify; the server requires deck payload.cards as an object.
 */
export function toOutboxPayload(entityType: 'set' | 'deck', domainModel: unknown): unknown {
  if (
    entityType === 'deck' &&
    domainModel &&
    typeof domainModel === 'object' &&
    (domainModel as MtgDeck).cards instanceof Map
  ) {
    return mapDeckToJson(domainModel as MtgDeck);
  }
  return domainModel;
}
