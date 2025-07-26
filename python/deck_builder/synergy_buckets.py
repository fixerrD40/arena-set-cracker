import re
from collections import defaultdict, Counter
import nltk

# Ensure tokenizer resource is available
nltk.download('punkt_tab', quiet=True)

# --- Text preprocessing ---


def strip_known_keywords(text, keywords, type_line):
    """
    Remove known keywords and irrelevant ability lines from oracle text.
    Preserve 'equip' lines for equipment cards.
    """
    lines = text.splitlines()
    stripped = []

    for line in lines:
        line_clean = line.strip()
        line_lower = line_clean.lower()

        # Skip exact keyword lines
        if any(line_lower == kw.lower() for kw in keywords):
            continue

        stripped.append(line_clean)

    return "\n".join(stripped)


# --- Pattern Constants ---

TRIGGER_KEYWORDS = [
    "whenever", "when", "at the beginning", "at the end"
]
CONDITION_KEYWORDS = [
    "if", "as long as"
]
REFLEXIVE_SUBJECTS = [
    r'\bthis\b',
    r'\bthat\b'
]

CHOICE_PATTERN = re.compile(r'\bchoose one\b', flags=re.IGNORECASE)
OPTIONAL_PATTERN = re.compile(r'\byou may\b', flags=re.IGNORECASE)


# --- Structural Helpers ---

def split_oracle_text(text):
    """
    Purely structural splitter: returns list of syntactic clauses split on
    punctuation and newlines.
    """
    text = re.sub(r'\s*([.;\n])\s*', r'\1', text)
    matches = re.findall(r'[^.;\n]+[.;\n]', text)

    return [clause.strip() for clause in matches]


def try_extract_segment(text, keyword_list, segment_type):
    """
    Generalized extractor for trigger/condition blocks.
    Applies reflexivity heuristics when subject is 'you do'.
    """
    lower = text.lower()

    for keyword in keyword_list:
        if lower.startswith(keyword):
            # Find the first comma (with optional trailing whitespace)
            match = re.search(r',\s*', text)
            if not match:
                continue

            # Slice the text to preserve the comma
            split_index = match.end()
            segment_text = text[:split_index].strip()
            remainder = text[split_index:].strip()

            segment = {"text": segment_text}
            segment_lower = segment_text.lower()

            if "you do" in segment_lower:
                segment["modifiers"] = ["reflexive"]
            else:
                # Remove the keyword only (not the comma)
                stripped = re.sub(rf'^{keyword}\s+', '', segment_text.rstrip(','), flags=re.IGNORECASE).strip()
                if stripped:
                    segment["subjects"] = [stripped]

            return {segment_type: segment, "remainder": remainder}

    return None


def parse_effect_structure(text):
    """
    Parses an effect string into a list of structured nested effects.
    Handles optionality, sequencing, and plain text.
    """
    text = text.strip()
    effects = []
    modifiers = []

    # Handle optional effects
    if OPTIONAL_PATTERN.search(text):
        clean = OPTIONAL_PATTERN.sub('', text).strip().rstrip('.;\n')
        effects.append({"text": clean})
        modifiers.append("optional")

    # Handle sequencing
    elif ', then' in text.lower():
        parts = re.split(r', then\b', text, flags=re.IGNORECASE)
        effects.extend({"text": part.strip()} for part in parts)
        modifiers.append("sequence")

    # Build main effect dict
    effect = {"text": text}
    if effects:
        effect["effects"] = effects
    if modifiers:
        effect["modifiers"] = modifiers

    return [effect]


def parse_choice_effects(header_text, bullets):
    effects = []
    for bullet in bullets:
        clean = bullet.lstrip("• ").strip()
        clean = clean.rstrip('.;\n').strip()
        effects.append({
            "text": bullet.strip(),
            "effects": [{"text": clean}]
        })
    return [{
        "text": f"{header_text} {' '.join(bullets)}",
        "effects": effects,
        "modifiers": ["choice"]
    }]


# --- Top-Level Parser ---

def parse_oracle_text_to_blocks(text):
    clauses = split_oracle_text(text)
    blocks = []
    i = 0

    while i < len(clauses):
        clause = clauses[i]
        block = {"text": clause}
        working = clause

        # Try to extract trigger
        trig = try_extract_segment(working, TRIGGER_KEYWORDS, "trigger")
        if trig:
            block["trigger"] = trig["trigger"]
            working = trig["remainder"]

        # Try to extract condition
        cond = try_extract_segment(working, CONDITION_KEYWORDS, "condition")
        if cond:
            block["condition"] = cond["condition"]
            working = cond["remainder"]

        # Lookahead for choice bullets
        if CHOICE_PATTERN.search(working):
            bullets = []
            j = i + 1
            while j < len(clauses) and clauses[j].strip().startswith("•"):
                bullets.append(clauses[j])
                j += 1
            full_clause = f"{clause} {' '.join(bullets)}"
            block["text"] = full_clause
            block["effects"] = parse_choice_effects(working, bullets)
            i = j
        else:
            block["effects"] = parse_effect_structure(working)
            i += 1

        # Nest reflexive trigger blocks inside previous effect
        if (
            block.get("trigger")
            and "reflexive" in block["trigger"].get("modifiers", [])
            and blocks
        ):
            blocks[-1].setdefault("effects", []).append(block)
        else:
            blocks.append(block)

    return blocks


# --- Frame extraction per card ---


def extract_synergy_frames(cards):
    results = {}
    for idx, card in enumerate(cards):
        oracle_text = card.get("oracle_text", "")
        keywords = card.get("keywords", [])
        type_line = card.get("type_line", "")
        cleaned_text = strip_known_keywords(oracle_text, keywords, type_line)
        blocks = parse_oracle_text_to_blocks(cleaned_text)
        results[idx] = blocks
    return results


# --- Generalization rule learning (placeholder) ---


def learn_generalization_rules(synergy_frame_results, min_support=3):
    """
    Placeholder function for learning generalization rules
    from synergy frame effects. Currently returns empty dict.
    """
    # You can implement logic here for clustering or
    # extracting general patterns in synergy frames.
    return {}


# --- Post-processing synergy frames (dummy pass-through) ---


def post_process_synergy_frames(synergy_frame_results, generalization_rules):
    """
    Apply generalization rules or cleanups on synergy frames.
    Currently a no-op that returns input as-is.
    """
    return synergy_frame_results


# --- Flatten nested effects into list of phrases ---


def flatten_effects(effects):
    """
    Recursively flatten nested effect structures into
    a list of string phrases for bucketing.
    """
    phrases = []

    if isinstance(effects, list):
        for eff in effects:
            phrases.extend(flatten_effects(eff))
    elif isinstance(effects, dict):
        eff = effects.get("effect")
        if isinstance(eff, list):
            phrases.extend(flatten_effects(eff))
        elif isinstance(eff, str):
            phrases.append(eff)
    elif isinstance(effects, str):
        phrases.append(effects)

    return phrases


# --- Bucket cleaning helper ---


def clean_bucket_name(name):
    """
    Normalize bucket label strings for consistent keys.
    """
    return re.sub(r'\W+', '_', name.lower()).strip('_')


# --- Main grouping function ---


def group_by_synergy(cards, min_phrase_len=3):
    """
    Groups cards by keywords, creature subtypes,
    and structured synergy effect phrases.
    """
    buckets = defaultdict(list)

    # 1. Keywords
    for card in cards:
        for keyword in card.get("keywords", []):
            buckets[clean_bucket_name(keyword)].append(card)

    # 2. Creature subtypes
    for card in cards:
        type_line = card.get("type_line", "").lower()
        if "creature" in type_line:
            match = re.search(r"creature\s+—\s+(.+)", type_line)
            if match:
                subtypes = match.group(1).split()
                for subtype in subtypes:
                    if subtype.isalpha():
                        buckets[clean_bucket_name(subtype)].append(card)

    # 3. Structured frame extraction
    synergy_frame_results = extract_synergy_frames(cards)

    print(f"\nFound {len(synergy_frame_results)} structured frame sets:\n")
    for idx, blocks in synergy_frame_results.items():
        print(f"Card {idx}:")
        for block in blocks:
            print("  ", block)

    # 4. Learn generalizations
    generalization_rules = learn_generalization_rules(synergy_frame_results)

    # 5. Post-process synergy frames
    synergy_frame_results = post_process_synergy_frames(synergy_frame_results, generalization_rules)

    # 6. Bucket by effect phrases
    for idx, blocks in synergy_frame_results.items():
        card = cards[idx]
        for block in blocks:
            effects = block.get("effect")
            if not effects:
                continue
            flattened = flatten_effects(effects)
            for phrase in flattened:
                if phrase and len(phrase.split()) >= min_phrase_len:
                    label = clean_bucket_name(phrase)
                    buckets[label].append(card)

    # 7. Filter singleton buckets
    buckets = {label: group for label, group in buckets.items() if len(group) > 1}

    return dict(buckets)