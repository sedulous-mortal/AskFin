from PIL import Image
import os
DIR = r"C:\Users\ansob\claude-tests\AskFin\client\public\items"
sizes = {}
for f in os.listdir(DIR)[:20]:
    if f.endswith(".png"):
        img = Image.open(os.path.join(DIR, f))
        s = img.size
        sizes[s] = sizes.get(s, 0) + 1
print(sizes)
