import numpy as np
from PIL import Image
from skimage import measure

def trace_paths():
    im = Image.open('public/icons/specialty-coffee.png')
    arr = np.array(im)

    def to_svg_path(contour, tolerance=1.0):
        poly = measure.approximate_polygon(contour, tolerance=tolerance)
        if len(poly) < 3:
            return ""
        d = [f"M {poly[0, 1]:.1f} {poly[0, 0]:.1f}"]
        for pt in poly[1:]:
            d.append(f"L {pt[1]:.1f} {pt[0]:.1f}")
        d.append("Z")
        return " ".join(d)

    # 1. Background colors
    # Brown (lid & sleeve)
    brown_mask = (arr[:, :, 0] > 150) & (arr[:, :, 1] > 90) & (arr[:, :, 2] < 120) & (arr[:, :, 3] > 150)
    # Cup body (light blue)
    cup_mask = (arr[:, :, 0] > 180) & (arr[:, :, 1] > 210) & (arr[:, :, 2] > 230) & (arr[:, :, 3] > 150)
    # Coffee bean
    bean_mask = (arr[:, :, 0] > 80) & (arr[:, :, 0] < 165) & (arr[:, :, 1] > 50) & (arr[:, :, 1] < 120) & (arr[:, :, 2] < 90) & (arr[:, :, 3] > 150)
    # Black lines
    black_mask = (arr[:, :, 0] < 50) & (arr[:, :, 1] < 50) & (arr[:, :, 2] < 50) & (arr[:, :, 3] > 150)

    # Generate full color SVG
    svg_parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="100 0 312 512" width="100%" height="100%">'
    ]

    # Cup body
    for c in measure.find_contours(cup_mask.astype(float), 0.5):
        p = to_svg_path(c, 1.2)
        if p:
            svg_parts.append(f'  <path d="{p}" fill="#ebf7fe" />')

    # Brown lid & sleeve
    for c in measure.find_contours(brown_mask.astype(float), 0.5):
        p = to_svg_path(c, 1.2)
        if p:
            svg_parts.append(f'  <path d="{p}" fill="#c18e5c" />')

    # Coffee bean
    for c in measure.find_contours(bean_mask.astype(float), 0.5):
        p = to_svg_path(c, 1.0)
        if p:
            svg_parts.append(f'  <path d="{p}" fill="#976949" />')

    # Black outlines & steam
    for c in measure.find_contours(black_mask.astype(float), 0.5):
        p = to_svg_path(c, 1.0)
        if p:
            svg_parts.append(f'  <path d="{p}" fill="#111111" />')

    svg_parts.append('</svg>')

    with open('public/icons/specialty-coffee.svg', 'w') as f:
        f.write("\n".join(svg_parts))

    print("Created public/icons/specialty-coffee.svg")

if __name__ == '__main__':
    trace_paths()
