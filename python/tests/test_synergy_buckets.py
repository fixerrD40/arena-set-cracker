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

        self.expected_marks = [
            {'type': 'trigger', 'prefix': 'whenever', 'start': 0, 'end': 8, 'text': 'Whenever'},
            {'type': 'optional', 'start': 70, 'end': 77, 'text': 'you may'},
            {'type': 'delimiter', 'start': 90, 'end': 91, 'text': '.'},
            {'type': 'trigger', 'prefix': 'when', 'start': 92, 'end': 96, 'text': 'When'},
            {'type': 'reflexive_subordinate_clause', 'start': 97, 'end': 103, 'text': 'you do'},
            {'type': 'choice', 'start': 105, 'end': 115, 'text': 'choose one'},
            {'type': 'delimiter', 'start': 117, 'end': 118, 'text': '\n'},
            {'type': 'delimiter', 'start': 131, 'end': 132, 'text': '.'},
            {'type': 'delimiter', 'start': 132, 'end': 133, 'text': '\n'},
            {'type': 'delimiter', 'start': 158, 'end': 159, 'text': '.'}
        ]

        self.expected_blocks = [
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
        ]

    def test_extract_blocks_matches_expected(self):
        from deck_builder.synergy_buckets import extract_synergy_frames

        actual_dict = extract_synergy_frames(self.cards)
        self.assertEqual(list(actual_dict.values()), self.expected_blocks)

    def test_mark_structural_elements(self):
        from deck_builder.synergy_buckets import mark_structural_elements, strip_keywords

        _, input_data = strip_keywords(self.cards[0]["oracle_text"], self.cards[0]["keywords"])
        actual_marks = mark_structural_elements(input_data)
        actual_simple = [(m["type"], m["text"]) for m in actual_marks]
        expected_simple = [(m["type"], m["text"]) for m in self.expected_marks]
        self.assertEqual(actual_simple, expected_simple)

if __name__ == "__main__":
    unittest.main()