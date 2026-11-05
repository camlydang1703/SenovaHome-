import http.server
import socketserver
import os
import csv
import json
import urllib.parse
import urllib.request
import hashlib

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(DIRECTORY, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

# Cache in-memory for LLM responses: hash_key -> json_dict
AI_CACHE = {}

_dotenv_cache = None


def load_dotenv():
    """Nạp .env (gitignored) vào env vars. Trả về dict đã đọc (có thể rỗng)."""
    global _dotenv_cache
    if _dotenv_cache is not None:
        return _dotenv_cache
    _dotenv_cache = {}
    path = os.path.join(DIRECTORY, '.env')
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith('#') or '=' not in line:
                        continue
                    k, v = line.split('=', 1)
                    k, v = k.strip(), v.strip().strip('"').strip("'")
                    _dotenv_cache[k] = v
                    os.environ.setdefault(k, v)
        except Exception as err:
            print('.env read failed:', err)
    return _dotenv_cache


def gemini_api_key():
    load_dotenv()
    return os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY') or ''


def gemini_model():
    load_dotenv()
    # Override bằng GEMINI_MODEL trong biến môi trường hoặc file .env
    return os.environ.get('GEMINI_MODEL') or 'gemini-2.5-flash'



# ---------------------------------------------------------------------------
# P6: AI "hệ số cầu" (aiCoef) — key nằm ở server, mô hình chỉ diễn giải và
# dịch số trong ±nudge quanh hệ số sàn tất định; ngoài khoảng đó bị kéo về sàn.
# ---------------------------------------------------------------------------
def clamp_coef(v, floor, lo, hi):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return floor
    if n <= 0:
        return floor
    return round(min(hi, max(lo, n)), 2)


def coef_floor(e, lo, hi):
    return clamp_coef(e.get('floorCoef'), 1.0, lo, hi)


def evidence_text(e):
    """Mot cau ngan — phai khop het offlineReason() trong src/js/aicoef.js de backend va frontend cung chu."""
    coef = float(e.get('floorCoef') or 1.0)
    coefTxt = (u"nâng cầu lên" if coef > 1 else u"giữ cầu") + u" ×%.2f" % coef
    top = e.get('topWave') or u''
    if top:
        more = int(e.get('waveCount') or 1)
        tail = u" và %d sự kiện khác" % (more - 1) if more > 1 else u""
        return [u"%s%s sẽ bùng phát sau khi hàng về → %s." % (top, tail, coefTxt)]
    bias = float(e.get('bias') or 1.0)
    dirn = (u"bán nhanh hơn dự báo" if bias >= 1.05
            else u"bán chậm hơn dự báo" if bias <= 0.95 else u"bán đúng như dự báo")
    return [u"Sản phẩm %s, chưa có sự kiện mới trước khi hàng về → %s." % (dirn, coefTxt)]


def ai_coef_deterministic(brief):
    guard = brief.get('guard') or {}
    lo = float(guard.get('min', 0.8))
    hi = float(guard.get('max', 1.5))
    items = []
    for e in brief.get('items') or []:
        floor = coef_floor(e, lo, hi)
        items.append({'sku': e.get('sku'), 'coef': floor, 'reason': u' '.join(evidence_text(e))})
    return {'ok': True, 'provider': 'OFFLINE', 'items': items}


def ai_coef_call_gemini(brief):
    api_key = gemini_api_key()
    if not api_key:
        return None
    guard = brief.get('guard') or {}
    lo = float(guard.get('min', 0.8))
    hi = float(guard.get('max', 1.5))
    nudge = float(guard.get('maxNudge', 0.1))
    prompt = (
        u"Bạn là AI Cố vấn Tồn kho của SenNova Home. Với từng SKU trong payload: "
        u"(1) chọn hệ số cầu aiCoef nhân vào công thức Min/Max, "
        u"(2) viết 1 câu diễn giải tiếng Việt tối đa 20 từ, tự nhiên như người tư vấn, nêu đúng sự kiện quyết định (tên ngắn + ngày + hệ số); "
        u"KHÔNG dùng thuật ngữ kỹ thuật, KHÔNG liệt kê lại toàn bộ payload, KHÔNG lặp các con số đã có ở cột tín hiệu. "
        u"RÀNG BUỘC: coef phải trong [%.2f, %.2f] và lệch tối đa %.2f so với floorCoef "
        u"(= mức bán lệch 4 tuần qua × phần cầu tăng thêm của các sự kiện sẽ diễn ra SAU ngày hàng về, "
        u"tính theo số ngày sự kiện phủ lên cửa sổ dự báo). "
        u"Lead time NCC đã nằm trong ROP, "
        u"KHÔNG được tính trùng. Không được bịa số liệu ngoài payload. "
        u'Dầu ra duy nhất là JSON: {"items":[{"sku":"...","coef":1.25,"reason":"..."}]}'
    ) % (lo, hi, nudge)
    url = ("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s"
           % (gemini_model(), api_key))
    req_data = {
        "contents": [{"parts": [{"text": prompt + u"\n\nPayload:\n" + json.dumps(brief, ensure_ascii=False)}]}],
        "generationConfig": {"temperature": 0.2, "response_mime_type": "application/json"}
    }
    try:
        req = urllib.request.Request(url, data=json.dumps(req_data).encode('utf-8'),
                                     headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=20) as resp:
            res_json = json.loads(resp.read().decode('utf-8'))
            text = res_json['candidates'][0]['content']['parts'][0]['text']
            parsed = json.loads(text)
            known = {e.get('sku'): e for e in (brief.get('items') or [])}
            out = []
            for it in (parsed.get('items') or []):
                e = known.get(it.get('sku'))
                if not e:
                    continue
                floor = coef_floor(e, lo, hi)
                coef = clamp_coef(it.get('coef'), floor,
                                  round(max(lo, floor - nudge), 2), round(min(hi, floor + nudge), 2))
                reason = str(it.get('reason') or u'').strip()
                out.append({'sku': e.get('sku'), 'coef': coef,
                            'reason': (reason or u' '.join(evidence_text(e)))[:400]})
            if not out:
                return None
            return {'ok': True, 'provider': 'gemini:' + gemini_model(), 'items': out}
    except Exception as err:
        print('Gemini ai_coef call failed:', err)
        return None


class EnterpriseDataHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/get_csv':
            query = urllib.parse.parse_qs(parsed.query)
            filename = query.get('file', [None])[0]
            if not filename or '/' in filename or '\\' in filename:
                self.send_error(400, "Invalid file name")
                return
            filepath = os.path.join(DATA_DIR, filename)
            if not os.path.exists(filepath):
                filepath = os.path.join(DATA_DIR, filename)
            if not os.path.exists(filepath):
                self.send_error(404, "File not found")
                return
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'text/csv; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(content.encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
            return
        
        if parsed.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok", "ledger": "data/ledger.csv",
                "aiCoef": {"model": gemini_model(), "has_key": bool(gemini_api_key()),
                          "endpoint": "/api/ai_coef"}
            }).encode('utf-8'))
            return

        # Giup gan 404 kho hieu thanh loi that: /api/ai_coef chi nhan POST
        if parsed.path == '/api/ai_coef':
            self.send_response(405)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False,
                                         "error": "Method Not Allowed",
                                         "hint": "Goi POST /api/ai_coef (payload: brief he so cau AI)"}).encode('utf-8'))
            return

        # Fallback to standard file serving
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # API 1: Save CSV
        if parsed.path == '/api/save_csv':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            try:
                data = json.loads(body)
                filename = data.get('filename')
                content = data.get('content')
                append = data.get('append', False)
                if not filename or '/' in filename or '\\' in filename or not filename.endswith('.csv'):
                    self.send_error(400, "Invalid CSV file name")
                    return
                filepath = os.path.join(DATA_DIR, filename)
                mode = 'a' if append else 'w'
                with open(filepath, mode, encoding='utf-8') as f:
                    f.write(content)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "file": filename}).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
            return


        # API 1a: P6 — AI kiến nghị hệ số cầu (Gemini, key ở server, có cache + fallback)
        if parsed.path == '/api/ai_coef':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8') if length else '{}'
            try:
                brief = json.loads(body)
            except Exception as e:
                self.send_error(400, 'Invalid JSON: %s' % e)
                return
            cache_key = 'aicoef:' + hashlib.sha256(
                json.dumps({'model': gemini_model(), 'brief': brief}, sort_keys=True).encode('utf-8')).hexdigest()
            result = AI_CACHE.get(cache_key)
            from_cache = result is not None
            if result is None:
                result = ai_coef_call_gemini(brief) or ai_coef_deterministic(brief)
                AI_CACHE[cache_key] = result
            result = dict(result)
            result['from_cache'] = from_cache
            result['has_key'] = bool(gemini_api_key())
            result['model'] = gemini_model()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            return

        # API 1b: Append manager inventory actions to ledger.csv
        if parsed.path == '/api/action':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            try:
                payload = json.loads(body)
                ledger_path = os.path.join(DATA_DIR, 'ledger.csv')
                fields = ['entry_id', 'date', 'doc_type', 'doc_id', 'warehouse_code', 'sku',
                          'delta_on_hand', 'delta_in_transit', 'delta_on_order', 'note']
                write_header = (not os.path.exists(ledger_path)) or os.path.getsize(ledger_path) == 0
                lines = payload.get('lines') or [{
                    'warehouse_code': payload.get('wh') or payload.get('warehouse_code') or '',
                    'sku': payload.get('sku', ''),
                    'delta_on_hand': payload.get('delta_on_hand', 0),
                    'delta_in_transit': payload.get('delta_in_transit', 0),
                    'delta_on_order': payload.get('delta_on_order', 0),
                    'note': payload.get('details') or payload.get('note') or ''
                }]
                base_id = payload.get('entry_id') or payload.get('id') or 'ACT'
                with open(ledger_path, 'a', encoding='utf-8', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
                    if write_header:
                        writer.writeheader()
                    for i, line in enumerate(lines):
                        writer.writerow({
                            'entry_id': line.get('entry_id') or (base_id if i == 0 else f'{base_id}-{i+1}'),
                            'date': payload.get('date', ''),
                            'doc_type': payload.get('doc_type') or payload.get('type') or '',
                            'doc_id': payload.get('doc_id') or payload.get('target') or '',
                            'warehouse_code': line.get('warehouse_code', ''),
                            'sku': line.get('sku', ''),
                            'delta_on_hand': line.get('delta_on_hand', 0),
                            'delta_in_transit': line.get('delta_in_transit', 0),
                            'delta_on_order': line.get('delta_on_order', 0),
                            'note': line.get('note', '')
                        })
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "file": "ledger.csv", "rows": len(lines)}).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
            return


        self.send_error(404, "Unknown API")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    with socketserver.TCPServer(("", PORT), EnterpriseDataHandler) as httpd:
        print(f"SenNova Enterprise Data Server with AI Advisor running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
