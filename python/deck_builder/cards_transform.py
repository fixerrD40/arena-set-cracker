import re
from typing import List, Dict, Tuple

# General value placeholders
BUFF = "<BUFF>"
STAT = "<STAT>"
NUM = "<NUM>"

# --- Regex for MTG-specific normalization ---
RE_BUFF = re.compile(r'([+-]\d+)/([+-]\d+)')
RE_STAT = re.compile(r'\b\d+/\d+\b')
RE_NUM = re.compile(r'\b\d+|(x|a|one|two|three|four|five|six|seven|nine|fourteen)\b')


def normalize_token(token: str) -> str:
    token = RE_BUFF.sub(BUFF, token)
    token = RE_STAT.sub(STAT, token)
    token = RE_NUM.sub(NUM, token)
    return token


def build_plural_map(all_tokens: List[str]) -> Dict[str, str]:
    plural_map = {}
    tokens_set = set(all_tokens)

    for token in tokens_set:
        if token.endswith('s'):
            singular = token[:-1]
            if singular in tokens_set:
                plural_map[token] = singular

    return plural_map


def normalize_texts(texts: List[str]) -> List[List[str]]:
    all_tokens = []
    for text in texts:
        text_lower = text.lower()
        text_clean = re.sub(r"[^\w\s~/+-]", "", text_lower)
        all_tokens.extend(text_clean.split())

    all_tokens = [normalize_token(tok) for tok in all_tokens]
    plural_map = build_plural_map(all_tokens)

    normalized_texts = []
    for text in texts:
        text_lower = text.lower()
        text_clean = re.sub(r"[^\w\s~/+-]", "", text_lower)
        raw_tokens = text_clean.split()
        tokens = [normalize_token(tok) for tok in raw_tokens]
        normalized = [plural_map.get(tok, tok) for tok in tokens]
        normalized_texts.append(normalized)

    return normalized_texts


def extract_leaf_effects(effects) -> List[str]:
    """
    Recursively extract all 'text' fields from nested effect structures.
    Only returns the actual leaf-level effect texts.
    """
    leaf_texts = []
    if isinstance(effects, list):
        for effect in effects:
            if isinstance(effect, dict):
                if "effects" in effect:
                    leaf_texts.extend(extract_leaf_effects(effect["effects"]))
                elif "text" in effect:
                    leaf_texts.append(effect["text"])
            elif isinstance(effect, str):
                leaf_texts.append(effect)
    elif isinstance(effects, dict):
        if "effects" in effects:
            leaf_texts.extend(extract_leaf_effects(effects["effects"]))
        elif "text" in effects:
            leaf_texts.append(effects["text"])
    elif isinstance(effects, str):
        leaf_texts.append(effects)

    return leaf_texts


def flatten_card(card_name: str, metadata: Dict, parsed_oracle: List[Dict]) -> Dict:
    flat = {
        "name": card_name,
        "rarity": metadata.get("rarity", ""),
        "types": [],
        "keywords": [],
        "triggers": [],
        "conditions": [],
        "effects": [],
        "color_identity": metadata.get("color_identity", [])
    }

    # Types from type_line
    type_line = metadata.get("type_line", "")
    flat["types"] = [
        t.strip() for t in type_line.replace("—", "—").split() if t.istitle()
    ]

    # Keywords
    flat["keywords"] = metadata.get("keywords", [])

    # Collect raw texts
    raw_triggers = []
    raw_conditions = []
    raw_effects = []

    for entry in parsed_oracle:
        for clause in entry.get("clauses", []):
            if clause["type"] == "trigger":
                raw_triggers.extend(clause.get("subjects", []))
            elif clause["type"] == "condition":
                raw_conditions.extend(clause.get("subjects", []))

        if "effects" in entry:
            raw_effects.extend(extract_leaf_effects(entry["effects"]))
        elif "text" in entry:
            raw_effects.append(entry["text"])

    flat["triggers"] = raw_triggers
    flat["conditions"] = raw_conditions
    flat["effects"] = raw_effects

    return flat


def transform(cards: List[Dict], cards_parsed_oracle: Dict[str, List[Dict]]) -> Dict[str, Dict]:
    flattened = {}

    for card in cards:
        name = card.get("name")
        parsed_oracle = cards_parsed_oracle.get(name)
        if parsed_oracle:
            flattened[name] = flatten_card(name, card, parsed_oracle)

    return normalize_flattened(flattened)


def normalize_flattened(flattened: Dict[str, Dict]) -> Dict[str, Dict]:
    all_texts = []
    field_locations: List[Tuple[str, str, int]] = []

    for card_name, card in flattened.items():
        for field in ["triggers", "conditions", "effects"]:
            for idx, raw_text in enumerate(card[field]):
                all_texts.append(raw_text)
                field_locations.append((card_name, field, idx))

    normalized = normalize_texts(all_texts)

    for (card_name, field, idx), tokens in zip(field_locations, normalized):
        flattened[card_name][field][idx] = tokens

    return flattened