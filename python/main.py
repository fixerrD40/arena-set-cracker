import json
from deck_builder.flatten import flatten_all
from deck_builder.parser import parse_oracle
from deck_builder.extract_synergy import print_synergy_report

def load_cards(path="lotr_bg_cards.json"):
    with open(path, "r") as f:
        return json.load(f)

def main():
    input_data = load_cards()
    cards = input_data["cards"]

    parsed_data = parse_oracle(cards)
    flattened = flatten_all(cards, parsed_data)

    print_synergy_report(flattened)

if __name__ == "__main__":
    main()