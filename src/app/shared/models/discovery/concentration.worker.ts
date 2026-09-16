import { concentrate } from './concentration';
import { MtgCard } from '../card/card';
import { SetVocabulary } from '../card/set-vocabulary';
import type { ConcentratedPattern } from './concentration';

interface ConcentrateWorkerRequest {
  id: number;
  cards: MtgCard[];
  vocabulary?: SetVocabulary[];
}

interface ConcentrateWorkerResponse {
  id: number;
  patterns: ConcentratedPattern[];
}

addEventListener('message', (event: MessageEvent<ConcentrateWorkerRequest>) => {
  const { id, cards, vocabulary } = event.data;
  const patterns = concentrate(cards ?? [], vocabulary ?? []);
  const response: ConcentrateWorkerResponse = { id, patterns };
  postMessage(response);
});
