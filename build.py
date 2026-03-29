#!/usr/bin/env python3
"""Bundle the game into a single self-contained HTML file.

Usage: python3 build.py [output.html]
Default output: cladogame-bundle.html
"""
import base64
import os
import re
import sys


def to_data_uri(path, mime='image/png'):
    with open(path, 'rb') as f:
        return f'data:{mime};base64,{base64.b64encode(f.read()).decode()}'


def replace_image_ref(match):
    name = match.group(1)
    path = f'images/{name}' if '.' in name else f'images/{name}.png'
    if os.path.exists(path):
        return f'"{to_data_uri(path)}"'
    print(f'Warning: missing image {path}', file=sys.stderr)
    return match.group(0)


os.chdir(os.path.dirname(os.path.abspath(__file__)))

html     = open('cladogame.html').read()
css      = open('cladogame.css').read()
phy_js   = open('phylogeny.js').read()
logic_js = open('cladogame-logic.js').read()
ui_js    = open('cladogame-ui.js').read()

# Inline images: replace image: "name" values with data URIs
phy_js = re.sub(r'(?<=image: )"([^"]+)"', replace_image_ref, phy_js)

out = html

# Remove Google Fonts (offline build — fonts degrade gracefully)
out = re.sub(r'<link[^>]+preconnect[^>]*>\n?', '', out)
out = re.sub(r'<link[^>]+fonts\.googleapis\.com[^>]*>\n?', '', out)

# Inline CSS
out = re.sub(
    r'<link[^>]+cladogame\.css[^>]*>',
    f'<style>\n{css}</style>',
    out
)

# Inline favicon
if os.path.exists('favicon.png'):
    out = out.replace(
        'href="favicon.png"',
        f'href="{to_data_uri("favicon.png")}"'
    )

# Inline JS files
out = out.replace('<script src="phylogeny.js"></script>',
                  f'<script>\n{phy_js}</script>')
out = out.replace('<script src="cladogame-logic.js"></script>',
                  f'<script>\n{logic_js}</script>')
out = out.replace('<script src="cladogame-ui.js"></script>',
                  f'<script>\n{ui_js}</script>')

dest = sys.argv[1] if len(sys.argv) > 1 else 'cladogame-bundle.html'
with open(dest, 'w') as f:
    f.write(out)

size_kb = os.path.getsize(dest) // 1024
print(f'Built {dest} ({size_kb} KB)')
