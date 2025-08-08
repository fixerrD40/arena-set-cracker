def extract_leaf_effects(effects):
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


def flatten_card(card_name, metadata, parsed_oracle):
    flat = {
        "name": card_name,
        "types": [],
        "keywords": [],
        "triggers": [],
        "conditions": [],
        "effects": []
    }

    # Types from type_line
    type_line = metadata.get("type_line", "")
    flat["types"] = [
        t.strip() for t in type_line.replace("—", "—").split() if t.istitle()
    ]

    # Keywords
    flat["keywords"] = metadata.get("keywords", [])

    # Parse oracle text components
    for entry in parsed_oracle:
        for clause in entry.get("clauses", []):
            if clause["type"] == "trigger":
                flat["triggers"].extend(clause.get("subjects", []))
            elif clause["type"] == "condition":
                flat["conditions"].extend(clause.get("subjects", []))

        # If the entry has an "effects" field, extract from it
        if "effects" in entry:
            flat["effects"].extend(extract_leaf_effects(entry["effects"]))
        # Otherwise, if it's just a leaf node with a "text" field, include it
        elif "text" in entry:
            flat["effects"].append(entry["text"])

    return flat


def flatten_all(cards, parsed_data):
    flattened = {}
    for card in cards:
        name = card.get("name")
        parsed_oracle = parsed_data.get(name)
        if parsed_oracle:
            flattened[name] = flatten_card(name, card, parsed_oracle)
    return flattened