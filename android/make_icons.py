"""Generates the FieldLedger launcher icons (legacy + adaptive layers) with Pillow."""
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
    """White ledger book with a green sprout, drawn on transparency, centred."""
    g = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    c = size / 2; u = size / 100 * scale
    # shadow
    sh = Image.new('RGBA', (size, size), (0, 0, 0, 0)); sd = ImageDraw.Draw(sh)
    sd.rounded_rectangle([c - 30*u, c - 18*u + 4*u, c + 30*u, c + 30*u + 4*u], radius=6*u, fill=(40, 20, 80, 110))
    g = Image.alpha_composite(g, sh.filter(ImageFilter.GaussianBlur(3*u))); d = ImageDraw.Draw(g)
    # book
    d.rounded_rectangle([c - 30*u, c - 18*u, c + 30*u, c + 30*u], radius=6*u, fill=(255, 255, 255, 255))
    d.rectangle([c - 1.2*u, c - 18*u, c + 1.2*u, c + 30*u], fill=(214, 204, 240, 255))
    for i in range(4):
        y = c - 8*u + i * 9*u
        d.rounded_rectangle([c - 24*u, y, c - 7*u, y + 2.6*u], radius=1.3*u, fill=(160, 140, 220, 255))
        d.rounded_rectangle([c + 7*u, y, c + 24*u, y + 2.6*u], radius=1.3*u, fill=(232, 180, 70, 255))
    # sprout
    d.line([c, c - 18*u, c, c - 30*u], fill=(70, 150, 60, 255), width=int(3*u))
    d.ellipse([c - 16*u, c - 38*u, c - 1*u, c - 28*u], fill=(110, 190, 80, 255))
    d.ellipse([c + 1*u, c - 42*u, c + 17*u, c - 31*u], fill=(90, 175, 70, 255))
    return g

def rounded(img, radius_frac=0.22):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=int(img.size[0] * radius_frac), fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0)); out.paste(img, (0, 0), m); return out

legacy = rounded(Image.alpha_composite(gradient(S).convert('RGBA'), glyph(S, 1.05)))
bg = gradient(S)
fg = glyph(S, 0.72)  # inside the adaptive-icon safe zone
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
