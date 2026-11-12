from PIL import Image
import os

images = [
    ("public/images/background.png", "public/images/background.webp", 1920, 82),
    ("public/images/background.png", "public/images/background.jpg", 1920, 82),
    ("public/images/saint-mark-login.png", "public/images/saint-mark-login.webp", 1920, 82),
    ("public/images/saint-mark-login.png", "public/images/saint-mark-login-mobile.webp", 960, 80),
]

for src, dst, max_w, quality in images:
    if not os.path.exists(src):
        print(f"Skipping {src}: not found")
        continue
    img = Image.open(src)
    orig_size = os.path.getsize(src)
    w, h = img.size
    if w > max_w:
        new_h = int(h * (max_w / w))
        img = img.resize((max_w, new_h), Image.Resampling.LANCZOS)
    if dst.endswith(".jpg") and img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    img.save(dst, quality=quality, optimize=True)
    new_size = os.path.getsize(dst)
    reduction = (1 - new_size / orig_size) * 100
    print(f"{src} ({orig_size/1024:.1f} KB) -> {dst} ({new_size/1024:.1f} KB) [{reduction:.1f}% reduction]")

