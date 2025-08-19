import collections
from collections import defaultdict
from typing import Set, List, Dict, Optional, Tuple

Bigram = Tuple[str, str]
Ngram = Tuple[Bigram, ...]

ROUGH_MIN_PROP = 0.05

def extract_texts(flattened: Dict) -> List[List[str]]:
    all_texts = []
    for card in flattened.values():
        for field in ["conditions", "triggers", "effects"]:
            if card.get(field):
                all_texts.extend(card[field])  # add each token list
    return all_texts


def extract_bigrams(tokens: List[str]) -> List[Bigram]:
    return [(tokens[i], tokens[i + 1]) for i in range(len(tokens) - 1)]


def construct_ngrams(
    tokenized_texts: List[List[str]],
    num_cards: int,
) -> Dict[Ngram, int]:
    rough_min_freq = max(1, int(num_cards * ROUGH_MIN_PROP))

    # Count bigrams
    bigram_freqs = collections.Counter()
    for tokens in tokenized_texts:
        for bigram in extract_bigrams(tokens):
            bigram_freqs[bigram] += 1

    # Wrap bigrams as single-element ngrams if they meet min frequency
    filtered = {(bg,): freq for bg, freq in bigram_freqs.items() if freq >= rough_min_freq}
    current_ngrams = filtered
    all_ngrams = dict(filtered)

    # Merge chains of ngrams
    while True:
        candidates = merge_ngrams_via_chains(current_ngrams)
        if not candidates:
            break
        validated = validate_ngrams(candidates, tokenized_texts)
        if not validated:
            break
        all_ngrams.update(validated)
        current_ngrams = validated

    # Generalize ngrams
    all_ngrams = generalize_ngrams(all_ngrams, tokenized_texts)

    return all_ngrams


def validate_ngrams(
    candidates: Dict[Ngram, int],
    tokenized_texts: List[List[str]]
) -> Dict[Ngram, int]:
    validated = {}

    p_tolerance = .8
    n_tolerance = 1

    for ngram, predicted_freq in candidates.items():
        ngram_tokens = ngram_to_tokens(ngram)
        actual_freq = 0

        for tokens in tokenized_texts:
            actual_freq += count_ngram_in_tokens(tokens, ngram_tokens)

        if actual_freq >= int(predicted_freq * p_tolerance) or predicted_freq - actual_freq > n_tolerance and actual_freq > 1:
            validated[ngram] = actual_freq

    return validated


def ngram_to_tokens(ngram: Ngram) -> List[str]:
    if not ngram:
        return []
    tokens = [ngram[0][0]]
    for _, b in ngram:
        tokens.append(b)
    return tokens


def count_ngram_in_tokens(tokens: List[str], ngram_tokens: List[str]) -> int:
    count = 0
    n = len(ngram_tokens)
    for i in range(len(tokens) - n + 1):
        if tokens[i:i + n] == ngram_tokens:
            count += 1
    return count


def bigrams_to_phrase(bigrams: Ngram) -> str:
    if not bigrams:
        return ""
    tokens = [bigrams[0][0]]
    for _, b in bigrams:
        tokens.append(b)
    return " ".join(tokens)


def merge_ngrams_via_chains(ngrams_freq: Dict[Ngram, int]) -> Dict[Ngram, int]:
    from collections import defaultdict

    prefix_map = defaultdict(list)
    suffix_map = defaultdict(list)

    first = next(iter(ngrams_freq))
    ngram_len = len(first)

    candidates = {}

    if ngram_len == 1:
        prefix_map_token = defaultdict(list)
        suffix_map_token = defaultdict(list)

        for ngram in ngrams_freq:
            bigram = ngram[0]
            prefix_map_token[bigram[0]].append(ngram)
            suffix_map_token[bigram[1]].append(ngram)

        for token, left_ngrams in suffix_map_token.items():
            right_ngrams = prefix_map_token.get(token, [])
            for left in left_ngrams:
                for right in right_ngrams:
                    merged = left + (right[0],)
                    candidates[merged] = min(ngrams_freq[left], ngrams_freq[right])

    else:
        overlap_len = ngram_len - 1

        for ngram in ngrams_freq:
            prefix = ngram[:overlap_len]
            suffix = ngram[-overlap_len:]
            prefix_map[prefix].append(ngram)
            suffix_map[suffix].append(ngram)

        for overlap_key, left_ngrams in suffix_map.items():
            right_ngrams = prefix_map.get(overlap_key, [])
            for left in left_ngrams:
                for right in right_ngrams:
                    merged = left + (right[-1],)
                    candidates[merged] = min(ngrams_freq[left], ngrams_freq[right])

    return candidates


def reduce_ngrams(ngrams: Dict[Ngram, int]) -> Set[Ngram]:
    selections: Set[Ngram] = set()
    remaining = dict(ngrams)

    while remaining:
        next_ngram = select_next_candidate(remaining)
        selections.add(next_ngram)
        remaining = contest_ngram(remaining, next_ngram)

    return selections


def select_next_candidate(ngrams: Dict[Ngram, int]) -> Ngram:
    return max(ngrams.items(), key=lambda x: (len(x[0]), x[1]))[0]


def is_subsequence(small: Ngram, big: Ngram) -> bool:
    it = iter(big)
    return all(b in it for b in small)


def contest_ngram(
    ngrams: Dict[Ngram, int],
    supergram: Ngram
) -> Dict[Ngram, int]:
    supergram_freq = ngrams.get(supergram, 0)
    p_tolerance = .8
    n_tolerance = 1

    return {
        ngram: freq
        for ngram, freq in ngrams.items()
        if ngram != supergram and (
            not is_subsequence(ngram, supergram)
            or (freq != supergram_freq and supergram_freq / freq > p_tolerance and freq - supergram_freq > n_tolerance)
        )
    }


def generalize_ngrams(
    ngrams: Dict[Ngram, int],
    tokenized_texts: List[List[str]]
) -> Dict[Ngram, int]:
    """
    Generalize ngrams by replacing one inner token with wildcard '*'
    if it results in higher frequency and is not at the boundary.
    """

    def ngram_to_token_list(ngram: Ngram) -> List[str]:
        tokens = [ngram[0][0]]
        for _, b in ngram:
            tokens.append(b)
        return tokens

    def token_list_to_ngram(tokens: List[str]) -> Ngram:
        return tuple((tokens[i], tokens[i + 1]) for i in range(len(tokens) - 1))

    def tokens_differ_at_one_position(t1: List[str], t2: List[str]) -> Optional[int]:
        if len(t1) != len(t2):
            return None
        diffs = [i for i, (a, b) in enumerate(zip(t1, t2)) if a != b]
        return diffs[0] if len(diffs) == 1 else None

    def is_plural_pair(t1: str, t2: str) -> bool:
        return t1 == t2 + 's' or t2 == t1 + 's'

    def matches_generalized_pattern(tokens: List[str], pattern: List[str]) -> bool:
        return len(tokens) == len(pattern) and all(p == '*' or p == t for p, t in zip(pattern, tokens))

    # Group ngrams by length
    grouped_by_len = collections.defaultdict(list)
    for ngram in ngrams:
        grouped_by_len[len(ngram)].append(ngram)

    generalized_candidates = {}

    for length, group in grouped_by_len.items():
        if length < 2:
            continue  # skip bigrams

        token_lists = [ngram_to_token_list(ng) for ng in group]

        for i in range(len(token_lists)):
            for j in range(i + 1, len(token_lists)):
                t1, t2 = token_lists[i], token_lists[j]
                diff_pos = tokens_differ_at_one_position(t1, t2)

                if diff_pos is None:
                    continue
                if diff_pos == 0 or diff_pos == len(t1) - 1:
                    continue  # don't generalize boundary tokens
                if is_plural_pair(t1[diff_pos], t2[diff_pos]):
                    continue

                generalized_pattern = t1[:]
                generalized_pattern[diff_pos] = '*'
                generalized_ngram = token_list_to_ngram(generalized_pattern)

                current_freq = generalized_candidates.get(generalized_ngram, 0)
                count = 0

                for tokens in tokenized_texts:
                    for idx in range(len(tokens) - len(generalized_pattern) + 1):
                        window = tokens[idx:idx + len(generalized_pattern)]
                        if matches_generalized_pattern(window, generalized_pattern):
                            count += 1

                if count >= max(1, int(len(tokenized_texts) * ROUGH_MIN_PROP)) and count > current_freq:
                    generalized_candidates[generalized_ngram] = count

    # Merge with original ngrams
    merged = dict(ngrams)
    for gen_ngram, freq in generalized_candidates.items():
        if freq > merged.get(gen_ngram, 0):
            merged[gen_ngram] = freq

    return merged


def get_common_ngrams(
    flattened: Dict,
) -> dict[Ngram, int]:
    tokenized_texts = extract_texts(flattened)
    num_cards = len(flattened)

    ngrams_freqs = construct_ngrams(tokenized_texts, num_cards)
    selected_ngrams = reduce_ngrams(ngrams_freqs)

    selected_ngrams_freqs = {
        ngram: ngrams_freqs[ngram]
        for ngram in selected_ngrams
    }

    # Sort by frequency in descending order
    sorted_selected_ngrams_freqs = dict(
        sorted(selected_ngrams_freqs.items(), key=lambda item: item[1], reverse=True)
    )

    return sorted_selected_ngrams_freqs


def count_ngrams_in_corpus(
    cards: Dict[str, Dict],
    selected_ngrams: Set[Ngram]
) -> Dict[Ngram, int]:
    result = defaultdict(int)

    for ngram in selected_ngrams:
        tokens = ngram_to_tokens(ngram)

        for card in cards.values():
            for field in ["effects", "triggers", "conditions"]:
                for token_list in card.get(field, []):
                    result[ngram] += count_ngram_in_tokens(token_list, tokens)

    return dict(result)