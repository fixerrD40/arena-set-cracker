import json
from deck_builder.synergy_buckets import extract_synergy_frames

def load_cards(path="sample_input.json"):
    with open(path, "r") as f:
        return json.load(f)

def main():
    cards = [
            {
                "name": "Gorbag of Minas Morgul",
                "rarity": "uncommon",
                "color_identity": [
                    "B"
                ],
                "type_line": "Legendary Creature \u2014 Orc Soldier",
                "oracle_text": "Whenever a Goblin or Orc you control deals combat damage to a player, you may sacrifice it. When you do, choose one \u2014\n\u2022 Draw a card.\n\u2022 Create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")",
                "keywords": [
                    "Treasure"
                ]
            }
        ]

    result = extract_synergy_frames(cards)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()