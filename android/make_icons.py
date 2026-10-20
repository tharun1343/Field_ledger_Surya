"""Generates the FieldLedger launcher icons (legacy + adaptive layers) with Pillow: a brinjal and a muskmelon."""
import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, 'res')
S = 1024  # master size

def gradient(size):
    img = Image.new('RGB', (size, size))
    a, b = (124, 82, 230), (232, 170, 40)  # violet (brinjal) -> amber (muskmelon)
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return img

def glyph(size, scale=1.0):
    """A plump brinjal in front of a netted muskmelon with an orange slice, centred on transparency."""
    S4 = size * 4  # draw large, then downsample for smooth edges
    g = Image.new('RGBA', (S4, S4), (0, 0, 0, 0))
    u = S4 / 100 * scale; c = S4 / 2
    def shadow(box, r=None):
        sh = Image.new('RGBA', (S4, S4), (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse(box, fill=(30, 15, 60, 120))
        return sh.filter(ImageFilter.GaussianBlur(3 * u))
    # --- muskmelon (back, right)
    mx, my, mr = c + 13 * u, c - 4 * u, 25 * u
    g = Image.alpha_composite(g, shadow([mx - mr, my - mr + 6 * u, mx + mr, my + mr + 6 * u]))
    d = ImageDraw.Draw(g)
    d.ellipse([mx - mr, my - mr, mx + mr, my + mr], fill=(228, 200, 120, 255), outline=(150, 118, 44, 255), width=int(1.6 * u))
    # netting: crossing diagonal lines, clipped to the melon
    net = Image.new('RGBA', (S4, S4), (0, 0, 0, 0)); nd = ImageDraw.Draw(net)
    step = 7 * u
    for k in range(-12, 13):
        o = k * step
        nd.line([mx - mr + o, my - mr, mx + mr + o, my + mr], fill=(252, 240, 205, 230), width=int(1.3 * u))
        nd.line([mx + mr + o, my - mr, mx - mr + o, my + mr], fill=(252, 240, 205, 230), width=int(1.3 * u))
    mask = Image.new('L', (S4, S4), 0); ImageDraw.Draw(mask).ellipse([mx - mr + 2 * u, my - mr + 2 * u, mx + mr - 2 * u, my + mr - 2 * u], fill=255)
    g.paste(net, (0, 0), Image.composite(net.split()[3], Image.new('L', (S4, S4), 0), mask))
    d = ImageDraw.Draw(g)
    # orange slice wedge
    d.pieslice([mx - mr, my - mr, mx + mr, my + mr], -40, 35, fill=(247, 145, 59, 255), outline=(190, 98, 27, 255), width=int(1.4 * u))
    d.pieslice([mx - mr * 0.8, my - mr * 0.8, mx + mr * 0.8, my + mr * 0.8], -36, 31, fill=(255, 178, 102, 255))
    for a, rr in [(-20, .55), (-5, .45), (12, .6)]:
        import math
        x = mx + math.cos(math.radians(a)) * mr * rr; y = my + math.sin(math.radians(a)) * mr * rr
        d.ellipse([x - 1.2 * u, y - 1.2 * u, x + 1.2 * u, y + 1.2 * u], fill=(255, 243, 214, 255))
    # --- brinjal (front, left): plump body
    bx, by = c - 12 * u, c + 8 * u
    g = Image.alpha_composite(g, shadow([bx - 20 * u, by - 18 * u + 7 * u, bx + 20 * u, by + 24 * u + 7 * u]))
    d = ImageDraw.Draw(g)
    d.ellipse([bx - 20 * u, by - 18 * u, bx + 20 * u, by + 24 * u], fill=(122, 63, 200, 255))
    d.ellipse([bx - 14 * u, by - 13 * u, bx + 6 * u, by + 10 * u], fill=(150, 95, 222, 255))
    d.ellipse([bx - 12 * u, by - 9 * u, bx - 5 * u, by + 2 * u], fill=(214, 186, 255, 220))
    # calyx + stem
    d.polygon([(bx - 15 * u, by - 14 * u), (bx - 6 * u, by - 22 * u), (bx, by - 17 * u), (bx + 6 * u, by - 22 * u), (bx + 15 * u, by - 14 * u), (bx + 4 * u, by - 10 * u), (bx - 4 * u, by - 10 * u)], fill=(95, 158, 60, 255))
    d.line([bx, by - 20 * u, bx + 3 * u, by - 31 * u], fill=(76, 128, 48, 255), width=int(4 * u))
    return g.resize((size, size), Image.LANCZOS)

def rounded(img, radius_frac=0.22):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=int(img.size[0] * radius_frac), fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0)); out.paste(img, (0, 0), m); return out

legacy = rounded(Image.alpha_composite(gradient(S).convert('RGBA'), glyph(S, 1.0)))
bg = gradient(S)
fg = glyph(S, 0.66)  # inside the adaptive-icon safe zone
for q, px, apx in [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]:
    d = os.path.join(RES, 'mipmap-' + q); os.makedirs(d, exist_ok=True)
    legacy.resize((px, px), Image.LANCZOS).save(os.path.join(d, 'ic_launcher.png'), optimize=True)
    bg.resize((apx, apx), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_bg.png'), optimize=True)
    fg.resize((apx, apx), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_fg.png'), optimize=True)
os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
with open(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'w') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
            '    <background android:drawable="@mipmap/ic_launcher_bg" />\n    <foreground android:drawable="@mipmap/ic_launcher_fg" />\n</adaptive-icon>\n')
legacy.resize((512, 512), Image.LANCZOS).save(os.path.join(HERE, 'icon-512.png'))
print('icons written')
