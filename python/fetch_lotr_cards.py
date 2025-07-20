import json
import urllib.request

SCRYFALL_LOTR_URL = "https://api.scryfall.com/cards/search?q=e%3Alotr"

def fetch_all_cards():
    all_cards = []
    url = SCRYFALL_LOTR_URL

    while url:
        print(f"Fetching: {url}")
        with urllib.request.urlopen(url) as response:
            data = json.load(response)

        all_cards.extend(data["data"])
        if data.get("has_more"):
            url = data.get("next_page")
        else:
            url = None

    return all_cards

def extract_relevant_fields(cards):
    extracted = []
    for card in cards:
        # Skip duplicates or tokens
        if card.get("layout") == "token" or card.get("digital", False):
            continue

        extracted.append({
            "name": card.get("name"),
            "rarity": card.get("rarity"),
            "color_identity": card.get("color_identity", []),
            "type_line": card.get("type_line", ""),
            "oracle_text": card.get("oracle_text", ""),
            "keywords": card.get("keywords", [])
        })
    return extracted

def main():
    cards = fetch_all_cards()
    simple_cards = extract_relevant_fields(cards)

    output = {"cards": simple_cards}

    with open("sample_input.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print(f"Saved {len(simple_cards)} cards to sample_input.json")

if __name__ == "__main__":
    main()
