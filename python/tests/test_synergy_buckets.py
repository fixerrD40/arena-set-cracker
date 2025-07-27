import json
import unittest

class TestExtractSynergyFramesReflexive(unittest.TestCase):
    def setUp(self):
        self.cards = [
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

        self.expected_blocks = [[
            {
                "text": "Whenever a Goblin or Orc you control deals combat damage to a player, you may sacrifice it.",
                "trigger": {
                    "text": "Whenever a Goblin or Orc you control deals combat damage to a player,",
                    "subjects": ["a Goblin or Orc you control deals combat damage to a player"]
                },
                "effects": [
                    {
                        "text": "you may sacrifice it.",
                        "effects": [{"text": "sacrifice it"}],
                        "modifiers": ["optional"]
                    },
                    {
                        "text": "When you do, choose one — • Draw a card. • Create a Treasure token.",
                        "trigger": {
                            "text": "When you do,",
                            "modifiers": ["reflexive"]
                        },
                        "effects": [
                            {
                                "text": "choose one — • Draw a card. • Create a Treasure token.",
                                "effects": [
                                    {
                                        "text": "• Draw a card.",
                                        "effects": [{"text": "Draw a card"}]
                                    },
                                    {
                                        "text": "• Create a Treasure token.",
                                        "effects": [{"text": "Create a Treasure token"}]
                                    }
                                ],
                                "modifiers": ["choice"]
                            }
                        ]
                    }
                ]
            }
        ]]

    def test_extract_blocks_matches_expected(self):
        from deck_builder.synergy_buckets import extract_synergy_frames

        actual_dict = extract_synergy_frames(self.cards)
        self.assertEqual(list(actual_dict.values()), self.expected_blocks)

if __name__ == "__main__":
    unittest.main()