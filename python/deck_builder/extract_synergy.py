import collections
import re
from typing import Set, List, Tuple, Dict

Bigram = Tuple[str, str]
Ngram = Tuple[Bigram, ...]

MIN_FREQ = 3

# --- Regex for MTG-specific normalization ---
RE_BUFF = re.compile(r'([+-]\d+)/([+-]\d+)')
RE_STAT = re.compile(r'\b\d+/\d+\b')
RE_NUM = re.compile(r'\b\d+|(x|a|one|two|three|four|five|six|seven|nine|fourteen)\b')


def normalize_token(token: str) -> str:
    token = RE_BUFF.sub("<BUFF>", token)
    token = RE_STAT.sub("<STAT>", token)
    token = RE_NUM.sub("<NUM>", token)
    return token


def tokenize(text: str) -> List[str]:
    text = re.sub(r"[^\w\s~/+-]", "", text.lower())
    raw_tokens = text.split()
    normalized = [normalize_token(tok) for tok in raw_tokens]
    return normalized


def split_card_texts_by_phrase(card_texts: List[str], phrase: str) -> List[str]:
    phrase = phrase.lower()
    pattern = re.compile(r'\b' + re.escape(phrase) + r'\b', re.IGNORECASE)
    result_segments = []

    for text in card_texts:
        text_lower = text.lower()
        match = pattern.search(text_lower)
        if match:
            start, end = match.span()
            before = text[:start].rstrip(" ,.;")
            after = text[end:].lstrip(" ,.;")
            if before:
                result_segments.append(before)
            if after:
                result_segments.append(after)
        else:
            result_segments.append(text)

    return result_segments


def extract_texts(flattened: Dict) -> List[str]:
    all_texts = []
    for card in flattened.values():
        for field in ["conditions", "triggers", "effects"]:
            if card.get(field):
                all_texts.extend(card[field])  # add each string individually
    return all_texts


def extract_bigrams(text: str) -> List[Bigram]:
    tokens = tokenize(text)
    return [(tokens[i], tokens[i + 1]) for i in range(len(tokens) - 1)]


def construct_ngrams(texts: List[str]) -> Dict[Ngram, int]:
    bigram_freqs = collections.Counter()
    for text in texts:
        for bigram in extract_bigrams(text):
            bigram_freqs[bigram] += 1

    # Wrap bigrams as single-element ngrams
    filtered = {(bg,): freq for bg, freq in bigram_freqs.items() if freq >= MIN_FREQ}

    current_ngrams = filtered
    all_ngrams = dict(filtered)

    while True:
        candidates = merge_ngrams_via_chains(current_ngrams)
        if not candidates:
            break
        validated = validate_ngrams(candidates, texts, MIN_FREQ)
        if not validated:
            break
        all_ngrams.update(validated)
        current_ngrams = validated

    return all_ngrams

def validate_ngrams(candidates: Dict[Ngram, int], texts: List[str], min_freq: int = 2) -> Dict[Ngram, int]:
    validated = {}
    for ngram, predicted_freq in candidates.items():
        ngram_tokens = ngram_to_tokens(ngram)
        actual_freq = 0
        for text in texts:
            tokens = tokenize(text)
            actual_freq += count_ngram_in_tokens(tokens, ngram_tokens)
        if actual_freq >= min_freq and actual_freq >= predicted_freq:
            validated[ngram] = actual_freq
    return validated

def ngram_to_tokens(ngram: Ngram) -> List[str]:
    if not ngram:
        return []
    try:
        tokens = [ngram[0][0]]
        for _, b in ngram:
            tokens.append(b)
    except Exception as e:
        print("Error in ngram_to_tokens with ngram:", ngram)
        raise e
    return tokens

def count_ngram_in_tokens(tokens: List[str], ngram_tokens: List[str]) -> int:
    count = 0
    n = len(ngram_tokens)
    for i in range(len(tokens) - n + 1):
        if tokens[i:i + n] == ngram_tokens:
            count += 1
    return count


def merge_ngrams_via_chains(ngrams_freq: Dict[Ngram, int], freq_tolerance=0) -> Dict[Ngram, int]:
    from collections import defaultdict

    prefix_map = defaultdict(list)
    suffix_map = defaultdict(list)

    first = next(iter(ngrams_freq))
    ngram_len = len(first)

    if ngram_len == 1:
        # For merging single bigrams, join only if last token of left == first token of right

        prefix_map_token = defaultdict(list)
        suffix_map_token = defaultdict(list)

        for ngram in ngrams_freq:
            bigram = ngram[0]
            prefix_map_token[bigram[0]].append(ngram)  # map by first token
            suffix_map_token[bigram[1]].append(ngram)  # map by second token

        candidates = {}
        for token, left_ngrams in suffix_map_token.items():
            right_ngrams = prefix_map_token.get(token, [])
            for left in left_ngrams:
                left_freq = ngrams_freq[left]
                for right in right_ngrams:
                    right_freq = ngrams_freq[right]
                    if abs(left_freq - right_freq) <= freq_tolerance:
                        merged = left + (right[0],)
                        candidates[merged] = min(left_freq, right_freq)
        return candidates

    else:
        # general case: ngram length >= 2 bigrams
        overlap_len = ngram_len - 1  # number of bigrams to overlap

        for ngram in ngrams_freq:
            prefix = ngram[:overlap_len]
            suffix = ngram[-overlap_len:]
            prefix_map[prefix].append(ngram)
            suffix_map[suffix].append(ngram)

        candidates = {}
        for overlap_key, left_ngrams in suffix_map.items():
            right_ngrams = prefix_map.get(overlap_key, [])
            for left in left_ngrams:
                left_freq = ngrams_freq[left]
                for right in right_ngrams:
                    right_freq = ngrams_freq[right]
                    if abs(left_freq - right_freq) <= freq_tolerance:
                        merged = left + (right[-1],)
                        candidates[merged] = min(left_freq, right_freq)
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
    """
    Check if 'small' is a subsequence of 'big' (ordered, not necessarily contiguous).
    This should be alright given how we construct supergrams.
    """
    it = iter(big)
    return all(b in it for b in small)


def contest_ngram(
    ngrams: Dict[Ngram, int],
    supergram: Ngram,
) -> Dict[Ngram, int]:
    remaining = {}
    for ngram, freq in ngrams.items():
        if ngram == supergram:
            continue
        if is_subsequence(ngram, supergram):
            continue
        remaining[ngram] = freq
    return remaining


def bigrams_to_phrase(bigrams: Ngram) -> str:
    if not bigrams:
        return ""
    tokens = [bigrams[0][0]]
    for _, b in bigrams:
        tokens.append(b)
    return " ".join(tokens)


def print_synergy_report(flattened: Dict):
    texts = extract_texts(flattened)
    merged_ngrams = construct_ngrams(texts)
    selections = reduce_ngrams(merged_ngrams)

    print("\nSelected reduced ngrams (contested):")
    for ngram in sorted(selections, key=lambda x: (-len(x), -merged_ngrams[x])):
        phrase = bigrams_to_phrase(ngram)
        freq = merged_ngrams[ngram]
        print(f"{phrase} — freq={freq} — len={len(ngram)}")