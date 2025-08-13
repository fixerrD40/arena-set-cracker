import json
from math import log
from typing import List, Dict, Counter
from collections import Counter
from cards_transform import transform
from oracle_parser import parse_oracle
from ngrams import get_common_ngrams, count_ngrams_in_corpus, ngram_to_tokens, count_ngram_in_tokens
from tokens import get_common_tokens

VALID_COLORS = {"W", "U", "B", "R", "G"}

RARITY_PENALTY = {
    "common":    1.00,
    "uncommon":  0.8,
    "rare":      0.7,
    "mythic":    0.6
}


def tfidf_score(freq_from, freq_to, total_from, total_to):
    tf = freq_to / total_to if total_to else 0
    idf = log((1 + total_from) / (1 + freq_from))
    return tf * idf


def emergence_score(freq_global, freq_dual, freq_primary,
                    total_global, total_dual, total_primary,
                    w_dual, w_primary,
                    alpha, beta):
    """
    Scores phrases by combining emergence and absolute dual/primary presence.

    - Emphasizes delta from global → dual → primary
    - Allows dual and primary presence to survive similarity with prior groups
    - Applies soft penalty for globally common tokens

    Args:
        alpha: weight for p_dual in dual component (vs delta_dual)
        beta: weight for p_primary in primary component (vs delta_primary)
    """

    if freq_primary < 3:
        return 0

    # Relative freqs
    p_global = freq_global / total_global if total_global else 0
    p_dual = freq_dual / total_dual if total_dual else 0
    p_primary = freq_primary / total_primary if total_primary else 0

    # Delta components
    delta_dual = p_dual - p_global
    delta_primary = p_primary - p_dual

    # Blend emergence and presence
    dual_component = (1 - alpha) * delta_dual + alpha * p_dual
    primary_component = (1 - beta) * delta_primary + beta * p_primary

    # Full emergence model
    total_emergence = (w_dual * dual_component) + (w_primary * primary_component)

    return total_emergence


def score_cards(
    cards: List[Dict],
    primary_color: str,
    secondary_color: str
) -> List[Dict]:
    """
    Scores and ranks cards based on match with emergent tokens/phrases from
    primary/secondary color comparisons.

    Args:
        cards: List of card dicts (raw from Scryfall).
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

    cards_parsed_oracle = parse_oracle(cards)
    transformed_cards = transform(cards, cards_parsed_oracle)
    num_all = len(transformed_cards)

    colorless_cards = {
        name: card for name, card in transformed_cards.items()
        if card.get("color_identity", []) == []
    }

    primary_cards = {
        name: card for name, card in transformed_cards.items()
        if card.get("color_identity", []) == primary
    }
    num_primary = len(primary_cards)

    dual_cards = {
        name: card for name, card in transformed_cards.items()
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
            types = [t.lower() for t in card.get("types", [])]
            if token in types:
                dual_tokens_freqs_primary[token] += 1

        for card in transformed_cards.values():
            types = [t.lower() for t in card.get("types", [])]
            if token in types:
                dual_tokens_freqs_all[token] += 1

    token_scores = {}

    for token in dual_tokens_freqs:
        score = emergence_score(
            dual_tokens_freqs_all[token],
            dual_tokens_freqs[token],
            dual_tokens_freqs_primary[token],
            num_all,
            num_dual,
            num_primary,
            1.2,
            .6,
            .2,
            0
        )

        if score > 0:
            token_scores[token] = score

    # === Phrase boost calculation ===
    dual_ngrams_freqs = get_common_ngrams(dual_cards)
    dual_ngrams_freqs_primary = count_ngrams_in_corpus(primary_cards, set(dual_ngrams_freqs.keys()))
    dual_ngrams_freqs_all = count_ngrams_in_corpus(transformed_cards, set(dual_ngrams_freqs.keys()))

    phrase_scores = {}

    for ngram in dual_ngrams_freqs:
        score = emergence_score(
            dual_ngrams_freqs_all.get(ngram, 0),
            dual_ngrams_freqs.get(ngram, 0),
            dual_ngrams_freqs_primary.get(ngram, 0),
            num_all,
            num_dual,
            num_primary,
            1.2,
            .6,
            .2,
            .4
        )

        if score > 0:
            phrase_scores[ngram] = score / 2

    # === Scoring ===
    scored_cards = []
    for name, card in (dual_cards | colorless_cards).items():
        token_score = 0
        phrase_score = 0

        # Token scoring: from types and keywords
        types = [t.lower() for t in card.get("types", [])]
        keywords = [k.lower() for k in card.get("keywords", [])]

        for token, weight in token_scores.items():
            if token in types or token in keywords:
                token_score += weight

        # Phrase scoring: from oracle fields
        field_weights = {
            "triggers": 3.0,
            "effects": 1.0,
            "conditions": 0.75
        }

        for ngram, tfidf_weight in phrase_scores.items():
            phrase_tokens = ngram_to_tokens(ngram)

            for field, field_weight in field_weights.items():
                for token_list in card.get(field, []):
                    if count_ngram_in_tokens(token_list, phrase_tokens) > 0:
                        # Boost phrase score by token synergy
                        token_boost = 1 + 0.4 * token_score
                        phrase_score += tfidf_weight * field_weight * token_boost
                        break  # Only count once per field

        total_score = phrase_score + token_score

        # Combine all parsed oracle fields to estimate total text size
        oracle_fields = card.get("triggers", []) + card.get("effects", []) + card.get("conditions", [])
        text_length = sum(len(field) for field in oracle_fields)
        score_density = total_score / (1 + text_length)
        rarity_penalty = RARITY_PENALTY.get(card.get("rarity"))
        score = (0.8 * total_score + 0.2 * score_density) * rarity_penalty

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

def main():

    primary_arg = 'U'
    secondary_arg = 'G'

    data = load_cards('../lotr_all_cards.json')
    cards = data["cards"]

    results = score_cards(cards, primary_arg, secondary_arg)
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    main()
