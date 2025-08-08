import json
import urllib.request
import sys

SCRYFALL_LOTR_URL = "https://api.scryfall.com/cards/search?q=e%3Alotr"

def fetch_all_cards():
    all_cards = []
    url = SCRYFALL_LOTR_URL

    while url:
        print(f"Fetching: {url}")
        with urllib.request.urlopen(url) as response:
            data = json.load(response)

        all_cards.extend(data["data"])
        url = data.get("next_page") if data.get("has_more") else None

    return all_cards

def color_identity_matches(card_colors, input_colors):
    card_set = {c.lower() for c in card_colors}
    input_set = set(input_colors)

    if not card_set:
        return True  # Include colorless cards

    # 1. Mono-colored match: exactly one of the input colors
    if len(card_set) == 1 and next(iter(card_set)) in input_set:
        return True

    # 2. Multi-colored match: card includes all input colors
    return input_set.issubset(card_set)

def extract_relevant_fields(cards):
    return [
        {
            "name": card.get("name"),
            "rarity": card.get("rarity"),
            "color_identity": card.get("color_identity", []),
            "type_line": card.get("type_line", ""),
            "oracle_text": card.get("oracle_text", ""),
            "keywords": card.get("keywords", [])
        }
        for card in cards
        if card.get("layout") != "token" and not card.get("digital", False)
    ]

def filter_by_color_identity(cards, input_colors):
    if not input_colors:
        return cards  # Return everything if no filter

    return [
        card for card in cards
        if color_identity_matches(card.get("color_identity", []), input_colors)
    ]

def main(input_colors):
    input_colors = [c.lower() for c in input_colors]
    all_cards = fetch_all_cards()
    cleaned_cards = extract_relevant_fields(all_cards)
    filtered_cards = filter_by_color_identity(cleaned_cards, input_colors)

    if input_colors:
        color_key = "".join(sorted(input_colors))
        filename = f"lotr_{color_key}_cards.json"
    else:
        filename = "lotr_all_cards.json"

    with open(filename, "w", encoding="utf-8") as f:
        json.dump({"cards": filtered_cards}, f, indent=2)

    print(f"Saved {len(filtered_cards)} cards to {filename}")

if __name__ == "__main__":
    cli_args = sys.argv[1:]
    main(cli_args)