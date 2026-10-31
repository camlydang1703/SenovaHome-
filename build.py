# -*- coding: utf-8 -*-
"""
SenNova Home IMS Build Script
Assembles modular files in src/ into dist/sennova_ims.html
Loads CSV files from data/ directly to guarantee 100% single source of truth.
"""
import sys
import os
import csv
import json

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR = os.path.join(ROOT_DIR, 'src')
DATA_DIR = os.path.join(ROOT_DIR, 'data')
DIST_DIR = os.path.join(ROOT_DIR, 'dist')

JS_MODULES = [
    'src/js/csv_data.js',
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

def compile_csv_database():
    """Reads all authoritative CSVs from data/ and generates src/js/csv_data.js"""
    # 1. inventory_opening.csv
    inv_opening = []
    inv_path = os.path.join(DATA_DIR, 'inventory_opening.csv')
    if os.path.exists(inv_path):
        with open(inv_path, 'r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                inv_opening.append({
                    'sku': r['sku'],
                    'wh': r['warehouse_code'],
                    'on_hand': int(r['on_hand']),
                    'in_transit': int(r.get('in_transit', 0)),
                    'committed': int(r.get('committed_so', 0))
                })

    # 2. seasonal_parameters.csv
    seasonal = {}
    season_path = os.path.join(DATA_DIR, 'seasonal_parameters.csv')
    if os.path.exists(season_path):
        with open(season_path, 'r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                seasonal[int(r['month'])] = float(r['seasonal_index'])

    # 3. routes.csv
    routes = []
    routes_path = os.path.join(DATA_DIR, 'routes.csv')
    if os.path.exists(routes_path):
        with open(routes_path, 'r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                routes.append({
                    'from': r['from_wh'],
                    'to': r['to_wh'],
                    'lead': int(r['lead_days']),
                    'rate': int(r['freight_rate_base']),
                    'unit': int(r.get('unit_rate_base', 25000)),
                    'note': r.get('note', '')
                })

    js_code = f"""// AUTO-GENERATED FROM data/*.csv BY build.py — NGUỒN SỰ THẬT DUY NHẤT
const CSV_DATABASE = {{
  inventory_opening: {json.dumps(inv_opening, ensure_ascii=False)},
  seasonal_parameters: {json.dumps(seasonal, ensure_ascii=False)},
  routes: {json.dumps(routes, ensure_ascii=False)}
}};
"""
    csv_js_path = os.path.join(SRC_DIR, 'js', 'csv_data.js')
    with open(csv_js_path, 'w', encoding='utf-8') as f:
        f.write(js_code)
    print(f"Compiled CSV Database from data/ ({len(inv_opening)} opening records, {len(seasonal)} seasonal indices)")

def build():
    # 0. Compile CSVs into JS
    compile_csv_database()

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
