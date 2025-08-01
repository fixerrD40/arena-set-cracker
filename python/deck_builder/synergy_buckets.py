import re

# --- Pattern Constants ---

TRIGGER = "trigger"
CONDITION = "condition"
TRIGGER_PREFIX = ["whenever", "when", "at the beginning", "as", "after"]
CONDITION_PREFIX = ["if", "as long as"]

REFLEXIVE_SUBORDINATE_CLAUSE_PATTERN = re.compile(r"\byou do\b", flags=re.IGNORECASE)
CHOICE_EFFECT_PATTERN = re.compile(r'\bchoose one\b', flags=re.IGNORECASE)
OPTIONAL_EFFECT_PATTERN = re.compile(r'\byou may\b', flags=re.IGNORECASE)
EFFECT_END_PATTERN = r'[.;\n]'

CORE_KEYWORDS = [
    "deathtouch", "double strike", "first strike", "flash", "flying", "haste",
    "lifelink", "reach", "trample", "vigilance"
]

ALL_PREFIXES = [(TRIGGER, p) for p in TRIGGER_PREFIX] + [(CONDITION, p) for p in CONDITION_PREFIX]
ALL_PREFIXES.sort(key=lambda x: -len(x[1]))  # Longest match first

PREFIX_PATTERNS = [
    (t, p, re.compile(rf'\b{re.escape(p)}\b', re.IGNORECASE))
    for t, p in ALL_PREFIXES
]

REFLEXIVE_SUBJECT_PATTERN = re.compile(r'\b(this|that)\b\s+\b\w+\b', flags=re.IGNORECASE)


def extract_synergy_frames(cards):
    result = {}
    for idx, card in enumerate(cards):
        oracle_text = card.get("oracle_text", "")
        keywords = card.get("keywords", [])
        keyword_text, remainder = strip_keywords(oracle_text, keywords)
        marks = mark_structural_elements(remainder)
        effects = parse_effects(remainder, marks)
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
        line_clean = re.sub(r'\([^)]*\)', '', line.strip())
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
    seen_choice = False

    while i < len(text):
        ch = text[i]

        # Mark delimiters at every position they appear
        if ch in {'.', ';', '\n'}:
            marks.append({"type": "delimiter", "start": i, "end": i + 1, "text": ch})
            i += 1
            continue

        # Only try clause pattern matches at start of a word
        if ch.isalpha() and (i == 0 or not text[i - 1].isalnum()):
            # match triggers and conditions
            match = match_best_prefix(text, i)
            if match:
                marks.append(match)
                i = match["end"]
                continue

            # Reflexive subordinate clause
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

            # Reflexive subject
            reflexive_subj_match = REFLEXIVE_SUBJECT_PATTERN.match(lower, i)
            if reflexive_subj_match:
                marks.append({
                    "type": "reflexive_subject",
                    "start": reflexive_subj_match.start(),
                    "end": reflexive_subj_match.end(),
                    "text": text[reflexive_subj_match.start():reflexive_subj_match.end()]
                })
                i = reflexive_subj_match.end()
                continue

            # Optional pattern
            opt_match = OPTIONAL_EFFECT_PATTERN.match(lower, i)
            if opt_match:
                marks.append({
                    "type": "optional",
                    "start": opt_match.start(),
                    "end": opt_match.end(),
                    "text": text[opt_match.start():opt_match.end()]
                })
                i = opt_match.end()
                continue

            # Choice pattern
            choice_match = CHOICE_EFFECT_PATTERN.match(lower, i)
            if choice_match and not seen_choice:
                marks.append({
                    "type": "choice",
                    "start": choice_match.start(),
                    "end": choice_match.end(),
                    "text": text[choice_match.start():choice_match.end()]
                })
                seen_choice = True
                i = choice_match.end()
                continue

        i += 1

    return sorted(marks, key=lambda m: m["start"])


# --- Parsing Core ---


def parse_effects(text, marks):
    """
    Splits oracle text into effects based on delimiters with respect to
    conjunctive structures such as forward and backward joins.

    Returns a list of parsed effects, compounding those linked by backward joins.
    """

    effects = []
    n = len(marks)
    i = 0
    start = 0

    def marks_in_range(s, e):
        return [m for m in marks if s <= m['start'] < e]

    # First pass: divide text into chunks with respect to forward joins
    chunks = []
    while i < n:
        mark = marks[i]
        if mark['type'] == 'delimiter':
            # Group adjacent delimiters together (e.g., ".\n")
            end_pos = mark['end']
            j = i + 1
            while j < n and marks[j]['type'] == 'delimiter' and marks[j]['start'] == end_pos:
                end_pos = marks[j]['end']
                j += 1

            # Current segment is from start up to end_pos
            current_marks = marks_in_range(start, end_pos)

            # Check for forward join (e.g., choice)
            forward_join = any(m['type'] == 'choice' for m in current_marks)

            if forward_join:
                i = j
                continue  # keep absorbing into current chunk

            # Otherwise, safe to split here
            segment_text = text[start:end_pos]
            segment_marks = marks_in_range(start, end_pos)
            if segment_text.strip():
                chunks.append({
                    "text": segment_text.strip(),
                    "marks": segment_marks
                })

            start = end_pos
            i = j
            continue

        i += 1

    # Final trailing chunk
    if start < len(text):
        segment_text = text[start:]
        segment_marks = marks_in_range(start, len(text))
        if segment_text.strip():
            chunks.append({
                "text": segment_text.strip(),
                "marks": segment_marks
            })

    # Second pass: parse each chunk independently into a discrete effect
    parsed = []
    for chunk in chunks:
        base_offset = chunk['marks'][0]['start'] if chunk['marks'] else 0
        # Adjust all marks to be relative to this chunk
        adjusted_marks = [
            {
                **m,
                "start": m["start"] - base_offset,
                "end": m["end"] - base_offset
            }
            for m in chunk["marks"]
        ]
        parsed.append(parse_effect(chunk["text"], adjusted_marks))

    # Third pass: merge parsed effects that are backward-joined via reflexive clause
    merged = []
    i = 0
    while i < len(parsed):
        current = parsed[i]
        next_chunk = chunks[i + 1] if i + 1 < len(chunks) else None
        next_effect = parsed[i + 1] if i + 1 < len(parsed) else None

        # Check if next chunk contains a reflexive subordinate clause
        has_reflexive_join = (
            next_chunk and any(
                m["type"] == "reflexive_subordinate_clause"
                for m in next_chunk["marks"]
            )
        )

        if has_reflexive_join:
            # Wrap the two effects in a compound structure
            compound = {
                "text": f"{current['text']} {next_effect['text']}".strip(),
                "effects": [current, next_effect],
                "modifiers": ["compound:reflexive"]
            }
            merged.append(compound)
            i += 2
        else:
            merged.append(current)
            i += 1

    return merged


def parse_effect(text, marks):
    effect = {"text": text.strip()}

    clauses = []
    nested_effects = []
    modifiers = []

    i = 0
    while i < len(marks):
        mark = marks[i]

        if mark["type"] == TRIGGER:
            clause, consumed = consume_clause(text, marks[i:], TRIGGER)
            clauses.append(clause)
            i += consumed

        elif mark["type"] == CONDITION:
            clause, consumed = consume_clause(text, marks[i:], CONDITION)
            clauses.append(clause)
            i += consumed

        elif mark["type"] == "choice":
            choice, consumed = consume_choice_effect(text, marks[i:])
            nested_effects.append(choice)
            modifiers.append("choice")
            i += consumed

        elif mark["type"] == "optional":
            optional, consumed = consume_optional_effect(text, marks[i:])
            nested_effects.append(optional)
            modifiers.append("optional")
            i += consumed

        else:
            i += 1

    if clauses:
        effect["clauses"] = clauses
    if nested_effects:
        effect["effects"] = nested_effects
    if modifiers:
        effect["modifiers"] = modifiers

    return effect


# --- Pattern Consumers ---

def consume_clause(text, marks, clause_type):
    mark = marks[0]

    # Find clause end
    comma_match = re.search(r',', text[mark["end"]:])
    clause_end = mark["end"] + comma_match.start() + 1 if comma_match else len(text)

    clause_text = text[mark["start"]:clause_end].strip()

    # Extract the text after the prefix to clause end
    subject_text = text[mark["end"]:clause_end].strip()

    # Find all prefixes of the same clause_type inside this clause_text
    text_lower = clause_text.lower()
    prefix_positions = []
    for t, prefix, pattern in PREFIX_PATTERNS:
        if t != clause_type:
            continue
        for m in pattern.finditer(text_lower):
            prefix_positions.append(m.start())
    prefix_positions.sort()

    if len(prefix_positions) <= 1:
        # Single clause
        subjects = [subject_text.strip().strip(',')]
    else:
        # Compound clause
        subjects = []
        for i, start_pos in enumerate(prefix_positions):
            start = start_pos
            end = prefix_positions[i + 1] if i + 1 < len(prefix_positions) else len(clause_text)
            fragment = clause_text[start:end].strip().strip(',')
            # Remove prefix from fragment start
            prefix_pattern = re.compile(rf'^{re.escape(text_lower[start_pos:start_pos+len(prefix)])}', re.IGNORECASE)
            fragment = prefix_pattern.sub('', fragment).strip()
            if fragment:
                subjects.append(fragment)

    clause = {
        "type": clause_type,
        "text": clause_text,
        "subjects": subjects
    }

    consumed = count_marks_in_range(marks, mark["start"], clause_end)
    return clause, consumed


def consume_optional_effect(text, marks):
    mark = marks[0]
    end = find_effect_end(text, mark["end"])

    # Remove the optional prefix from sub_text
    sub_text = text[mark["end"]:end].strip()

    # Filter sub-marks to exclude the optional mark
    sub_marks = [m for m in marks if mark["end"] <= m["start"] < end]

    effect = parse_effect(sub_text, sub_marks)

    consumed = count_marks_in_range(marks, mark["start"], end)
    return effect, consumed


def consume_choice_effect(text, marks):
    start = marks[0]["start"]

    # Find the line starting with "choose one —" or similar
    match = re.search(r'choose\s+one\s+—', text[start:], flags=re.IGNORECASE)

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

    return effect, consumed


# --- Utilities ---

def count_marks_in_range(marks, start, end):
    return len([m for m in marks if start <= m["start"] < end])


def find_effect_end(text, start):
    match = re.search(EFFECT_END_PATTERN, text[start:])
    return start + match.start() + 1 if match else len(text)