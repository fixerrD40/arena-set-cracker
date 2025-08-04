import re

# --- Pattern Constants ---

TRIGGER = "trigger"
CONDITION = "condition"
TRIGGER_PREFIX = ["whenever", "when", "at the beginning", "after"]
CONDITION_PREFIX = ["if", "as long as"]

REFLEXIVE_SUBORDINATE_CLAUSE_PATTERN = re.compile(r"\byou do\b", re.IGNORECASE)
EFFECT_CHOICE_PATTERN = re.compile(r'\bchoose\s(one|two)\b', re.IGNORECASE)
EFFECT_OPTIONAL_PATTERN = re.compile(r'\byou may\b', re.IGNORECASE)
EFFECT_REPLACEMENT_PATTERN = re.compile(r'\binstead\b', re.IGNORECASE)
EFFECT_COST_PATTERN = re.compile(r':')
EFFECT_END_PATTERN = r'[.;\n]'

MANA_SYMBOL_PATTERN = re.compile(r'\{(?:[WUBRG]/[WUBRG]|[WUBRG]|\d+|X)}',re.IGNORECASE)
TAP_SYMBOL_PATTERN = re.compile(r'\{T}', re.IGNORECASE)

CORE_KEYWORDS = [
    "deathtouch", "double strike", "first strike", "flash", "flying", "indestructible", "haste",
    "lifelink", "reach", "trample", "vigilance"
]

EQUIP_PATTERN = re.compile(r'equip (?:\w+ )?', re.IGNORECASE)
ASSIGNED_TEXT_PATTERN = re.compile(r'"(.*?)"')

ALL_PREFIXES = [(TRIGGER, p) for p in TRIGGER_PREFIX] + [(CONDITION, p) for p in CONDITION_PREFIX]
ALL_PREFIXES.sort(key=lambda x: -len(x[1]))  # Longest match first

PREFIX_PATTERNS = [
    (t, p, re.compile(rf'\b{re.escape(p)}\b', re.IGNORECASE))
    for t, p in ALL_PREFIXES
]

# better way? ...[subject]....that [subject]....
# REFLEXIVE_SUBJECT_PATTERN = re.compile(r'\bthat\s(type|card|ability|player|creature)', flags=re.IGNORECASE)
# REFLEXIVE_SUBJECT_PATTERN2 = re.compile(r'\bthis\s(way|ability|mana)', flags=re.IGNORECASE)
# SELF_PATTERN = re.compile(r'\bthis\s(card|creature|artifact|saga|token|aura|land|enchantment|spell)')
# this turn/phase


def extract_synergy_frames(cards):
    result = {}
    for idx, card in enumerate(cards):
        oracle_text = card.get("oracle_text", "")
        keywords = card.get("keywords", [])
        keyword_text, remainder = strip_keywords(oracle_text, keywords)
        marks = mark_structural_elements(remainder)
        effects = parse_text(remainder, marks)
        result[card["name"]] = effects
    return result


# --- Text Preprocessing ---

def strip_keywords(text, keywords):
    """
    Remove core keywords and aggressively strip all parenthetical clauses.
    """
    lines = text.splitlines()
    stripped = []

    core_keywords = list(set([kw.lower() for kw in keywords]) & set(CORE_KEYWORDS))

    for line in lines:
        # Strip all parenthetical phrases aggressively
        line_clean = re.sub(r'( ?\([^)]*\))', '', line)
        line_lower = line_clean.lower()

        # Process keyword lines
        for kw in core_keywords:
            pattern = rf"^{re.escape(kw)}\b"
            if re.match(pattern, line_lower):
                clauses = [clause.strip() for clause in line_clean.split(",")]
                filtered_clauses = [c for c in clauses if c.lower() not in core_keywords]
                line_clean = ", ".join(filtered_clauses).strip()
                break

        # Remove empty lines that may result
        if line_clean:
            stripped.append(line_clean)

    return core_keywords, "\n".join(stripped)


# --- Structural Marking ---

def match_best_prefix(text, start):
    for type, prefix, pattern in PREFIX_PATTERNS:
        match = pattern.match(text, pos=start)
        if match:
            return {
                "type": type,
                "prefix": prefix,
                "start": match.start(),
                "end": match.end(),
                "text": text[match.start():match.end()]
            }
    return None


def mark_structural_elements(text):
    """
    Traverse oracle text and mark structural elements.
    """
    marks = []
    lower = text.lower()
    i = 0

    while i < len(text):
        ch = text[i]

        assigned_text_match = ASSIGNED_TEXT_PATTERN.match(text, i)
        if assigned_text_match:
            marks.append({
                "type": "assigned_text",
                "start": assigned_text_match.start(),
                "end": assigned_text_match.end(),
                "text": text[assigned_text_match.start():assigned_text_match.end()]
            })
            i = assigned_text_match.end()
            continue

        # Mark delimiters
        if ch in {'.', ';', '\n'}:
            marks.append({"type": "delimiter", "start": i, "end": i + 1, "text": ch})
            i += 1
            continue

        if i == 0 or text[i - 1] == '\n':
            equip_match = EQUIP_PATTERN.match(text, i)
            if equip_match:
                marks.append({
                    "type": "equip",
                    "start": i,
                    "end": equip_match.end(),
                    "text": text[i:equip_match.end()]
                })
                i = equip_match.end()
                continue

        mana_match = MANA_SYMBOL_PATTERN.match(text, i)
        if mana_match:
            marks.append({
                "type": "mana_cost",
                "start": mana_match.start(),
                "end": mana_match.end(),
                "text": text[mana_match.start():mana_match.end()]
            })
            i = mana_match.end()
            continue

        tap_match = TAP_SYMBOL_PATTERN.match(text, i)
        if tap_match:
            marks.append({
                "type": "tap_cost",
                "start": tap_match.start(),
                "end": tap_match.end(),
                "text": text[tap_match.start():tap_match.end()]
            })
            i = tap_match.end()
            continue

        colon_match = EFFECT_COST_PATTERN.match(text, i)
        if colon_match:
            marks.append({
                "type": "cost_divider",
                "start": colon_match.start(),
                "end": colon_match.end(),
                "text": text[colon_match.start():colon_match.end()]
            })
            i = colon_match.end()
            continue

        # Only try clause pattern matches at start of a word
        if ch.isalpha() and (i == 0 or not text[i - 1].isalnum()):
            # match triggers and conditions
            match = match_best_prefix(text, i)
            if match:
                marks.append(match)
                i = match["end"]
                continue

            match = REFLEXIVE_SUBORDINATE_CLAUSE_PATTERN.match(lower, i)
            if match:
                marks.append({
                    "type": "reflexive_subordinate_clause",
                    "start": match.start(),
                    "end": match.end(),
                    "text": text[match.start():match.end()]
                })
                i = match.end()
                continue

            opt_match = EFFECT_OPTIONAL_PATTERN.match(lower, i)
            if opt_match:
                marks.append({
                    "type": "optional",
                    "start": opt_match.start(),
                    "end": opt_match.end(),
                    "text": text[opt_match.start():opt_match.end()]
                })
                i = opt_match.end()
                continue

            choice_match = EFFECT_CHOICE_PATTERN.match(lower, i)
            if choice_match:
                marks.append({
                    "type": "choice",
                    "start": choice_match.start(),
                    "end": choice_match.end(),
                    "text": text[choice_match.start():choice_match.end()]
                })
                i = choice_match.end()
                continue

            replacement_match = EFFECT_REPLACEMENT_PATTERN.match(lower, i)
            if replacement_match:
                marks.append({
                    "type": "replacement",
                    "start": replacement_match.start(),
                    "end": replacement_match.end(),
                    "text": text[replacement_match.start():replacement_match.end()]
                })
                i = replacement_match.end()
                continue

        i += 1

    return sorted(marks, key=lambda m: m["start"])


# --- Parsing Core ---


def parse_text(text, marks):
    """
    Splits oracle text into effects based on delimiters with respect to
    conjunctive structures such as forward and backward joins.

    Returns a list of parsed effects, compounding those linked by backward joins,
    including replacements merged where appropriate.
    """
    n = len(marks)
    i = 0
    start = 0

    def marks_in_range(s, e):
        return [m for m in marks if s <= m['start'] < e]

    # First pass: divide text into chunks with respect to forward joins
    chunks = {}
    key = 1
    segment_key = 0
    segment_start = 0
    segment_text = ''
    segment_marks = []
    activated_ability = False

    while i < n:
        mark = marks[i]
        if mark['type'] == 'delimiter':
            if activated_ability:
                if (mark['text'] != '\n') & (i != n - 1):
                    i += 1
                    continue
                elif mark['text'] == '\n':
                    activated_ability = False

            end_pos = mark['end']
            start_pos = start
            current_marks = marks_in_range(start, end_pos)
            current_text = text[start:end_pos]

            start = end_pos
            i += 1

            # Outside forward join this is dropping on floor
            if current_text == '\n':
                segment_text += current_text
                segment_marks += current_marks
                continue

            if any(m['type'] == 'replacement' for m in current_marks):
                chunks[key] = {
                    "text": current_text,
                    "marks": current_marks,
                    "end_pos": end_pos,
                    "start_pos": start_pos,
                }
                key += 1
                continue

            is_forward_join = any(m['type'] == 'choice' for m in current_marks)
            is_bullet = current_text.startswith('\u2022')

            if is_forward_join:
                segment_start = start_pos
                segment_key = key
                segment_text = current_text
                segment_marks = current_marks
                key += 1
                continue

            elif is_bullet and segment_key:
                segment_text += current_text
                segment_marks += current_marks
                continue

            elif segment_key:
                chunks[segment_key] = {
                    "text": segment_text,
                    "marks": segment_marks,
                    "end_pos": segment_marks[-1]['end'],
                    "start_pos": segment_start
                }
                segment_text = ''
                segment_marks = []
                segment_key = 0

            chunks[key] = {
                "text": current_text,
                "marks": current_marks,
                "end_pos": end_pos,
                "start_pos": start_pos
            }
            key += 1

        else:
            if mark['type'] == 'cost_divider':
                activated_ability = True
            i += 1

    if segment_key:
        chunks[segment_key] = {
            "text": segment_text,
            "marks": segment_marks,
            "end_pos": segment_marks[-1]['end'],
            "start_pos": segment_start
        }

    # Find the position of the last delimiter mark (if any)
    last_delim = max((m for m in marks if m['type'] == 'delimiter'), key=lambda m: m['end'], default=None)

    # If there's unprocessed text or tail marks, add a final chunk
    if last_delim and last_delim['end'] < len(text):
        chunks[key] = {
            "text": text[last_delim['end']:],
            "marks": [m for m in marks if m['start'] >= last_delim['end']],
            "end_pos": len(text),
            "start_pos": start
        }

    # Second pass: parse each chunk
    parsed = {}
    for k, chunk in chunks.items():
        start_pos = chunk['start_pos']
        adjusted_marks = shift_marks_relative_to_subtext(chunk["marks"], chunk["start_pos"])

        # Store parsed result
        if any(m['type'] == 'replacement' for m in adjusted_marks):
            parsed[k] = parse_replacement(chunk['text'], adjusted_marks)
        elif any(m['type'] == 'equip' for m in adjusted_marks):
            parsed[k] = parse_equip(chunk['text'], adjusted_marks)
        elif any(m['type'] == 'cost_divider' for m in adjusted_marks):
            parsed[k] = parse_activated_ability(chunk['text'], adjusted_marks)
        else:
            effect = parse_effect(chunk['text'], adjusted_marks)

            # Get current chunk's end_pos
            end_pos = chunk.get('end_pos', 0)

            # If next chunk is a replacement, extend the span
            next_chunk = chunks.get(k + 1)
            if next_chunk and any(m['type'] == 'replacement' for m in next_chunk['marks']):
                replacement_end = next_chunk.get('end_pos', 0)
                end_pos = max(end_pos, replacement_end)

            # Assign text based on the range from start_pos to end_pos
            effect['text'] = text[start_pos:end_pos].strip()

            parsed[k] = effect

    # Third pass: attach replacements and compound clauses to prior effects
    merged = []
    keys = sorted(parsed.keys())
    i = 0

    while i < len(keys):
        k = keys[i]
        current = parsed[k]

        next_k = keys[i + 1] if i + 1 < len(keys) else None
        next_chunk = chunks.get(next_k)
        next_parsed = parsed.get(next_k)

        if next_chunk and next_parsed:
            mark_types = {m['type'] for m in next_chunk['marks']}

            if 'reflexive_subordinate_clause' in mark_types:
                compound = {
                    "text": f"{current['text']} {next_parsed['text']}".strip(),
                    "effects": [current, next_parsed],
                    "modifiers": ["compound:reflexive"]
                }
                merged.append(compound)
                i += 2
                continue

            elif 'replacement' in mark_types:
                current['replacement'] = next_parsed
                merged.append(current)
                i += 2
                continue

        merged.append(current)
        i += 1

    return merged


def parse_effect(text, marks):
    effect = {}
    clauses = []
    nested_effects = []
    modifiers = []
    consumed_ranges = []

    i = 0
    while i < len(marks):
        mark = marks[i]

        if mark["type"] in (TRIGGER, CONDITION):
            clause, consumed, end = consume_clause(text, marks[i:])
            clauses.append(clause)
            consumed_ranges.append((mark["start"], end))
            i += consumed

        elif mark["type"] == "choice":
            choice, consumed, end = consume_choice_effect(text, marks[i:])
            nested_effects.append(choice)
            modifiers.append("choice")
            consumed_ranges.append((mark["start"], end))
            i += consumed

        elif mark["type"] == "optional":
            modifiers.append("optional")
            consumed_ranges.append((mark["start"], mark["end"]))
            i += 1

        else:
            i += 1

    # Add any unmarked residual text
    unmarked_ranges = find_unmarked_ranges(len(text), consumed_ranges)
    for start, end in unmarked_ranges:
        residual = text[start:end].strip()
        if residual and residual != text.strip():
            nested_effects.append({"text": residual})

    if clauses:
        effect["clauses"] = clauses
    if nested_effects:
        effect["effects"] = nested_effects
    if modifiers:
        effect["modifiers"] = modifiers

    return effect

def parse_replacement(text, marks):
    replacement = {"text": text.strip()}

    replacement_effects = []
    clauses = []
    modifiers = []

    i = 0
    last_consumed = 0

    while i < len(marks):
        mark = marks[i]

        if mark["type"] in (CONDITION, TRIGGER):
            clause, consumed, end = consume_clause(text, marks[i:])
            clauses.append(clause)
            last_consumed = end
            i += consumed

        elif mark["type"] == "optional":
            modifiers.append("optional")
            last_consumed = mark["end"]
            i += 1

        else:
            i += 1

    # After all clauses and known marks are consumed, grab the remaining text as the effect
    if last_consumed < len(text):
        residual_effect = text[last_consumed:]
        # Remove "instead"
        residual_effect = re.sub(EFFECT_REPLACEMENT_PATTERN, '', residual_effect)
        # Remove space before punctuation (.,;:)
        residual_effect = re.sub(r'\s+([.;\n])', r'\1', residual_effect)
        if residual_effect.strip():
            replacement_effects.append(residual_effect.strip())

    if clauses:
        replacement["clauses"] = clauses
    if replacement_effects:
        replacement["effects"] = replacement_effects
    if modifiers:
        replacement["modifiers"] = modifiers

    return replacement

def parse_activated_ability(text, marks):
    marks = sorted(marks, key=lambda m: m['start'])

    cost_parts = []
    last_cost_end = 0

    for mark in marks:
        if mark['type'] in ['mana_cost', 'tap_cost']:
            cost_parts.append(mark['text'])
            last_cost_end = max(last_cost_end, mark['end'])

    colon_mark = next((m for m in marks if m['type'] == 'cost_divider'), None)
    colon_pos = colon_mark['start'] if colon_mark else None

    # Capture any extra cost
    extra_cost_text = text[last_cost_end:colon_pos]
    if extra_cost_text.strip(' ,'):
        cost_parts.append(extra_cost_text.strip(' ,'))

    # Residual effect text comes after colon
    main_effect_text = text[colon_pos + 1:]
    residual_marks = shift_marks_relative_to_subtext(marks, colon_pos + 1)

    return {
        "text": text.strip(),
        "cost": cost_parts,
        "effects": parse_text(main_effect_text, residual_marks)
    }

def parse_equip(text, marks):
    cost_parts = []

    # Collect all mana costs
    last_cost_end = marks[1]['end']
    for mark in marks:
        if mark['type'] == 'mana_cost':
            cost_parts.append(mark['text'])
            last_cost_end = max(last_cost_end, mark['end'])

    # Add any trailing text after the last mana cost as an additional cost
    trailing_cost_text = text[last_cost_end:]
    if trailing_cost_text.strip(' .\n'):
        cost_parts.append(trailing_cost_text.strip(' .\n'))

    return {
        "text": text.strip(),
        "cost": cost_parts,
        "effects": marks[0]['text'].strip()
    }


# --- Pattern Consumers ---

def consume_clause(text, marks):
    mark = marks[0]
    text = text[mark['start']:]
    mark_type = mark['type']

    end = re.search(r'[,.](\s*)', text)
    to_consume = end.start() + 2
    end_pos = mark['start'] + to_consume

    clause_text = text[:to_consume].strip()
    consumed = count_marks_in_range(marks, mark["start"], end_pos)
    relevant_marks = [m for m in marks[:consumed] if m['type'] == mark_type]

    # Extract subjects between clause-start prefixes of the same type
    subjects = []
    for i, mark in enumerate(relevant_marks):
        prefix_length = mark["end"] - mark["start"]
        start = prefix_length + 1

        if i + 1 < len(relevant_marks):
            raw_chunk = text[start:relevant_marks[i + 1]['start']]

            # Strip common delimiters like " and ", " or ", ", and", etc.
            cleaned_chunk = re.sub(r'\s*(,?\s*(and|or))?\s*$', '', raw_chunk)
            end = start + len(cleaned_chunk)
        else:
            # exclude trailing comma
            end = to_consume - 2

        subject_text = text[start:end].strip()
        if subject_text:
            subjects.append(subject_text)

    clause = {
        "type": mark_type,
        "text": clause_text,
        "subjects": subjects
    }

    return clause, consumed, end_pos


def consume_choice_effect(text, marks):
    start = marks[0]["start"]

    # Find the line starting with "choose one —" or similar
    match = re.search(EFFECT_CHOICE_PATTERN, text[start:])

    choice_start = start + match.start()
    remaining_text = text[choice_start:]

    # Capture all lines starting with • until we hit something that doesn't match
    lines = remaining_text.splitlines()
    clause_lines = [lines[0]]  # start with "choose one —"

    for line in lines[1:]:
        if re.match(r'\s*•', line):
            clause_lines.append(line)
        else:
            break

    clause_text = "\n".join(clause_lines).strip()

    # Extract the bullet effects
    choice_items = re.findall(r'•\s*(.*?)(?:[\n\r]|$)', clause_text)

    effects = []
    for item in choice_items:
        effects.append({
            "text": f"• {item.strip()}",
            "effects": [{"text": item.strip()}],
        })

    effect = {
        "text": clause_text,
        "effects": effects
    }

    # Determine how many marks were covered from start to end of this block
    clause_end = start + len("\n".join(clause_lines))
    consumed = count_marks_in_range(marks, start, clause_end)

    return effect, consumed, clause_end


# --- Utilities ---

def count_marks_in_range(marks, start, end):
    return len([m for m in marks if start <= m["start"] < end])

def shift_marks_relative_to_subtext(marks, base_offset):
    return [
        {
            **m,
            "start": m["start"] - base_offset,
            "end": m["end"] - base_offset
        }
        for m in marks
        if m["start"] >= base_offset
    ]


def find_effect_end(text, start):
    match = re.search(EFFECT_END_PATTERN, text[start:])
    return start + match.start() + 1 if match else len(text)

def find_unmarked_ranges(text_len, consumed_ranges):
    consumed_ranges = sorted(consumed_ranges)
    unmarked = []

    start = 0
    for begin, end in consumed_ranges:
        if start < begin:
            unmarked.append((start, begin))
        start = max(start, end)

    if start < text_len:
        unmarked.append((start, text_len))

    return unmarked