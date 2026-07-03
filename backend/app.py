from flask import Flask, request, jsonify, session
from flask_cors import CORS
import google.generativeai as genai
import requests
import os
import time
import uuid
import tempfile
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
import PyPDF2
import fitz  # PyMuPDF：對中文 (CJK) PDF 的文字擷取比 PyPDF2 更完整
import docx

# 載入 .env 文件中的環境變數
load_dotenv()

app = Flask(__name__)
# 為了使用 session，需要設定一個 secret_key
app.secret_key = os.urandom(24)

# --- 修正 #1: 明確指定 CORS 來源 ---
# 允許來自 React 開發伺服器 (預設為 localhost:3000) 的請求，並支援憑證
CORS(app, origins=["http://localhost:3000"], supports_credentials=True)

# 設定 Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("未設定 GEMINI_API_KEY 環境變數。請在 .env 中設定。")
genai.configure(api_key=GEMINI_API_KEY)

# 列出可用模型 (用於調試，同時建立可供前端選擇的模型清單)
print("可用的 Gemini 模型:")
_all_available_models = []
for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods:
        # genai 回傳的名稱格式為 "models/xxx"，去除前綴方便前端顯示與使用
        model_name = m.name.split('/', 1)[-1]
        _all_available_models.append(model_name)
        print(model_name)

# 前端下拉選單可選用的模型清單。
# 優先採用下方偏好清單中「實際可用」的模型；若都不可用則退回完整清單。
PREFERRED_MODELS = [
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash',
    'gemini-2.5-flash',
]
_gemini_models = [name for name in PREFERRED_MODELS if name in _all_available_models]
if not _gemini_models:
    _gemini_models = _all_available_models

# --- Ollama 本機模型偵測 ---
# 若本機有安裝並執行 Ollama (預設 http://localhost:11434)，將其模型一併納入。
# 為了與 Gemini 模型區分，Ollama 模型在清單中會加上 "ollama:" 前綴。
OLLAMA_BASE = os.getenv("OLLAMA_BASE", "http://localhost:11434")
OLLAMA_PREFIX = "ollama:"

def fetch_ollama_models():
    """向本機 Ollama 查詢已安裝的模型清單。未安裝 / 未執行時回傳空清單。"""
    try:
        resp = requests.get(f"{OLLAMA_BASE}/api/tags", timeout=2)
        resp.raise_for_status()
        models = resp.json().get("models", [])
        return [OLLAMA_PREFIX + m["name"] for m in models if m.get("name")]
    except Exception as e:
        print(f"未偵測到本機 Ollama (或查詢失敗)，略過: {e}")
        return []

_ollama_models = fetch_ollama_models()
if _ollama_models:
    print("偵測到本機 Ollama 模型:")
    for name in _ollama_models:
        print(name)

# 前端下拉選單可選用的完整模型清單 (Gemini + Ollama)。
AVAILABLE_MODELS = _gemini_models + _ollama_models

# 預設模型：優先使用原本的 Gemini 模型，若不可用則採用清單第一個。
DEFAULT_MODEL = 'gemini-3.1-flash-lite'
if DEFAULT_MODEL not in AVAILABLE_MODELS and AVAILABLE_MODELS:
    DEFAULT_MODEL = AVAILABLE_MODELS[0]

system_instruction = "你是一個樂於助人、專業且友善的 AI 助理。請以詳盡且有條理的方式，所有回答一率繁體中文來回答使用者的問題，如有專有名詞請使用中英輔助來回答。"

def is_ollama_model(model_name):
    """判斷模型名稱是否為 Ollama 模型。"""
    return isinstance(model_name, str) and model_name.startswith(OLLAMA_PREFIX)

# 依模型名稱快取 Gemini GenerativeModel 實例，避免重複建立。
_model_cache = {}

def get_gemini_model(model_name):
    """取得 (或建立) 指定名稱的 Gemini GenerativeModel 實例。"""
    if model_name not in _model_cache:
        _model_cache[model_name] = genai.GenerativeModel(
            model_name,
            system_instruction=system_instruction
        )
    return _model_cache[model_name]

def resolve_model_name(model_name):
    """驗證模型名稱，無效時退回預設模型。"""
    if model_name in AVAILABLE_MODELS:
        return model_name
    return DEFAULT_MODEL

# --- 供應商呼叫: 使用「供應商中立」的對話歷史格式 ---
# 歷史格式為 [{"role": "user"|"assistant", "content": str}, ...]

def call_gemini(model_name, history, user_message):
    """以 Gemini 模型產生回應。history 不含本次的 user_message。"""
    gemini_model = get_gemini_model(model_name)
    # 轉換為 Gemini 格式 (assistant -> model, content -> parts)。
    gemini_history = [
        {"role": "model" if turn["role"] == "assistant" else "user",
         "parts": [turn["content"]]}
        for turn in history
    ]
    chat_session = gemini_model.start_chat(history=gemini_history)
    response = chat_session.send_message(user_message)
    try:
        return response.text
    except ValueError:
        if not response.candidates:
            block_reason_name = response.prompt_feedback.block_reason.name if response.prompt_feedback.block_reason else "UNKNOWN"
            print(f"警告: 提示被封鎖，沒有收到候選回應。原因: {block_reason_name}")
            return f"您的請求無法處理，原因：{block_reason_name}。請修改後再試一次。"
        candidate = response.candidates[0]
        finish_reason_name = candidate.finish_reason.name
        print(f"警告: 模型回應沒有文字內容。結束原因: {finish_reason_name}")
        if finish_reason_name == 'SAFETY':
            return "因為安全考量，模型無法提供回應。請嘗試修改您的問題。"
        elif finish_reason_name == 'STOP' and not candidate.content.parts:
            return "我收到了您的訊息，但這次沒有特別的回應。您可以試著問我一些具體的問題嗎？"
        return f"模型沒有生成文字回應，原因為「{finish_reason_name}」。請嘗試不同的問題。"

# Ollama 預設的上下文長度 (num_ctx) 很小 (常為 2048/4096 tokens)，
# 上傳較長文件時，文件內容會因超出上下文而被截斷 (從開頭捨棄)，
# 導致模型「看不到」文件。這裡調高 num_ctx；可用環境變數覆寫。
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "8192"))

def call_ollama(model_name, history, user_message):
    """以 Ollama 模型產生回應。model_name 含 "ollama:" 前綴。"""
    real_name = model_name[len(OLLAMA_PREFIX):]
    messages = [{"role": "system", "content": system_instruction}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})
    resp = requests.post(
        f"{OLLAMA_BASE}/api/chat",
        json={
            "model": real_name,
            "messages": messages,
            "stream": False,
            "options": {"num_ctx": OLLAMA_NUM_CTX},
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json().get("message", {}).get("content", "").strip() or \
        "模型沒有回傳任何內容，請再試一次。"

def generate_response(model_name, history, user_message):
    """依模型所屬供應商路由到對應的呼叫函數。"""
    if is_ollama_model(model_name):
        return call_ollama(model_name, history, user_message)
    return call_gemini(model_name, history, user_message)

# 文件上傳設定
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'docx'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20MB 限制

# 創建上傳資料夾
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# 供應商中立的對話歷史：{ session_id: [{"role": "user"|"assistant", "content": str}, ...] }
# 因為支援 Gemini 與 Ollama 兩種供應商 (甚至中途切換)，改以統一格式保存歷史。
session_histories = {}
# 記錄每個 session 目前使用的模型名稱
session_models = {}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def content_matches_extension(file_path, ext):
    """以檔案開頭的 magic bytes 驗證實際內容是否與副檔名相符，避免僅信任副檔名。
    回傳 True 表示內容看起來與宣稱的類型一致。"""
    try:
        with open(file_path, 'rb') as f:
            sample = f.read(4096)
    except Exception:
        return False

    if ext == 'pdf':
        # PDF 檔案必以 "%PDF" 開頭。
        return sample.startswith(b'%PDF')
    if ext == 'docx':
        # docx 實際上是 zip 封裝，開頭為 zip 的 magic bytes。
        return sample.startswith(b'PK\x03\x04')
    if ext == 'txt':
        # 純文字檔：拒絕含有 NUL 位元組的二進位內容。
        return b'\x00' not in sample
    return False
#讀取文件內容
def extract_text_from_file(file_path, filename):
    text = ""
    file_extension = filename.rsplit('.', 1)[1].lower()
    
    try:
        if file_extension == 'txt':
            with open(file_path, 'r', encoding='utf-8') as file:
                text = file.read()
        
        elif file_extension == 'pdf':
            # 優先使用 PyMuPDF (fitz)，對中文 PDF 的擷取較完整。
            try:
                with fitz.open(file_path) as pdf_doc:
                    for page in pdf_doc:
                        text += page.get_text()
            except Exception as e:
                print(f"PyMuPDF 擷取失敗，改用 PyPDF2: {e}")
                text = ""
            # 若 PyMuPDF 擷取結果為空 (例如掃描檔)，退回 PyPDF2 再試一次。
            if not text.strip():
                with open(file_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    for page in pdf_reader.pages:
                        text += page.extract_text() or ""

        elif file_extension == 'docx':
            doc = docx.Document(file_path)
            for paragraph in doc.paragraphs:
                text += paragraph.text + '\n'
    
    except Exception as e:
        print(f"文件讀取錯誤: {e}")
        return None
    
    return text

@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        file_text = None
        filename_for_prompt = None
        user_message = None
        requested_model = None
        requested_conversation_id = None

        if request.content_type.startswith('multipart/form-data'):
            user_message = request.form.get('message')
            requested_model = request.form.get('model')
            requested_conversation_id = request.form.get('conversation_id')
            if 'file' in request.files and request.files['file'].filename != '':
                file = request.files['file']
                if not allowed_file(file.filename):
                    return jsonify({'error': '不支援的文件格式'}), 400

                # secure_filename 僅用來產生「顯示用」名稱；實際磁碟路徑改用 tempfile
                # 隨機命名，完全不採用使用者提供的檔名作為路徑，杜絕路徑遍歷。
                filename_for_prompt = secure_filename(file.filename) or 'uploaded_file'
                ext = filename_for_prompt.rsplit('.', 1)[-1].lower()

                # 在受控的上傳目錄中建立隨機命名的暫存檔。
                fd, tmp_path = tempfile.mkstemp(suffix=f'.{ext}', dir=app.config['UPLOAD_FOLDER'])
                os.close(fd)
                try:
                    file.save(tmp_path)

                    # 以檔案實際內容 (magic bytes) 驗證類型，而非僅依賴副檔名。
                    if not content_matches_extension(tmp_path, ext):
                        return jsonify({'error': '檔案內容與副檔名不符，或並非有效的文件'}), 400

                    file_text = extract_text_from_file(tmp_path, filename_for_prompt)
                finally:
                    # 無論擷取成功或發生例外，都確保暫存檔被刪除，避免堆積。
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)

                if file_text is None or file_text.strip() == "":
                    print("提取的文件內容為空，無法進行後續處理。")
                    return jsonify({'error': '無法讀取文件內容 (此檔案可能是掃描圖片或沒有文字圖層)'}), 500

                # 記錄擷取到的文字長度與預覽，方便診斷 (例如上下文截斷、擷取品質)。
                print(f"文件 '{filename_for_prompt}' 擷取文字長度: {len(file_text)} 字元")
                print(f"文件內容預覽: {file_text[:150]!r}")
        elif request.content_type.startswith('application/json'):
            data = request.get_json()
            if not data:
                return jsonify({'error': '無效的 JSON 格式'}), 400
            user_message = data.get('message')
            requested_model = data.get('model')
            requested_conversation_id = data.get('conversation_id')
        else:
            return jsonify({'error': '不支援的請求內容類型'}), 415

        if not user_message:
            return jsonify({'error': '訊息不能為空'}), 400

        if 'session_id' not in session:
            session['session_id'] = str(uuid.uuid4())
        session_id = session['session_id']

        # 對話儲存鍵：優先採用前端指定的 conversation_id (支援多個對話分頁)，
        # 若未提供則退回 cookie session_id (向下相容)。
        convo_key = requested_conversation_id or session_id

        # 決定本次要使用的模型：優先採用前端指定的，其次沿用該對話先前的，最後才用預設值。
        active_model_name = resolve_model_name(
            requested_model or session_models.get(convo_key) or DEFAULT_MODEL
        )
        if session_models.get(convo_key) != active_model_name:
            print(f"對話 {convo_key} 使用模型: {active_model_name}")
        session_models[convo_key] = active_model_name

        # 取得此對話的歷史。
        history = session_histories.setdefault(convo_key, [])

        if file_text:
            print(f"收到新文件 '{filename_for_prompt}'，為對話 {convo_key} 建立新的對話上下文。")
            # 重置歷史，並以文件內容作為新對話的開端。
            history = [
                {"role": "user", "content": f"接下來的對話將基於這個文件。請先記住它。文件名: '{filename_for_prompt}'.\n\n--- 文件內容開始 ---\n{file_text}\n--- 文件內容結束 ---"},
                {"role": "assistant", "content": "好的，我已經準備好根據這份文件內容來回答問題了。請提出您的問題。"}
            ]
            session_histories[convo_key] = history

        print(f"發送訊息到模型 ({active_model_name}): {user_message}")

        # 呼叫對應供應商 (含簡單重試)。history 不含本次的 user_message。
        response_text = None
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response_text = generate_response(active_model_name, history, user_message)
                break
            except Exception as e:
                print(f"與模型通訊時發生錯誤 (嘗試 {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise e

        # 將本次問答加入歷史，供下一輪對話使用。
        history.append({"role": "user", "content": user_message})
        history.append({"role": "assistant", "content": response_text})

        print(f"從模型收到回應 (截斷預覽): {response_text[:200]}...")
        return jsonify({'response': response_text, 'model': active_model_name})

    except Exception as e:
        print(f"聊天錯誤: {e}")
        return jsonify({'error': f'與模型通訊時發生錯誤: {e}'}), 500

@app.route('/api/clear', methods=['POST'])
def clear_history():
    # 可指定要清除的 conversation_id；未提供則清除 cookie session 對應的對話。
    data = request.get_json(silent=True) or {}
    convo_key = data.get('conversation_id') or session.get('session_id')
    if convo_key and convo_key in session_histories:
        del session_histories[convo_key]
    if convo_key and convo_key in session_models:
        del session_models[convo_key]
    print(f"對話歷史已清除 ({convo_key})")
    return jsonify({'status': 'ok', 'message': '對話歷史已清除'})

@app.route('/api/models', methods=['GET'])
def get_models():
    """回傳前端可選用的模型清單，以及目前 session 使用中的模型。"""
    session_id = session.get('session_id')
    current_model = session_models.get(session_id, DEFAULT_MODEL)
    return jsonify({
        'models': AVAILABLE_MODELS,
        'current': current_model,
        'default': DEFAULT_MODEL,
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'message': '後端服務正常運行'})

if __name__ == '__main__':
    print("正在啟動聊天機器人後端服務...")
    print("請確保已設定正確的 Gemini API 金鑰")
    app.run(debug=True, host='0.0.0.0', port=5002)