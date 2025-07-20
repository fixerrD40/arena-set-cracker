import json
from deck_builder.synergy_buckets import group_by_synergy

def load_cards(path="sample_input.json"):
    with open(path, "r") as f:
        return json.load(f)

def main():
    input_data = load_cards()
    cards = input_data["cards"]

    buckets = group_by_synergy(cards)

    print(f"\nFound {len(buckets)} synergy buckets:\n")
    for bucket_name, grouped_cards in buckets.items():
        print(f"  {bucket_name}: {len(grouped_cards)} cards")

if __name__ == "__main__":
    main()