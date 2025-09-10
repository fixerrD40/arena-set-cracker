import json
import sys
from typing import List, Dict, Counter
from collections import Counter, defaultdict
from cards_transform import transform
from oracle_parser import parse_oracle
from ngrams import get_common_ngrams, count_ngrams_in_corpus, ngram_to_tokens, count_ngram_in_tokens, ngram_to_string
from tokens import get_common_tokens

VALID_COLORS = {"W", "U", "B", "R", "G"}
ORACLE_FIELDS = ["triggers", "effects", "conditions"]


def emergence_score(freq_a, freq_b, total_a, total_b):
    p_a = freq_a / total_a if total_a else 0
    p_b = freq_b / total_b if total_b else 0

    delta = p_b - p_a
    alpha = .2
    return max(0, (1 - alpha) * delta + alpha * p_b)


def score_cards(
    data: List[Dict],
    primary_color: str,
    colors: List[str]
) -> dict[str, dict[str, List[str]]]:
    """
    Scores and ranks cards based on match with emergent tokens/phrases from
    primary/secondary color comparisons.

    Args:
        data: List of card dicts (raw from Scryfall).
        primary_color: e.g., 'U'
        colors: e.g., ['U', 'G']

    Returns:
        List of dicts with name and score, sorted by score descending.
    """

    # Input validation
    if primary_color not in VALID_COLORS:
        raise ValueError(f"Invalid primary color '{primary_color}'. Must be one of {VALID_COLORS}")

    for color in colors:
        if color not in VALID_COLORS:
            raise ValueError(f"Invalid support color '{colors}'. Must be one of {VALID_COLORS}")

    cards_parsed_oracle = parse_oracle(data)
    all_cards = transform(data, cards_parsed_oracle)

    mono_cards = {
        name: card for name, card in all_cards.items()
        if len(card.get("color_identity", [])) == 1
    }
    num = len(mono_cards)

    colorless_cards = {
        name: card for name, card in all_cards.items()
        if card.get("color_identity", []) == []
    }

    primary_cards = {
        name: card for name, card in all_cards.items()
        if card.get("color_identity", []) == [primary_color]
    }
    num_primary = len(primary_cards)

    dual_cards = {
        name: card for name, card in all_cards.items()
        if set(card.get("color_identity", [])) <= set(colors)
           and card.get("color_identity", []) != []
    }
    num_dual = len(dual_cards)

    # === Token boost calculation ===
    dual_tokens_freqs = get_common_tokens(dual_cards)
    dual_tokens_freqs_primary = Counter()
    dual_tokens_freqs_all = Counter()

    for token in dual_tokens_freqs:
        for card in primary_cards.values():
            if token == 'equip':
                if token in [k.lower() for k in card.get("keywords", [])]:
                    dual_tokens_freqs_primary[token] += 1
                    continue
            types = [t.lower() for t in card.get("types", [])]
            if token in types:
                dual_tokens_freqs_primary[token] += 1

        for card in mono_cards.values():
            if token == 'equip':
                if token in [k.lower() for k in card.get("keywords", [])]:
                    dual_tokens_freqs_all[token] += 1
                    continue
            types = [t.lower() for t in card.get("types", [])]
            if token in types:
                dual_tokens_freqs_all[token] += 1

    dual_emergent = {}
    primary_emergent = {}

    for token in dual_tokens_freqs:
        dual = emergence_score(dual_tokens_freqs_all[token], dual_tokens_freqs[token], num, num_dual)
        primary = emergence_score(dual_tokens_freqs[token], dual_tokens_freqs_primary[token], num_dual, num_primary)

        if dual > .07:
            dual_emergent[token] = dual
        if primary > .07:
            primary_emergent[token] = primary

    # === Phrase boost calculation ===
    dual_ngrams_freqs = get_common_ngrams(dual_cards)
    dual_ngrams_freqs_primary = count_ngrams_in_corpus(primary_cards, set(dual_ngrams_freqs.keys()))
    dual_ngrams_freqs_all = count_ngrams_in_corpus(mono_cards, set(dual_ngrams_freqs.keys()))

    for ngram in dual_ngrams_freqs:
        dual = emergence_score(dual_ngrams_freqs_all[ngram], dual_ngrams_freqs[ngram], num, num_dual)
        primary = emergence_score(dual_ngrams_freqs[ngram], dual_ngrams_freqs_primary[ngram], num_dual, num_primary)

        if dual > .07:
            dual_emergent[ngram] = dual
        if primary > .07:
            primary_emergent[ngram] = primary

    relevant_cards = {**dual_cards, **colorless_cards}

    dual_element_to_cards = defaultdict(list)
    primary_element_to_cards = defaultdict(list)

    # === Match elements to cards
    for element, _ in dual_emergent.items():
        for name, card in relevant_cards.items():
            if isinstance(element, str):
                if card_has_token(card, element):
                    dual_element_to_cards[element].append(name)
            else:
                if card_has_phrase(card, element):
                    dual_element_to_cards[ngram_to_string(element)].append(name)

    for element, _ in primary_emergent.items():
        for name, card in relevant_cards.items():
            if isinstance(element, str):
                if card_has_token(card, element):
                    primary_element_to_cards[element].append(name)
            else:
                if card_has_phrase(card, element):
                    primary_element_to_cards[ngram_to_string(element)].append(name)

    return {
        "dual_emergent": dict(dual_element_to_cards),
        "primary_emergent": dict(primary_element_to_cards)
    }


def card_has_token(card, token):
    if token == 'equip':
        return token in [k.lower() for k in card.get("keywords", [])]
    if token in [t.lower() for t in card.get("types", [])]:
        return True
    for field in ORACLE_FIELDS:
        for token_list in card.get(field, []):
            if token in token_list:
                return True
    return False


def card_has_phrase(card, phrase_ngram):
    phrase_tokens = ngram_to_tokens(phrase_ngram)
    for field in ORACLE_FIELDS:
        for token_list in card.get(field, []):
            if count_ngram_in_tokens(token_list, phrase_tokens) > 0:
                return True
    return False


def load_cards(path):
    with open(path, "r") as f:
        return json.load(f)


if __name__ == "__main__":
    input_data = json.load(sys.stdin)

    cards = input_data["cards"]
    deck_primary_color = input_data["primary_color"]
    deck_colors = input_data["colors"]

    result = score_cards(cards, deck_primary_color, deck_colors)

    print(json.dumps(result))
    sys.stdout.flush()
