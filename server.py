import http.server
import socketserver
import os
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

        # API 2: AI Explain & Recommend (LLM Integration with Cache & Fallback)
        if parsed.path == '/api/ai_recommend':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            try:
                payload = json.loads(body)
                # Compute deterministic hash for (date + input_context)
                raw_hash_str = json.dumps(payload, sort_keys=True)
                cache_key = hashlib.sha256(raw_hash_str.encode('utf-8')).hexdigest()

                if cache_key in AI_CACHE:
                    cached_resp = AI_CACHE[cache_key].copy()
                    cached_resp["from_cache"] = True
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps(cached_resp, ensure_ascii=False).encode('utf-8'))
                    return

                # Read API key from environment variable
                gemini_api_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')

                llm_result = None

                # Call Gemini API if key is present
                if gemini_api_key:
                    try:
                        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_api_key}"
                        system_prompt = (
                            "Bạn là AI Cố Vấn Chuỗi Cung Ứng Cao Cấp (Supply Chain AI Advisor) cho SenNova Home. "
                            "Nhiệm vụ của bạn là phân tích ngữ cảnh kho nhận và kho xuất, đánh giá 3 phương án A (Mua RFQ), B (Chuyển kho) và C (Kết hợp chuyển dư + mua phần còn lại). "
                            "YÊU CẦU BẮT BUỘC: Đầu ra chỉ là duy nhất một JSON object với schema: "
                            '{"recommended_option": "A" | "B" | "C", "reason": "giải thích kinh tế sắc bén dưới 80 từ", "risk_flags": ["danh sách cờ rủi ro ngắn"]}. '
                            "KHÔNG được tự bịa con số. Chỉ được chọn trong 3 phương án A, B hoặc C và dùng đúng các con số chi phí đã tính sẵn."
                        )
                        req_data = {
                            "contents": [{
                                "parts": [
                                    {"text": system_prompt + "\n\nNgữ cảnh dữ liệu tính toán:\n" + json.dumps(payload, ensure_ascii=False)}
                                ]
                            }],
                            "generationConfig": {
                                "temperature": 0.0,
                                "response_mime_type": "application/json"
                            }
                        }
                        req = urllib.request.Request(url, data=json.dumps(req_data).encode('utf-8'), headers={'Content-Type': 'application/json'})
                        with urllib.request.urlopen(req, timeout=10) as resp:
                            res_json = json.loads(resp.read().decode('utf-8'))
                            text_out = res_json['candidates'][0]['content']['parts'][0]['text']
                            llm_result = json.loads(text_out)
                    except Exception as err:
                        print("Gemini API call failed, falling back to math engine:", err)

                # Fallback to Math Cost Engine if no LLM key or call failed
                if not llm_result or "recommended_option" not in llm_result:
                    # Pick option with lowest total cost
                    plans = payload.get("options", {})
                    best_opt = "A"
                    lowest_cost = float('inf')
                    for opt_id, opt_data in plans.items():
                        c = opt_data.get("total_cost", float('inf'))
                        if c < lowest_cost:
                            lowest_cost = c
                            best_opt = opt_id
                    
                    # Generate deterministic expert reason based on the chosen plan
                    chosen_plan = plans.get(best_opt, {})
                    c_stockout = chosen_plan.get("c_stockout", 0)
                    time_days = chosen_plan.get("time_days", 1)
                    
                    if best_opt == "A":
                        reason = f"Phương án A (Mua RFQ) tối ưu tổng chi phí do không làm phát sinh chi phí bù mua lại tại kho nguồn và các kho khác không đủ hàng dư an toàn."
                    elif best_opt == "B":
                        reason = f"Phương án B (Chuyển kho) có thời gian về nhanh ({time_days} ngày), triệt tiêu hoàn toàn rủi ro thiếu hàng C_stockout."
                    else:
                        reason = f"Phương án C (Kết hợp) tận dụng triệt để lượng tồn dư của kho nguồn (chi phí mua lại = 0), đồng thời mua bổ sung phần còn thiếu qua RFQ."

                    risks = []
                    if c_stockout > 0:
                        risks.append(f"Cảnh báo thiếu hàng trong {time_days} ngày chờ giao")
                    if chosen_plan.get("resupply_cost", 0) > 0:
                        risks.append("Kho nguồn phải mua bù lại phần tồn trích xuất dưới Qmax")

                    llm_result = {
                        "recommended_option": best_opt,
                        "reason": reason,
                        "risk_flags": risks,
                        "fallback_used": True
                    }

                # Save to cache
                AI_CACHE[cache_key] = llm_result

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(llm_result, ensure_ascii=False).encode('utf-8'))
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
