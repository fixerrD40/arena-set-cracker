import json
from deck_builder.synergy_buckets import extract_synergy_frames

def load_cards(path="sample_input.json"):
    with open(path, "r") as f:
        return json.load(f)

def main():
    input_data = load_cards()
    cards = input_data["cards"]

    result = extract_synergy_frames(cards)
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()