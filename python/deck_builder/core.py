import json
import sys
from typing import List, Dict, Counter
from collections import Counter
from cards_transform import transform
from oracle_parser import parse_oracle
from ngrams import get_common_ngrams, count_ngrams_in_corpus, ngram_to_tokens, count_ngram_in_tokens
from tokens import get_common_tokens

VALID_COLORS = {"W", "U", "B", "R", "G"}

RARITY_PENALTY = {
    "common":    1.00,
    "uncommon":  0.75,
    "rare":      0.5,
    "mythic":    0.4
}


def emergence_score(freq_global, freq_dual, freq_primary,
                    total_global, total_dual, total_primary,
                    w_dual, w_primary,
                    alpha, beta):
    """
    Scores phrases by combining emergence and absolute dual/primary presence.
    Applies an explicit penalty for flat distributions.
    """

    if freq_primary < 3:
        return 0

    # Relative frequencies
    p_global = freq_global / total_global if total_global else 0
    p_dual = freq_dual / total_dual if total_dual else 0
    p_primary = freq_primary / total_primary if total_primary else 0

    # Delta components
    delta_dual = p_dual - p_global
    delta_primary = p_primary - p_dual

    # Core emergence score
    dual_component = (1 - alpha) * delta_dual + alpha * p_dual
    primary_component = (1 - beta) * delta_primary + beta * p_primary
    total_emergence = (w_dual * dual_component) + (w_primary * primary_component)

    return total_emergence


def score_cards(
    data: List[Dict],
    primary_color: str,
    secondary_color: str
) -> List[Dict]:
    """
    Scores and ranks cards based on match with emergent tokens/phrases from
    primary/secondary color comparisons.

    Args:
        data: List of card dicts (raw from Scryfall).
        primary_color: e.g., 'U'
        secondary_color: e.g., 'G'

    Returns:
        List of dicts with name and score, sorted by score descending.
    """

    # Input validation
    if primary_color not in VALID_COLORS:
        raise ValueError(f"Invalid primary color '{primary_color}'. Must be one of {VALID_COLORS}")

    primary = [primary_color]

    if secondary_color not in VALID_COLORS:
        raise ValueError(f"Invalid secondary color '{secondary_color}'. Must be one of {VALID_COLORS}")

    secondary = [secondary_color]

    cards_parsed_oracle = parse_oracle(data)
    all_cards = transform(data, cards_parsed_oracle)

    cards = {
        name: card for name, card in all_cards.items()
        if len(card.get("color_identity", [])) == 1
    }
    num = len(cards)

    colorless_cards = {
        name: card for name, card in all_cards.items()
        if card.get("color_identity", []) == []
    }

    primary_cards = {
        name: card for name, card in all_cards.items()
        if card.get("color_identity", []) == primary
    }
    num_primary = len(primary_cards)

    dual_cards = {
        name: card for name, card in all_cards.items()
        if all(elem in card.get("color_identity", []) for elem in primary + secondary)
           or card.get("color_identity", []) == primary
           or card.get("color_identity", []) == secondary
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

        for card in cards.values():
            if token == 'equip':
                if token in [k.lower() for k in card.get("keywords", [])]:
                    dual_tokens_freqs_all[token] += 1
                    continue
            types = [t.lower() for t in card.get("types", [])]
            if token in types:
                dual_tokens_freqs_all[token] += 1

    token_scores = {}

    for token in dual_tokens_freqs:
        score = emergence_score(
            dual_tokens_freqs_all[token],
            dual_tokens_freqs[token],
            dual_tokens_freqs_primary[token],
            num,
            num_dual,
            num_primary,
            1,
            1,
            0,
            0
        )

        if score > 0:
            token_scores[token] = score

    # === Phrase boost calculation ===
    dual_ngrams_freqs = get_common_ngrams(dual_cards)
    dual_ngrams_freqs_primary = count_ngrams_in_corpus(primary_cards, set(dual_ngrams_freqs.keys()))
    dual_ngrams_freqs_all = count_ngrams_in_corpus(cards, set(dual_ngrams_freqs.keys()))

    phrase_scores = {}

    for ngram in dual_ngrams_freqs:
        score = emergence_score(
            dual_ngrams_freqs_all.get(ngram, 0),
            dual_ngrams_freqs.get(ngram, 0),
            dual_ngrams_freqs_primary.get(ngram, 0),
            num,
            num_dual,
            num_primary,
            .5,
            .5,
        .4,
            .4
        )

        if score > 0:
            phrase_scores[ngram] = score

    # === Scoring ===
    scored_cards = []
    for name, card in (dual_cards | colorless_cards).items():
        token_score = 0
        phrase_score = 0

        # Phrase scoring: from oracle fields
        field_weights = {
            "triggers": 3.0,
            "effects": 1.0,
            "conditions": 1.0
        }

        # Token scoring: from types and keywords
        types = [t.lower() for t in card.get("types", [])]
        keywords = [k.lower() for k in card.get("keywords", [])]

        for token, weight in token_scores.items():
            # Score for presence in types or keywords
            if token in types:
                token_score += weight
            if token in keywords:
                phrase_score += weight

            # Score for presence in parsed oracle fields
            for field, field_weight in field_weights.items():
                for token_list in card.get(field, []):
                    if token in token_list:
                        token_score += weight * field_weight
                        break  # Avoid double-counting per field

        for ngram, weight in phrase_scores.items():
            phrase_tokens = ngram_to_tokens(ngram)

            for field, field_weight in field_weights.items():
                for token_list in card.get(field, []):
                    if count_ngram_in_tokens(token_list, phrase_tokens) > 0:
                        # Boost phrase score by token synergy
                        token_boost = 1 + 0.4 * token_score
                        phrase_score += weight * field_weight * token_boost
                        break  # Only count once per field

        total_score = phrase_score + token_score
        rarity_penalty = RARITY_PENALTY.get(card.get("rarity"))
        score = total_score * rarity_penalty

        # Score threshold: only include relevant cards
        if total_score > 0:
            scored_cards.append({
                "name": name,
                "score": score,
                "colors": card.get("color_identity", []),
            })

    return sorted(scored_cards, key=lambda x: -x["score"])


def load_cards(path):
    with open(path, "r") as f:
        return json.load(f)


if __name__ == "__main__":
    input_data = json.load(sys.stdin)

    cards = input_data["cards"]
    primary = input_data["primary_color"]
    secondary = input_data["secondary_color"]

    result = score_cards(cards, primary, secondary)

    print(json.dumps(result))
    sys.stdout.flush()
