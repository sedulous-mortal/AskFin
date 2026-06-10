import shutil, os
OUTPUT_DIR = r"C:\Users\ansob\claude-tests\AskFin\client\public\items"
pairs = [
    ("Milker", "Saw"),
    ("Wooden_Watering_Can", "Saw"),
    ("Shears", "Saw"),
    ("Milk_Bucket", "Milk"),
]
for name, src_name in pairs:
    dest = os.path.join(OUTPUT_DIR, name + ".png")
    source = os.path.join(OUTPUT_DIR, src_name + ".png")
    if not os.path.exists(dest) and os.path.exists(source):
        shutil.copy2(source, dest)
        print(f"Copied {src_name}.png -> {name}.png")
    elif os.path.exists(dest):
        print(f"Already exists: {name}.png")
