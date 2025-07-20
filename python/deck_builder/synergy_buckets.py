import re
from collections import defaultdict, Counter
from nltk import word_tokenize, bigrams
import nltk

# Ensure tokenizers are ready
nltk.download('punkt_tab', quiet=True)

# List of templated, non-synergistic bigrams
BAD_BIGRAMS = {
    "if you", "you control", "target creature", "target player",
    "until end", "of turn", "this creature", "a card",
    "each player", "another target", "up to",
}

def clean_bucket_name(text):
    return text.replace("_", " ").title()

def extract_common_bigrams(cards, top_n=20):
    """Extract frequent bigrams from oracle text."""
    bigram_counter = Counter()

    for card in cards:
        oracle_text = card.get("oracle_text", "")
        tokens = word_tokenize(oracle_text.lower())
        for bg in bigrams(tokens):
            phrase = " ".join(bg)
            # Skip if in BAD_BIGRAMS or contains non-alpha chars
            if phrase in BAD_BIGRAMS or not all(word.isalpha() for word in bg):
                continue
            bigram_counter[bg] += 1

    top_bigrams = bigram_counter.most_common(top_n)
    return [(" ".join(bg), count) for bg, count in top_bigrams]

def group_by_synergy(cards):
    buckets = defaultdict(list)

    # Step 1: Structured keywords
    for card in cards:
        for keyword in card.get("keywords", []):
            buckets[clean_bucket_name(keyword)].append(card)

    # Step 2: Dynamic creature tribes from type_line
    for card in cards:
        type_line = card.get("type_line", "").lower()
        if "creature" in type_line:
            match = re.search(r"creature\s+—\s+(.+)", type_line)
            if match:
                subtypes = match.group(1).split()
                for subtype in subtypes:
                    if subtype.isalpha():
                        buckets[clean_bucket_name(subtype)].append(card)

    # Step 3: Thematic bigrams from oracle_text
    top_bigrams = extract_common_bigrams(cards, top_n=15)

    for bigram, _ in top_bigrams:
        pattern = re.compile(r"\b" + re.escape(bigram) + r"\b")
        for card in cards:
            if pattern.search(card.get("oracle_text", "").lower()):
                buckets[clean_bucket_name(bigram)].append(card)

    return dict(buckets)