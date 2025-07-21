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

# --- Boilerplate we want to strip to isolate meaningful effect phrases ---
STRIP_PATTERNS = [
    r'^(at the beginning of|when(?:ever)?|as long as)\b.*?,\s*',
    r'\byou may\b\s*',
    r'\bif .*?,\s*',
    r'\bdo this only once.*',
    r'\bthis ability.*',
]


# --- Utility to clean phrase ---
def strip_inconsequential(text):
    for pattern in STRIP_PATTERNS:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE).strip()
    return text


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
    Each frame includes:
      - original: full clause from oracle text
      - stripped: cleaned effect clause
    """
    results = {}
    for idx, card in enumerate(cards):
        clauses = extract_synergy_clauses(card.get("oracle_text", ""))
        frames = []
        for clause in clauses:
            stripped = strip_inconsequential(clause)
            if len(stripped.split()) >= 3:  # avoid junk phrases
                frames.append({
                    "original": clause,
                    "stripped": stripped
                })
        if frames:
            results[idx] = frames
    return results


def clean_bucket_name(text):
    return text.replace("_", " ").strip().title()


# --- Group cards by synergy buckets ---
def group_by_synergy(cards, min_phrase_len=3):
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

    # 3. Synergy phrases (from stripped effects)
    synergy_frame_results = extract_synergy_frames(cards)
    for idx, frames in synergy_frame_results.items():
        card = cards[idx]
        for frame in frames:
            phrase = frame["stripped"].lower()
            if len(phrase.split()) >= min_phrase_len:
                buckets[clean_bucket_name(phrase)].append(card)

    return dict(buckets)


# --- Optional: helper to collect synergy phrase frequency counts ---
def collect_synergy_phrase_counts(cards, min_phrase_len=3):
    phrase_counter = Counter()
    synergy_frame_results = extract_synergy_frames(cards)
    for frames in synergy_frame_results.values():
        for frame in frames:
            phrase = frame["stripped"].lower()
            if len(phrase.split()) >= min_phrase_len:
                phrase_counter[phrase] += 1
    return phrase_counter