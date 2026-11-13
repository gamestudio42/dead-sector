"""Contact sheet of baked character sheets for review: each sheet on a street-grey background.

    python3 tools/sprites/preview.py OUT.png [KEY ...] [--scale 2] [--game]

--game also adds a row at the size the default camera shows them (one frame = 2 cells at zoom 1.7).
"""

import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SPRITES = os.path.join(ROOT, "apps/web/public/sprites")

args = sys.argv[1:]
out = args.pop(0)
scale = 2
if "--scale" in args:
    i = args.index("--scale")
    scale = float(args[i + 1])
    del args[i : i + 2]
game = "--game" in args
args = [a for a in args if a != "--game"]
manifest = json.load(open(os.path.join(SPRITES, "manifest.json")))
keys = args or list(manifest["sheets"])
size = manifest["frameSize"]
frames = manifest["frames"]
fw = int(size * scale)
game_px = round(2 * 16 * 1.7)
row_h = fw + (game_px + 8 if game else 0) + 6
sheet = Image.new("RGB", (fw * frames, row_h * len(keys)), (42, 44, 48))
draw = ImageDraw.Draw(sheet)
for r, key in enumerate(keys):
    img = Image.open(os.path.join(SPRITES, f"{key}.png")).convert("RGBA")
    big = img.resize((fw * frames, fw), Image.LANCZOS)
    sheet.paste(big, (0, r * row_h), big)
    if game:
        small = img.resize((game_px * frames, game_px), Image.LANCZOS)
        for f in range(frames):
            tile = small.crop((f * game_px, 0, (f + 1) * game_px, game_px))
            sheet.paste(tile, (f * fw, r * row_h + fw + 4), tile)
    draw.text((4, r * row_h + 2), key, fill=(200, 200, 200))
sheet.save(out)
print(out, sheet.size)
