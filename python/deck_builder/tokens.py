import collections
from typing import Dict, List

MIN_FREQ_PROP = 0.02

def get_common_tokens(flattened_cards: Dict[str, Dict]) -> collections.Counter:
    total_cards = len(flattened_cards)
    min_freq = int(total_cards * MIN_FREQ_PROP)

    counts = collections.Counter()

    for card in flattened_cards.values():
        counts.update(token.lower() for token in card.get('types', []))
        # not ready to take on keywords, but want to hack equipment in
        if 'Equip' in card.get('keywords', []):
            counts['equip'] += 1

    filtered_counts = collections.Counter({tok: freq for tok, freq in counts.items() if freq >= min_freq})

    return filtered_counts