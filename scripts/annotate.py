#!/usr/bin/env python3
"""annotate.py — bake numbered CGG callouts onto game screenshots.
Adds an editorial legend strip beneath the image and numbered red markers
on the image, mapping each element to the algorithm that draws it.
Output: docs/shots/interrogation_algorithms.png and _lighting.png
"""
from PIL import Image, ImageDraw, ImageFont

RED = (218, 62, 40)
INK = (26, 25, 23)
BG = (243, 242, 239)
GRAY = (110, 106, 99)
WHITE = (255, 255, 255)
FB = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FR = "/System/Library/Fonts/Supplemental/Arial.ttf"


def annotate(src, out, markers, legend, title):
    img = Image.open(src).convert("RGB")
    W, Hh = img.size
    strip = 46 + 34 * len(legend) + 20
    canvas = Image.new("RGB", (W, Hh + strip), BG)
    canvas.paste(img, (0, 0))
    d = ImageDraw.Draw(canvas)
    num_f = ImageFont.truetype(FB, 26)
    title_f = ImageFont.truetype(FB, 24)
    key_f = ImageFont.truetype(FB, 22)
    body_f = ImageFont.truetype(FR, 22)

    # markers on the image
    for i, (x, y) in enumerate(markers, 1):
        r = 20
        d.ellipse([x - r, y - r, x + r, y + r], fill=RED, outline=WHITE, width=3)
        tw = d.textlength(str(i), font=num_f)
        d.text((x - tw / 2, y - 15), str(i), font=num_f, fill=WHITE)

    # legend strip
    ly = Hh + 16
    d.text((36, ly), title, font=title_f, fill=INK)
    ly += 44
    for i, (key, desc) in enumerate(legend, 1):
        r = 15
        cx, cy = 48, ly + 12
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RED)
        tw = d.textlength(str(i), font=ImageFont.truetype(FB, 20))
        d.text((cx - tw / 2, cy - 13), str(i), font=ImageFont.truetype(FB, 20), fill=WHITE)
        d.text((80, ly), key, font=key_f, fill=RED)
        kw = d.textlength(key + "   ", font=key_f)
        d.text((80 + kw, ly + 1), desc, font=body_f, fill=INK)
        ly += 34
    canvas.save(out)
    print("wrote", out, canvas.size)


# ---- Image A: scan-conversion / primitive algorithms ----
annotate(
    "docs/shots/interrogation.png",
    "docs/shots/interrogation_algorithms.png",
    [(158, 214), (384, 372), (655, 300), (640, 520), (1000, 300)],
    [
        ("Bresenham line", "window mullions & rain streaks (drawLine, integer decision)"),
        ("Midpoint ellipse", "lamp shade & character heads (fillEllipse)"),
        ("Sprite blit", "the suspect: 26×32 palette sprite (blitSprite)"),
        ("Rectangle scan-fill", "walls, desk, frames, papers (fillRect)"),
        ("Bayer 4×4 dithering", "bookshelf & wall gradients (fillDithered)"),
    ],
    "Scan-conversion algorithms — where each one draws",
)

# ---- Image B: lighting, particles & atmosphere ----
annotate(
    "docs/shots/interrogation.png",
    "docs/shots/interrogation_lighting.png",
    [(384, 430), (520, 250), (120, 150), (300, 452), (1090, 40)],
    [
        ("Radial additive light", "warm lamp pool, (1 − d/R)² falloff (applyLighting)"),
        ("Particles + alpha", "dust motes drifting in the beam (source-over blend)"),
        ("Clipped-line particles", "rain streaks (Cohen–Sutherland + drawLine)"),
        ("Ember + smoke", "the detective's cigarette (light + rising particles)"),
        ("Vignette", "frame edges darkened toward the corners (applyVignette)"),
    ],
    "Light & atmosphere — built from first principles",
)
