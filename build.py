# -*- coding: utf-8 -*-
"""
SenNova Home IMS Build Script
Assembles modular files in src/ into dist/sennova_ims.html
"""
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(ROOT_DIR, 'src')
DIST_DIR = os.path.join(ROOT_DIR, 'dist')

JS_MODULES = [
    'src/js/config.js',
    'src/js/rng.js',
    'src/js/forecast.js',
    'src/js/transfers.js',
    'src/js/rfq.js',
    'src/js/notifications.js',
    'src/js/simulation.js',
    'src/js/proposals.js',
    'src/js/ui/table.js',
    'src/js/ui/modals.js',
    'src/js/views/dashboard.js',
    'src/js/views/inventory.js',
    'src/js/views/transfers.js',
    'src/js/views/rfq.js',
    'src/js/views/quick.js',
    'src/js/views/params.js',
    'src/js/views/analytics.js',
    'src/js/main.js',
]

def build():
    # 1. Read template
    template_path = os.path.join(SRC_DIR, 'index.template.html')
    with open(template_path, 'r', encoding='utf-8') as f:
        html = f.read()

    # 2. Read styles
    styles_path = os.path.join(SRC_DIR, 'styles.css')
    with open(styles_path, 'r', encoding='utf-8') as f:
        styles = f.read()

    # 3. Read and concatenate all JS modules
    js_parts = []
    for mod_rel in JS_MODULES:
        mod_path = os.path.join(ROOT_DIR, mod_rel)
        if not os.path.exists(mod_path):
            raise FileNotFoundError(f"Missing JS module: {mod_path}")
        with open(mod_path, 'r', encoding='utf-8') as f:
            content = f.read()
            js_parts.append(f"// --- BEGIN {mod_rel} ---\n{content}\n// --- END {mod_rel} ---\n")

    all_js = "\n".join(js_parts)

    # 4. Inject styles and scripts
    if '/* <!-- STYLES --> */' in html:
        html = html.replace('/* <!-- STYLES --> */', styles)
    else:
        html = html.replace('</style>', f"{styles}\n  </style>")

    if '/* <!-- SCRIPTS --> */' in html:
        html = html.replace('/* <!-- SCRIPTS --> */', all_js)
    else:
        html = html.replace('</script>', f"{all_js}\n  </script>")

    # 5. Write to dist/sennova_ims.html
    os.makedirs(DIST_DIR, exist_ok=True)
    dist_path = os.path.join(DIST_DIR, 'sennova_ims.html')
    with open(dist_path, 'w', encoding='utf-8') as f:
        f.write(html)

    # 6. Also sync sennova_ims_v3.html for user's preview
    v3_path = os.path.join(ROOT_DIR, 'sennova_ims_v3.html')
    with open(v3_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Build SUCCESS!")
    print(f"Generated: {dist_path} ({len(html):,} chars, {os.path.getsize(dist_path):,} bytes)")
    print(f"Updated:   {v3_path}")

if __name__ == '__main__':
    build()
