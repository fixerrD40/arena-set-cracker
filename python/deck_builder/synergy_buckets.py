import re
from collections import defaultdict, Counter
from nltk import word_tokenize
import nltk

# Ensure tokenizer resource is available
nltk.download('punkt_tab', quiet=True)

# --- Keyword and oracle text preprocessing ---
def strip_known_keywords(text, keywords, type_line):
    """
    Removes keyword-only lines (e.g. 'Flying', 'Deathtouch') from oracle_text.
    Preserves ability keywords like 'Equip {3}' on Equipment cards.
    """
    is_equipment = "equipment" in type_line.lower()
    lines = text.splitlines()
    stripped = []

    for line in lines:
        line_clean = line.strip()
        line_lower = line_clean.lower()

        if any(line_lower == kw.lower() for kw in keywords):
            continue

        if re.match(r'^(equip|fortify|cycling|augment|level up) \{[^}]+\}$', line_lower):
            if is_equipment and line_lower.startswith("equip "):
                stripped.append(line_clean)
            continue

        stripped.append(line_clean)

    return "\n".join(stripped)


# --- Clause utilities ---
def is_trigger_clause(clause):
    return re.match(
        r'^(when(?:ever)?|at the beginning of|each time|after|as soon as|while|as long as)\b',
        clause.strip().lower(),
    )


def is_condition_clause(clause):
    return clause.strip().lower().startswith(("if ", "as long as ", "while "))


def split_clause_at_comma(clause):
    if "," in clause:
        first, rest = clause.split(",", 1)
        return first.strip(), rest.strip()
    return clause.strip(), None


# --- Parse effects with nesting and modifiers ---
CHOICE_PATTERN = re.compile(r'\bchoose one\b', flags=re.IGNORECASE)
OPTIONAL_PATTERN = re.compile(r'\byou may\b', flags=re.IGNORECASE)
SEQUENCE_DELIM = r', then\b'

def parse_effects(text):
    effects = []

    # Split by sequencing delimiter (case-insensitive)
    sequence_parts = re.split(r', then\b', text, flags=re.IGNORECASE)

    if len(sequence_parts) > 1:
        # Multiple sequence parts → one sequence effect with modifiers
        nested_effects = []
        for part in sequence_parts:
            part = part.strip()
            if not part:
                continue
            # Recursive parse in case nested structures appear inside sequence parts
            nested_effects.extend(parse_effects(part))
        return [{
            "effect": nested_effects,
            "modifiers": ["sequence"]
        }]

    # No sequencing detected, continue parsing for choice and optional
    part = sequence_parts[0].strip()

    if CHOICE_PATTERN.search(part):
        choices_text = part.split('choose one', 1)[1].strip()
        choice_delims = [r'•', r'\n', r';']
        choices = re.split('|'.join(choice_delims), choices_text)
        choices = [c.strip() for c in choices if c.strip()]
        nested_effects = [parse_effects(choice)[0] if parse_effects(choice) else {"effect": choice} for choice in choices]
        return [{
            "effect": nested_effects,
            "modifiers": ["choice"]
        }]

    optional = bool(OPTIONAL_PATTERN.search(part))

    sub_clauses = re.split(r'[.;]\s*', part)
    if len(sub_clauses) > 1:
        nested = []
        for clause in sub_clauses:
            clause = clause.strip()
            if clause:
                nested.extend(parse_effects(clause))
        if len(nested) > 1:
            mods = ["sequence"]
            if optional:
                mods.append("optional")
            return [{
                "effect": nested,
                "modifiers": mods
            }]
        else:
            eff = nested[0]
            if optional:
                eff.setdefault("modifiers", [])
                eff["modifiers"].append("optional")
            return [eff]

    effect_obj = {"effect": part}
    if optional:
        effect_obj["modifiers"] = ["optional"]
    return [effect_obj]


# --- Parse structured clause blocks ---
def parse_oracle_text_to_blocks(text):
    raw_chunks = []
    for line in text.splitlines():
        parts = re.split(r'[.;](?:\s|\n|$)', line)
        raw_chunks.extend([p.strip() for p in parts if p.strip()])

    blocks = []
    i = 0
    while i < len(raw_chunks):
        clause = raw_chunks[i]

        # Trigger clause
        if is_trigger_clause(clause):
            trigger, effect = split_clause_at_comma(clause)
            block = {"trigger": trigger}
            if effect:
                # effect can be nested effects
                block["effect"] = parse_effects(effect)
            blocks.append(block)
            i += 1
            continue

        # Condition clause
        elif is_condition_clause(clause):
            condition, effect = split_clause_at_comma(clause)
            block = {"condition": condition}
            if effect:
                block["effect"] = parse_effects(effect)
            blocks.append(block)
            i += 1
            continue

        # Standalone effect
        else:
            blocks.append({"effect": parse_effects(clause)})
            i += 1

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


# --- Rule learning from effects only ---
def learn_generalization_rules(synergy_frame_results, min_support=3):
    phrase_counter = Counter()
    for blocks in synergy_frame_results.values():
        for block in blocks:
            effects = block.get("effect")
            # Flatten nested effects
            flat_effects = flatten_effects(effects)
            for phrase in flat_effects:
                phrase_counter[phrase.lower()] += 1

    token_counts = Counter()
    for phrase, count in phrase_counter.items():
        tokens = word_tokenize(phrase)
        for n in range(2, 5):
            for i in range(len(tokens) - n + 1):
                ngram = ' '.join(tokens[i:i + n])
                token_counts[ngram] += count

    common_phrases = [
        (re.escape(ngram), ngram)
        for ngram, count in token_counts.items()
        if count >= min_support
    ]
    common_phrases.sort(key=lambda x: -len(x[0]))

    generalization_rules = [
        (rf'\b{pattern}\b', label) for pattern, label in common_phrases
    ]
    return generalization_rules


def flatten_effects(effects):
    """
    Recursively flatten nested effects into strings for counting
    """
    if not effects:
        return []
    if isinstance(effects, str):
        return [effects]
    if isinstance(effects, list):
        flat = []
        for e in effects:
            flat.extend(flatten_effects(e))
        return flat
    if isinstance(effects, dict):
        eff = effects.get("effect")
        return flatten_effects(eff)
    return []


def post_process_synergy_frames(synergy_frame_results, generalization_rules):
    updated_results = {}
    for idx, blocks in synergy_frame_results.items():
        updated = []
        for block in blocks:
            effects = block.get("effect")
            if not effects:
                updated.append(block)
                continue
            # Flatten to list to check each effect string
            flattened = flatten_effects(effects)
            replaced = False
            for phrase in flattened:
                lowered = phrase.lower()
                for pattern, label in generalization_rules:
                    if re.search(pattern, lowered):
                        # Replace top-level effect if possible
                        block["effect"] = label
                        replaced = True
                        break
                if replaced:
                    break
            updated.append(block)
        updated_results[idx] = updated
    return updated_results


def clean_bucket_name(text):
    return text.replace("_", " ").strip().title()


# --- Grouping logic ---
def group_by_synergy(cards, min_phrase_len=3):
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

    # 5. Apply to effects
    synergy_frame_results = post_process_synergy_frames(synergy_frame_results, generalization_rules)

    # 6. Bucket by effects
    for idx, blocks in synergy_frame_results.items():
        card = cards[idx]
        for block in blocks:
            effects = block.get("effect")
            if not effects:
                continue
            # Flatten nested effects to label
            flattened = flatten_effects(effects)
            for phrase in flattened:
                if phrase and len(phrase.split()) >= min_phrase_len:
                    label = clean_bucket_name(phrase)
                    buckets[label].append(card)

    # 7. Filter singleton buckets
    buckets = {
        label: group for label, group in buckets.items() if len(group) > 1
    }

    return dict(buckets)