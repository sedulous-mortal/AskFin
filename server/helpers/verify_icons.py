"""Spot-check: confirm real sprites differ from the placeholder."""
from PIL import Image
import os

DIR = r"C:\Users\ansob\claude-tests\AskFin\client\public\items"
unk = Image.open(os.path.join(DIR, "_unknown.png")).tobytes()

real_checks   = ["Rosehip_Juice", "Carrot", "Strawberry", "Mithril_Bar", "Cheese", "Honey"]
placeholder_checks = ["Atlantic_Salmon", "Fence", "Wood_Plank_Flooring", "Milker", "Cake"]

print("Real sprites (should NOT match unknown):")
for name in real_checks:
    path = os.path.join(DIR, name + ".png")
    data = Image.open(path).tobytes()
    match = data == unk
    print(f"  {'PROBLEM' if match else 'OK':7} {name}.png")

print("\nPlaceholders (should ALL match unknown):")
for name in placeholder_checks:
    path = os.path.join(DIR, name + ".png")
    data = Image.open(path).tobytes()
    match = data == unk
    print(f"  {'OK' if match else 'PROBLEM':7} {name}.png")
