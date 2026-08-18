#!/usr/bin/env python3
"""Generate professional BecomeAI favicon from canvas-based rendering."""

import struct
import zlib
import os

def create_png(width, height, rgba_data):
    """Create a minimal PNG file from RGBA data."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + c + crc

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)

    raw = b""
    for y in range(height):
        raw += b"\x00"  # filter: none
        raw += rgba_data[y * width * 4 : (y + 1) * width * 4]

    compressed = zlib.compress(raw, 9)

    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")


def draw_rounded_rect(rgba, w, h, x1, y1, x2, y2, r, g, b, a=255, radius=0):
    """Draw a rounded rectangle with antialiasing."""
    for y in range(max(0, y1), min(h, y2)):
        for x in range(max(0, x1), min(w, x2)):
            # Simple rounded rect with corner radius
            if radius > 0:
                # Check corners
                corners = [
                    (x1 + radius, y1 + radius),
                    (x2 - radius, y1 + radius),
                    (x1 + radius, y2 - radius),
                    (x2 - radius, y2 - radius),
                ]
                in_corner = False
                for cx, cy in corners:
                    dx = abs(x - cx)
                    dy = abs(y - cy)
                    if dx > radius or dy > radius:
                        continue
                    if dx * dx + dy * dy > radius * radius:
                        in_corner = True
                        dist = (dx * dx + dy * dy) ** 0.5
                        alpha = max(0, min(255, int(255 * (radius - dist + 0.5))))
                        if alpha > 0:
                            idx = (y * w + x) * 4
                            blend = alpha / 255
                            rgba[idx] = int(r * blend + rgba[idx] * (1 - blend))
                            rgba[idx + 1] = int(g * blend + rgba[idx + 1] * (1 - blend))
                            rgba[idx + 2] = int(b * blend + rgba[idx + 2] * (1 - blend))
                            rgba[idx + 3] = min(255, rgba[idx + 3] + alpha)
                        continue
                    in_corner = False
                if not in_corner:
                    idx = (y * w + x) * 4
                    rgba[idx] = r
                    rgba[idx + 1] = g
                    rgba[idx + 2] = b
                    rgba[idx + 3] = a
            else:
                idx = (y * w + x) * 4
                rgba[idx] = r
                rgba[idx + 1] = g
                rgba[idx + 2] = b
                rgba[idx + 3] = a


def generate_icon(size):
    """Generate a BecomeAI icon at given size."""
    rgba = bytearray(size * size * 4)

    # Background: gradient from violet to indigo
    for y in range(size):
        for x in range(size):
            idx = (y * size + x) * 4
            t = (x + y) / (2 * size)
            # Violet #7c3aed -> Indigo #4f46e5
            r = int(124 * (1 - t) + 79 * t)
            g = int(58 * (1 - t) + 70 * t)
            b = int(237 * (1 - t) + 229 * t)
            rgba[idx] = r
            rgba[idx + 1] = g
            rgba[idx + 2] = b
            rgba[idx + 3] = 255

    # Draw a lightning bolt / Z icon in white (centered)
    cx, cy = size // 2, size // 2
    s = size / 64  # scale factor

    # Simple "Z" shape or lightning bolt
    points_z = [
        # Top horizontal
        (int(cx - 14*s), int(cy - 16*s), int(cx + 14*s), int(cy - 10*s)),
        # Diagonal
        (int(cx + 6*s), int(cy - 10*s), int(cx - 6*s), int(cy + 10*s)),
        # Bottom horizontal
        (int(cx - 14*s), int(cy + 10*s), int(cx + 14*s), int(cy + 16*s)),
    ]

    # Draw thick lines for the Z
    thickness = max(2, int(3 * s))

    for x1, y1, x2, y2 in points_z:
        steps = max(abs(x2 - x1), abs(y2 - y1))
        if steps == 0:
            continue
        for i in range(steps + 1):
            t = i / steps
            px = int(x1 + (x2 - x1) * t)
            py = int(y1 + (y2 - y1) * t)
            for dy in range(-thickness, thickness + 1):
                for dx in range(-thickness, thickness + 1):
                    nx, ny = px + dx, py + dy
                    if 0 <= nx < size and 0 <= ny < size:
                        idx = (ny * size + nx) * 4
                        rgba[idx] = 255
                        rgba[idx + 1] = 255
                        rgba[idx + 2] = 255
                        rgba[idx + 3] = 255

    return bytes(rgba)


def main():
    sizes = [16, 32, 48, 64, 128, 192, 256, 512]
    output_dir = os.path.dirname(os.path.abspath(__file__))

    for size in sizes:
        rgba = generate_icon(size)
        png_data = create_png(size, size, rgba)
        filename = f"favicon-{size}.png"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "wb") as f:
            f.write(png_data)
        print(f"Generated {filename} ({len(png_data)} bytes)")

    # Also create favicon.ico (just use 32x32)
    ico_path = os.path.join(output_dir, "favicon.ico")
    rgba32 = generate_icon(32)
    png32 = create_png(32, 32, rgba32)

    # ICO format
    ico_header = struct.pack("<HHH", 0, 1, 1)  # reserved, type=icon, count=1
    ico_entry = struct.pack("<BBBBHHII", 32, 32, 0, 0, 1, 32, len(png32), 22)
    with open(ico_path, "wb") as f:
        f.write(ico_header + ico_entry + png32)
    print(f"Generated favicon.ico ({os.path.getsize(ico_path)} bytes)")

    # Copy main favicon
    import shutil
    main_favicon = os.path.join(output_dir, "favicon.ico")
    target = os.path.join(output_dir, "favicon.ico")
    print(f"\nDone! favicon.ico ready at {ico_path}")


if __name__ == "__main__":
    main()
