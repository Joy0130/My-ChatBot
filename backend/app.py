from flask import Flask, request, jsonify, session
from flask_cors import CORS
import google.generativeai as genai
import os
import time
import uuid
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
import PyPDF2
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

# 列出可用模型 (用於調試)
print("可用的 Gemini 模型:")
for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods:
        print(m.name)

# --- 修正 #2: 使用有效的 Gemini 模型名稱 ---
system_instruction = "你是一個樂於助人、專業且友善的 AI 助理。請以詳盡且有條理的方式，使用繁體中文來回答所有問題。"
model = genai.GenerativeModel(
    'gemini-2.5-pro', # 使用一個有效的模型名稱
    system_instruction=system_instruction
)

# 文件上傳設定
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'docx'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB 限制

# 創建上傳資料夾
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# 用於存儲對話 session 的字典
chat_sessions = {}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS
#讀取文件內容
def extract_text_from_file(file_path, filename):
    text = ""
    file_extension = filename.rsplit('.', 1)[1].lower()
    
    try:
        if file_extension == 'txt':
            with open(file_path, 'r', encoding='utf-8') as file:
                text = file.read()
        
        elif file_extension == 'pdf':
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page in pdf_reader.pages:
                    text += page.extract_text()
        
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

        if request.content_type.startswith('multipart/form-data'):
            user_message = request.form.get('message')
            if 'file' in request.files and request.files['file'].filename != '':
                file = request.files['file']
                if not allowed_file(file.filename):
                    return jsonify({'error': '不支援的文件格式'}), 400

                filename = secure_filename(file.filename)
                filename_for_prompt = filename
                file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                file.save(file_path)

                file_text = extract_text_from_file(file_path, filename)
                os.remove(file_path)

                if file_text is None or file_text.strip() == "":
                    print("提取的文件內容為空，無法進行後續處理。")
                    return jsonify({'error': '無法讀取文件內容'}), 500
        elif request.content_type.startswith('application/json'):
            data = request.get_json()
            if not data:
                return jsonify({'error': '無效的 JSON 格式'}), 400
            user_message = data.get('message')
        else:
            return jsonify({'error': '不支援的請求內容類型'}), 415

        if not user_message:
            return jsonify({'error': '訊息不能為空'}), 400

        if 'session_id' not in session:
            session['session_id'] = str(uuid.uuid4())
        session_id = session['session_id']

        if file_text:
            print(f"收到新文件 '{filename_for_prompt}'，為 session {session_id} 建立新的對話上下文。")
            history = [
                {"role": "user", "parts": [f"接下來的對話將基於這個文件。請先記住它。文件名: '{filename_for_prompt}'.\n\n--- 文件內容開始 ---\n{file_text}\n--- 文件內容結束 ---"]},
                {"role": "model", "parts": ["好的，我已經準備好根據這份文件內容來回答問題了。請提出您的問題。"]}
            ]
            chat_sessions[session_id] = model.start_chat(history=history)
        
        if session_id not in chat_sessions:
            print(f"為 session {session_id} 創建新的對話")
            chat_sessions[session_id] = model.start_chat(history=[])

        chat_session = chat_sessions[session_id]
        final_user_message = user_message
        
        print(f"發送訊息到 Gemini: {final_user_message}")

        response = None
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = chat_session.send_message(final_user_message)
                break
            except Exception as e:
                print(f"與 Gemini API 通訊時發生錯誤 (嘗試 {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise e
        try:
            response_text = response.text
        except ValueError:
            if not response.candidates:
                block_reason_name = response.prompt_feedback.block_reason.name if response.prompt_feedback.block_reason else "UNKNOWN"
                print(f"警告: 提示被封鎖或發生其他錯誤，沒有收到候選回應。原因: {block_reason_name}")
                response_text = f"您的請求無法處理，原因：{block_reason_name}。請修改後再試一次。"
            else:
                candidate = response.candidates[0]
                finish_reason_name = candidate.finish_reason.name
                print(f"警告: 模型回應沒有文字內容。結束原因: {finish_reason_name}")
                if finish_reason_name == 'SAFETY':
                    response_text = "因為安全考量，模型無法提供回應。請嘗試修改您的問題。"
                elif finish_reason_name == 'STOP' and not candidate.content.parts:
                    response_text = "我收到了您的訊息，但這次沒有特別的回應。您可以試著問我一些具體的問題嗎？"
                else:
                    response_text = f"模型沒有生成文字回應，原因為「{finish_reason_name}」。請嘗試不同的問題。"
        
        print(f"從 Gemini 收到回應 (截斷預覽): {response_text[:200]}...")
        return jsonify({'response': response_text})

    except Exception as e:
        print(f"聊天錯誤: {e}")
        return jsonify({'error': f'與模型通訊時發生錯誤: {e}'}), 500

@app.route('/api/clear', methods=['POST'])
def clear_history():
    session_id = session.get('session_id')
    if session_id and session_id in chat_sessions:
        del chat_sessions[session_id]
    print("對話歷史已清除")
    return jsonify({'status': 'ok', 'message': '對話歷史已清除'})

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'message': '後端服務正常運行'})

if __name__ == '__main__':
    print("正在啟動聊天機器人後端服務...")
    print("請確保已設定正確的 Gemini API 金鑰")
    app.run(debug=True, host='0.0.0.0', port=5002)