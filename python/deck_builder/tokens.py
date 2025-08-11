import collections
from typing import Dict, List, Tuple


MIN_FREQ_PROP = 0.02

def extract_tokens_from_fields(
    flattened_cards: Dict[str, Dict],
    fields: List[str]
) -> List[str]:
    """
    Extract lowercase tokens from specified fields across all cards.
    """
    tokens = []

    for card in flattened_cards.values():
        for field in fields:
            for token in card.get(field, []):
                tokens.append(token.lower())

    return tokens


def count_and_sort_tokens(
    tokens: List[str],
    min_freq: int
) -> List[Tuple[str, int]]:
    """
    Count and return sorted list of (token, frequency) pairs with frequency >= min_freq.
    Sorted by descending frequency, then alphabetical.
    """
    counts = collections.Counter(tokens)
    filtered = [(tok, freq) for tok, freq in counts.items() if freq >= min_freq]
    return sorted(filtered, key=lambda x: (-x[1], x[0]))


def get_common_tokens(flattened_cards: Dict[str, Dict]) -> List[Tuple[str, int]]:
    total_cards = len(flattened_cards)
    min_freq = int(total_cards * MIN_FREQ_PROP)
    fields = ["types"]

    tokens = extract_tokens_from_fields(flattened_cards, fields)
    return count_and_sort_tokens(tokens, min_freq)