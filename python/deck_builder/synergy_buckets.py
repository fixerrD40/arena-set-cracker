import re
from collections import defaultdict, Counter
from nltk import word_tokenize
import nltk

# Ensure tokenizer resource is available
nltk.download('punkt_tab', quiet=True)

# --- Trigger clause pattern (capture full clause) ---
TRIGGER_PATTERN = re.compile(
    r'\b(when(?:ever)?|at the beginning of|as long as)\b.*?[.;](?:\s|\n|$)',
    flags=re.IGNORECASE
)


# --- Extract trigger-based synergy clauses from a card's oracle text ---
def extract_synergy_clauses(text):
    return [
        match.group(0).strip()
        for match in TRIGGER_PATTERN.finditer(text)
    ]


# --- Parse synergy clauses from cards ---
def extract_synergy_frames(cards):
    """
    Returns a dict mapping card index to list of extracted synergy frames.
    Each frame is a stripped clause (string).
    """
    results = {}
    for idx, card in enumerate(cards):
        oracle_text = card.get("oracle_text", "")
        clauses = extract_synergy_clauses(oracle_text)

        # Fallback: if no trigger clauses matched, try full sentences
        if not clauses:
            clauses = re.split(r'[.;](?:\s|\n|$)', oracle_text)

        frames = []
        for clause in clauses:
            clause = clause.strip()
            if not clause:
                continue
            if len(clause.split()) >= 3:  # avoid junk phrases
                frames.append(clause)
        if frames:
            results[idx] = frames
    return results


def learn_generalization_rules(synergy_frame_results, min_support=3):
    """
    Learn common phrase stems from stripped effect phrases.
    Returns a list of (pattern, label).
    """
    phrase_counter = Counter()
    for frames in synergy_frame_results.values():
        for phrase in frames:
            phrase = phrase.lower()
            phrase_counter[phrase] += 1

    # Tokenize and count common stems
    token_counts = Counter()
    for phrase, count in phrase_counter.items():
        tokens = word_tokenize(phrase)
        for n in range(2, 5):  # bigrams to 4-grams
            for i in range(len(tokens) - n + 1):
                ngram = ' '.join(tokens[i:i + n])
                token_counts[ngram] += count

    # Filter to frequent stems
    common_phrases = [
        (re.escape(ngram), ngram)
        for ngram, count in token_counts.items()
        if count >= min_support
    ]

    # Sort by longest matches first
    common_phrases.sort(key=lambda x: -len(x[0]))

    generalization_rules = [
        (rf'\b{pattern}\b', label) for pattern, label in common_phrases
    ]
    return generalization_rules


def post_process_synergy_frames(synergy_frame_results, generalization_rules):
    """
    Replace phrases with their generalized label if matched.
    Returns a dict of idx -> list of generalized or original phrases.
    """
    updated_results = {}
    for idx, frames in synergy_frame_results.items():
        updated = []
        for phrase in frames:
            lowered = phrase.lower()
            for pattern, label in generalization_rules:
                if re.search(pattern, lowered):
                    updated.append(label)
                    break
            else:
                updated.append(phrase)
        updated_results[idx] = updated
    return updated_results


def clean_bucket_name(text):
    return text.replace("_", " ").strip().title()


def group_by_synergy(cards, min_phrase_len=3):
    """
    Groups cards into buckets by shared synergy features.
    Returns a dict mapping bucket label -> list of cards.
    """
    buckets = defaultdict(list)

    # 1. Keywords (e.g., Flying, Deathtouch)
    for card in cards:
        for keyword in card.get("keywords", []):
            buckets[clean_bucket_name(keyword)].append(card)

    # 2. Creature types
    for card in cards:
        type_line = card.get("type_line", "").lower()
        if "creature" in type_line:
            match = re.search(r"creature\s+—\s+(.+)", type_line)
            if match:
                subtypes = match.group(1).split()
                for subtype in subtypes:
                    if subtype.isalpha():
                        buckets[clean_bucket_name(subtype)].append(card)

    # 3. Extract synergy frames (triggered or fallback)
    synergy_frame_results = extract_synergy_frames(cards)

    print(f"\nFound {len(synergy_frame_results)} initial frames:\n")
    for card, grouped_phrases in synergy_frame_results.items():
        print(f"  {card}: {grouped_phrases}")

    # 4. Learn generalization patterns dynamically
    generalization_rules = learn_generalization_rules(synergy_frame_results)

    # 5. Apply generalization labels to synergy frames
    synergy_frame_results = post_process_synergy_frames(
        synergy_frame_results, generalization_rules
    )

    # 6. Add cards to buckets by synergy effect
    for idx, frames in synergy_frame_results.items():
        card = cards[idx]
        for phrase in frames:
            if len(phrase.split()) < min_phrase_len:
                continue
            label = clean_bucket_name(phrase)
            buckets[label].append(card)

    # 7. Filter out singleton buckets
    buckets = {
        label: group for label, group in buckets.items() if len(group) > 1
    }

    return dict(buckets)