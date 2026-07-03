# My-ChatBot

一個支援多模型切換的聊天機器人，前端以 React 開發、後端以 Python (Flask) 開發。同時支援雲端的 **Google Gemini** 與本機的 **Ollama** 模型，具備多對話管理、對話紀錄保存與文件上傳分析等功能。

## 專案簡介

My-ChatBot 提供一套簡單易用且可擴充的聊天機器人介面：使用者可自由切換模型、同時保留多個獨立對話、上傳文件讓 AI 分析，並支援淺色 / 深色主題。

## 特色功能

- **多模型切換**：於畫面右上下拉選單即時切換模型
  - 雲端：Google Gemini 系列
  - 本機：自動偵測本機 Ollama 已安裝的模型（若有安裝並執行）
  - 每個對話各自記住所選模型，標題列顯示目前使用中的模型
- **多對話管理**：左側側邊欄可
  - ➕ 新增對話（開啟一個全新的獨立對話）
  - 點選切換不同對話
  - 刪除不需要的對話
  - 對話標題自動取自該對話的第一則訊息
- **對話紀錄保存**：對話內容儲存於瀏覽器 localStorage，關閉後重開仍會保留；每個對話在後端維持各自獨立的上下文（切換模型也會保留上下文）
- **文件上傳分析**：支援 `TXT`、`PDF`、`DOCX`
  - PDF 以 PyMuPDF 擷取（對中文支援較佳），必要時退回 PyPDF2
  - 以檔案實際內容（magic bytes）驗證類型，非僅信任副檔名
- **淺色 / 深色主題**切換，並記住偏好
- **程式碼區塊**語法高亮與一鍵複製
- **連線狀態自動偵測**：每 5 秒輪詢後端健康狀態，後端恢復後畫面會自動變回「已連接」
- **儲存空間保護**：localStorage 容量不足時顯示提示橫幅，並提供「刪除最舊對話」按鈕，不會崩潰或默默遺失資料

## 系統需求

- Python 3.9+
- Node.js 16+
- （選用）本機安裝並執行 [Ollama](https://ollama.com/)，才會出現本機模型

## 安裝與啟動

### 1. 複製專案

```bash
git clone https://github.com/Joy0130/My-ChatBot.git
cd My-ChatBot
```

### 2. 後端（backend，入口為 app.py）

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

設定 Gemini API 金鑰：在 `backend/` 下建立 `.env`（格式請參考 `.env.example`）：

```
GEMINI_API_KEY=你的_API_金鑰
```

啟動後端（預設埠 5002）：

```bash
python app.py
```

### 3. 前端（frontend）

```bash
cd frontend
npm install
npm start
```

前端預設於 <http://localhost:3000> 開啟，並連線至後端 <http://localhost:5002>。

## 使用說明

1. 在右上下拉選單選擇要使用的模型（Gemini 或 Ollama）。
2. 於底部輸入框輸入訊息，按 **Enter** 送出（**Shift + Enter** 換行）。
3. 點選左側「➕ 新增對話」可開啟新的獨立對話；點選清單項目可切換；hover 後可刪除。
4. 點選左下角上傳鈕可附加 `TXT / PDF / DOCX` 文件，AI 會依文件內容回答。

## 環境變數

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `GEMINI_API_KEY` | Google Gemini API 金鑰（必填） | 無 |
| `OLLAMA_BASE` | 本機 Ollama 服務位址 | `http://localhost:11434` |
| `OLLAMA_NUM_CTX` | Ollama 上下文長度（tokens）。上傳長文件時建議調高，例如 `32768` | `8192` |

> 提示：Ollama 預設上下文較小，處理長文件時內容可能被截斷。若上傳較長 PDF 時模型「讀不到內容」，可提高 `OLLAMA_NUM_CTX`（代價是佔用更多記憶體、推論較慢）。

## 穩定性與安全性

近期針對檔案上傳、資料保存與連線狀態做了以下強化：

### 檔案上傳安全

- **杜絕路徑遍歷**：上傳檔案改以 `tempfile` 隨機命名儲存，磁碟路徑完全不採用使用者提供的檔名（`secure_filename` 僅用於顯示）。
- **內容類型驗證**：以檔案開頭的 magic bytes 檢查實際內容（PDF 須以 `%PDF` 開頭、DOCX 須為 zip、TXT 拒絕二進位內容），不僅信任副檔名，內容不符即回 `400`。
- **暫存檔必清理**：以 `try/finally` 確保無論處理成功或發生例外，暫存檔都會被刪除，避免堆積。
- **上傳大小上限**：單一檔案 20MB。

### 中文 PDF 擷取

- PDF 優先使用 **PyMuPDF**（對中文 CJK 文字擷取較完整），擷取為空時自動退回 **PyPDF2**。
- 若檔案為掃描圖片（無文字圖層），會回傳明確錯誤提示。

### 前端資料保存與連線

- **儲存容量保護**：寫入 localStorage 失敗（超過約 5MB 上限）時，對話仍保留在記憶體中，並顯示提示橫幅引導使用者刪除舊對話，不會崩潰。
- **連線自動恢復**：連線狀態僅顯示於標題列並定期輪詢，不再把過時的錯誤訊息寫入對話。

## 目錄結構

```
My-ChatBot/
├── backend/
│   ├── app.py              # Flask 後端入口（API、模型路由、文件解析）
│   ├── requirements.txt    # 後端相依套件
│   └── .env.example        # 環境變數範例
└── frontend/
    └── src/
        └── App.js          # React 前端主要邏輯與 UI
```

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/chat` | 送出訊息（支援 JSON 或含檔案的 multipart），可帶 `model`、`conversation_id` |
| `POST` | `/api/clear` | 清除指定 `conversation_id` 的對話歷史 |
| `GET`  | `/api/models` | 取得可用模型清單與預設模型 |
| `GET`  | `/api/health` | 後端健康檢查 |
