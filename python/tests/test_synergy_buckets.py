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
            },
            {
                "name": "Flame of Anor",
                "rarity": "rare",
                "color_identity": [
                    "R",
                    "U"
                ],
                "type_line": "Instant",
                "oracle_text": "Choose one. If you control a Wizard as you cast this spell, you may choose two instead.\n\u2022 Target player draws two cards.\n\u2022 Destroy target artifact.\n\u2022 Flame of Anor deals 5 damage to target creature.",
                "keywords": []
            },
            {
                "name": "Stone of Erech",
                "rarity": "uncommon",
                "color_identity": [],
                "type_line": "Legendary Artifact",
                "oracle_text": "If a creature an opponent controls would die, exile it instead.\n{2}, {T}, Sacrifice Stone of Erech: Exile target player's graveyard. Draw a card.",
                "keywords": []
            },
        ]

        self.expected_marks = {
            "Gorbag of Minas Morgul": [
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
            ],
            "Flame of Anor": [
                {'type': 'choice', 'start': 0, 'end': 10, 'text': 'Choose one'},
                {'type': 'delimiter', 'start': 10, 'end': 11, 'text': '.'},
                {'type': 'condition', 'prefix': 'if', 'start': 12, 'end': 14, 'text': 'If'},
                {'type': 'trigger', 'prefix': 'as', 'start': 36, 'end': 38, 'text': 'as'},
                {'type': 'optional', 'start': 60, 'end': 67, 'text': 'you may'},
                {'type': 'choice', 'start': 68, 'end': 78, 'text': 'choose two'},
                {'type': 'replacement', 'start': 79, 'end': 86, 'text': 'instead'},
                {'type': 'delimiter', 'start': 86, 'end': 87, 'text': '.'},
                {'type': 'delimiter', 'start': 87, 'end': 88, 'text': '\n'},
                {'type': 'delimiter', 'start': 119, 'end': 120, 'text': '.'},
                {'type': 'delimiter', 'start': 120, 'end': 121, 'text': '\n'},
                {'type': 'delimiter', 'start': 146, 'end': 147, 'text': '.'},
                {'type': 'delimiter', 'start': 147, 'end': 148, 'text': '\n'},
                {'type': 'delimiter', 'start': 197, 'end': 198, 'text': '.'}
            ],
            "Stone of Erech": [
                {'type': 'condition', 'prefix': 'if', 'start': 0, 'end': 2, 'text': 'If'},
                {'type': 'replacement', 'start': 55, 'end': 62, 'text': 'instead'},
                {'type': 'delimiter', 'start': 62, 'end': 63, 'text': '.'},
                {'type': 'delimiter', 'start': 63, 'end': 64, 'text': '\n'},
                {'type': 'mana_cost', 'start': 64, 'end': 66, 'text': '{2}'},
                {'type': 'tap_cost', 'start': 69, 'end': 72, 'text': '{T}'},
                {'type': 'cost_divider', 'start': 98, 'end': 99, 'text': ':'},
                {'type': 'delimiter', 'start': 131, 'end': 132, 'text': '.'},
                {'type': 'delimiter', 'start': 144, 'end': 145, 'text': '.'}
            ]
        }

        self.expected_blocks = {
            "Gorbag of Minas Morgul": [
                {
                    "text": "Whenever a Goblin or Orc you control deals combat damage to a player, you may sacrifice it. When you do, choose one \u2014\n\u2022 Draw a card.\n\u2022 Create a Treasure token.",
                    "effects": [
                        {
                            "text": "Whenever a Goblin or Orc you control deals combat damage to a player, you may sacrifice it.",
                            "clauses": [
                                {
                                    "type": "trigger",
                                    "text": "Whenever a Goblin or Orc you control deals combat damage to a player,",
                                    "subjects": ["a Goblin or Orc you control deals combat damage to a player"]
                                }
                            ],
                            "effects": [{"text": "sacrifice it."}],
                            "modifiers": ["optional"]
                        },
                        {
                            "text": "When you do, choose one —\n• Draw a card.\n• Create a Treasure token.",
                            "clauses": [
                                {
                                    "type": "trigger",
                                    "text": "When you do,",
                                    "subjects": ["you do"]
                                }
                            ],
                            "effects": [
                                {
                                    "text": "choose one —\n• Draw a card.\n• Create a Treasure token.",
                                    "effects": [
                                        {"text": "• Draw a card.", "effects": [{"text": "Draw a card."}]},
                                        {"text": "• Create a Treasure token.", "effects": [{"text": "Create a Treasure token."}]}
                                    ]
                                }
                            ],
                            "modifiers": ["choice"]
                        }
                    ],
                    "modifiers": ["compound:reflexive"]
                }
            ],
            "Flame of Anor": [
                {
                    "text": "Choose one. If you control a Wizard as you cast this spell, you may choose two instead.\n\u2022 Target player draws two cards.\n\u2022 Destroy target artifact.\n\u2022 Flame of Anor deals 5 damage to target creature.",
                    "effects": [
                        {
                            "text": "Choose one.\n\u2022 Target player draws two cards.\n\u2022 Destroy target artifact.\n\u2022 Flame of Anor deals 5 damage to target creature.",
                            "effects": [
                                {"text": "• Target player draws two cards.", "effects": [{"text": "Target player draws two cards."}]},
                                {"text": "• Destroy target artifact.", "effects": [{"text": "Destroy target artifact."}]},
                                {"text": "• Flame of Anor deals 5 damage to target creature.", "effects": [{"text": "Flame of Anor deals 5 damage to target creature."}]}
                            ]
                        }
                    ],
                    "replacement": {
                        "text": "If you control a Wizard as you cast this spell, you may choose two instead.",
                        "clauses": [
                            {
                                "type": "condition",
                                "text": "If you control a Wizard as you cast this spell,",
                                "subjects": ["you control a Wizard as you cast this spell"]
                            }
                        ],
                        "effects": ["choose two."],
                        "modifiers": ["optional"]
                    },
                    "modifiers": ["choice"]
                }
            ],
            "Stone of Erech": [
                {
                    "text": "If a creature an opponent controls would die, exile it instead.",
                    "clauses": [
                        {
                            "type": "condition",
                            "text": "If a creature an opponent controls would die,",
                            "subjects": [
                                "a creature an opponent controls would die"
                            ]
                        }
                    ],
                    "effects": [
                        "exile it."
                    ]
                },
                {
                    "text": "{2}, {T}, Sacrifice Stone of Erech: Exile target player's graveyard. Draw a card.",
                    "cost": [
                        "{2}",
                        "{T}",
                        "Sacrifice Stone of Erech"
                    ],
                    "effects": [
                        {"text": "Exile target player's graveyard."},
                        {"text": "Draw a card."}
                    ]
                }
            ]
        }

    def test_extract_blocks_matches_expected(self):
        from deck_builder.synergy_buckets import extract_synergy_frames
        result = extract_synergy_frames(self.cards)
        self.assertEqual(result, self.expected_blocks)

    def test_mark_structural_elements_all_cards(self):
        from deck_builder.synergy_buckets import mark_structural_elements, strip_keywords

        for card in self.cards:
            with self.subTest(card=card["name"]):
                _, input_data = strip_keywords(card["oracle_text"], card["keywords"])
                actual_marks = mark_structural_elements(input_data)
                expected = self.expected_marks[card["name"]]
                actual_simple = [(m["type"], m["text"]) for m in actual_marks]
                expected_simple = [(m["type"], m["text"]) for m in expected]
                self.assertEqual(actual_simple, expected_simple)

if __name__ == "__main__":
    unittest.main()
