import json
from typing import List, Dict, Counter
from cards_transform import transform
from oracle_parser import parse_oracle
from ngrams import get_common_ngrams, count_ngrams_in_corpus, ngram_to_tokens, count_ngram_in_tokens
from tokens import get_common_tokens


VALID_COLORS = {"W", "U", "B", "R", "G"}


def compare_token_frequencies(tokens1, tokens2, total1, total2):
    freq1 = dict(tokens1)
    freq2 = dict(tokens2)

    result_tokens = []
    for token in freq1:
        if token in freq2:
            prop1 = freq1[token] / total1
            prop2 = freq2[token] / total2
            if prop2 - prop1 >= 0.07:
                result_tokens += [token]

    return result_tokens


def compare_ngram_frequencies(ngrams1, ngrams2, total1, total2):
    results = []
    all_ngrams = set(ngrams1) | set(ngrams2)
    for ngram in all_ngrams:
        freq1 = ngrams1.get(ngram, 0)
        freq2 = ngrams2.get(ngram, 0)

        prop1 = freq1 / total1 if total1 > 0 else 0
        prop2 = freq2 / total2 if total2 > 0 else 0

        if prop2 - prop1 > 0.1:
            results.append(ngram)

    return results


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
    all_transformed = transform(cards, cards_parsed_oracle)

    colorless_cards = {
        name: card for name, card in all_transformed.items()
        if card.get("color_identity", []) == []
    }

    transformed_cards = {
        name: card for name, card in all_transformed.items()
        if len(card.get("color_identity", [])) == 1
    }
    num = len(transformed_cards)

    primary_cards = {
        name: card for name, card in transformed_cards.items()
        if card.get("color_identity", []) == primary
    }

    secondary_cards = {
        name: card for name, card in transformed_cards.items()
        if card.get("color_identity", []) == secondary
    }
    num_secondary = len(secondary_cards)

    dual_cards = {
        name: card for name, card in all_transformed.items()
        if card.get("color_identity", []) == primary + secondary
           or card.get("color_identity", []) == primary
           or card.get("color_identity", []) == secondary
    }
    num_dual = len(dual_cards)

    # === Token boost calculation ===
    tokens_freqs = get_common_tokens(transformed_cards)
    dual_tokens_freqs = get_common_tokens(dual_cards)
    secondary_tokens_freqs = get_common_tokens(secondary_cards)

    boosted_tokens = compare_token_frequencies(tokens_freqs, dual_tokens_freqs, num, num_dual) + compare_token_frequencies(secondary_tokens_freqs, dual_tokens_freqs, num_secondary, num_dual)

    # === Phrase boost calculation ===
    primary_ngrams_freqs = get_common_ngrams(primary_cards)
    primary_ngrams_freqs_all = count_ngrams_in_corpus(transformed_cards, set(primary_ngrams_freqs.keys()))
    dual_ngrams_freqs = get_common_ngrams(dual_cards)
    dual_ngrams_freqs_all = count_ngrams_in_corpus(transformed_cards, set(primary_ngrams_freqs.keys()))
    secondary_ngrams_freqs = get_common_ngrams(dual_cards)

    boosted_ngrams = compare_ngram_frequencies(dual_ngrams_freqs_all, dual_ngrams_freqs, num, num_dual) + compare_ngram_frequencies(primary_ngrams_freqs_all, primary_ngrams_freqs, num, len(primary_cards)) + compare_ngram_frequencies(secondary_ngrams_freqs, dual_ngrams_freqs, num_secondary, num_dual)

    # Count how often each boosted token appears
    token_counter = Counter(boosted_tokens)
    phrase_counter = Counter(boosted_ngrams)

    # === Scoring ===
    scored_cards = []
    for name, card in (dual_cards | colorless_cards).items():
        score = 0

        # Token scoring: types and keywords
        types = [t.lower() for t in card.get("types", [])]
        keywords = [k.lower() for k in card.get("keywords", [])]

        for token in token_counter:
            if token in types or token in keywords:
                score += token_counter[token]

        # Phrase scoring: conditions, triggers, effects
        for ngram, weight in phrase_counter.items():
            phrase_tokens = ngram_to_tokens(ngram)

            for field in ["effects", "triggers", "conditions"]:
                for token_list in card.get(field, []):
                    if count_ngram_in_tokens(token_list, phrase_tokens) > 0:
                        score += weight

        if score > 0:
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
