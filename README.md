# My-ChatBot

一個支援多模型切換的聊天機器人，前端以 React 開發、後端以 Python（Flask）開發。支援雲端 Google Gemini 與本機 Ollama 模型，並提供多對話管理、對話紀錄保存和文件上傳分析功能。

## 專案簡介

My-ChatBot 提供一套可切換模型的聊天介面。使用者可以保留多個獨立對話、上傳文件供 AI 參考，並切換淺色或深色主題。

本專案主要展示如何將現有的大型語言模型（Large Language Model，LLM）整合到應用程式中。它不包含模型訓練或微調流程，也不直接實作模型內部的 Transformer 計算。

## 專案技術

### 系統架構

```text
瀏覽器中的 React 前端
        │
        │ HTTP API（JSON 或 multipart/form-data）
        ▼
Python Flask 後端
        ├── Google Gemini API（雲端模型）
        └── Ollama API（本機模型）
```

### 前端

| 技術 | 用途 |
|---|---|
| React 19、JavaScript、JSX | 建立聊天介面及互動功能。React Hooks 用來管理訊息、對話、載入狀態、模型選擇與主題。主要邏輯位於 `frontend/src/App.js`。 |
| Create React App、react-scripts | 啟動前端開發伺服器、執行測試及打包前端資源。 |
| Tailwind CSS、PostCSS、Autoprefixer | 提供樣式工具類別，並處理 CSS。專案也使用 `App.css` 和 `index.css` 撰寫自訂樣式、動畫與響應式版面。 |
| lucide-react | 提供聊天介面使用的圖示。 |
| react-syntax-highlighter、Prism | 對 AI 回覆中的程式碼區塊提供語法高亮。 |
| Fetch API | 從瀏覽器向 Flask 後端發送 HTTP 請求。文字訊息使用 JSON；附加文件時使用 `multipart/form-data`。 |
| localStorage | 在使用者的瀏覽器保存對話清單、訊息、目前選取的對話及主題偏好。這不是後端資料庫。 |

### 後端

| 技術 | 用途 |
|---|---|
| Python 3.9+、Flask | 提供聊天、模型清單、健康檢查及清除對話等 API。主要程式位於 `backend/app.py`。 |
| Flask-CORS | 設定瀏覽器前端跨來源呼叫後端。目前設定允許 `http://localhost:3000`。 |
| python-dotenv | 從 `backend/.env` 載入 Gemini API 金鑰及其他環境設定。 |
| google-generativeai | 使用 Google Gemini Python SDK 呼叫雲端模型。 |
| requests | 呼叫本機 Ollama HTTP API。 |
| PyMuPDF（fitz）、PyPDF2 | 擷取 PDF 文字。程式優先使用 PyMuPDF；若擷取失敗或結果為空，則退回 PyPDF2。 |
| python-docx | 擷取 DOCX 文件中的段落文字。 |
| Werkzeug、tempfile | 安全地處理上傳檔案名稱與暫存檔案。上傳內容會經過類型檢查，暫存檔在處理後清除。 |

### 模型與資料保存

- **Gemini**：由後端透過 Gemini SDK 呼叫。API 金鑰放在後端環境變數中，不應放在前端程式碼。
- **Ollama**：由後端呼叫本機 Ollama 服務。後端啟動時會嘗試取得本機已安裝的模型清單。
- **前端對話紀錄**：保存在瀏覽器的 `localStorage`，關閉瀏覽器後仍可能保留。
- **後端模型上下文**：目前保存在 Flask 程序記憶體中的 Python 字典。重新啟動後端會失去這些上下文；瀏覽器顯示的歷史訊息仍可能存在，但不代表後端仍保存相同的模型上下文。

## AI 回答是如何產生的？

1. 使用者在前端輸入訊息，選擇目前對話使用的模型，然後送出請求。
2. 前端將訊息、模型名稱和對話 ID 傳給 Flask。若有附加文件，前端會一併上傳檔案。
3. 後端驗證請求，取得該對話的歷史訊息，並依模型名稱選擇 Gemini 或 Ollama。
4. 後端把系統提示、對話歷史及本次使用者訊息傳給所選模型。
5. 模型根據收到的輸入產生回應。後端將回應傳回前端，前端顯示並保存訊息。
6. 後端會將本次問答加入該對話的記憶體上下文，供後續請求使用。

目前的系統提示要求助理以繁體中文回答。對話歷史採用共同格式保存，再依供應商要求轉換成 Gemini 或 Ollama 的請求格式。

### 文件如何提供給模型？

上傳文件後，後端會擷取文字，再將文件內容放進對話上下文，讓模型依文件文字回答。這是將文件內容直接送入模型，不是完整的檢索增強生成（Retrieval-Augmented Generation，RAG）。

目前的限制：

- 支援 TXT、PDF、DOCX；PDF 需有可擷取的文字層。
- 掃描影像 PDF 不會自動進行 OCR。
- DOCX 目前擷取段落文字，不保證涵蓋表格、註解或其他特殊內容。
- 整份文件會放入模型上下文；文件太長時，可能超過模型的上下文長度，或造成較慢的回應與較高的使用成本。
- 收到新文件時，後端會以該文件建立此對話的新上下文。

### 製作本專案後了解到的 AI 基本運作原理

理解「應用程式如何使用大型語言模型」：

- 系統提示和對話歷史如何成為模型輸入。
- 模型如何根據上下文產生文字回應。
- 雲端模型與本機模型如何透過 API 呼叫。
- 文件文字如何被放進上下文，以及上下文長度帶來的限制。
- 不同模型面對相同輸入時，可能產生不同回應。

此專案還沒有展示進階的模型內部的訓練過程、權重、Transformer 各層計算、完整注意力矩陣或每一步的 logits。一般模型 API 通常不會提供這些內部資料。因此，本專案僅可以基礎學習模型的輸入、輸出和可觀察的推論行為。

## 後續優化方向

以下是未來規劃的方向，**目前尚未實作**。目標是繼續直接使用雲端 Gemini 或地端 Ollama 模型，不加入模型訓練或微調。

### 第一階段：檢視模型收到的輸入

增加「請求內容檢視」區域，讓使用者可以查看一次請求的組成，例如：

- 系統提示。
- 對話歷史中的訊息。
- 本次使用者輸入。
- 文件擷取出的文字，以及文字是否被截斷。
- 請求使用的模型。

顯示前應遮蔽 API 金鑰等機密資訊，並清楚標示文件或對話內容可能包含私人資料。

### 第二階段：顯示 Token 和上下文預算

顯示輸入與輸出的 Token 使用量，以及目前模型的上下文容量或可用預算，協助理解上下文長度如何影響回答。

需要注意：

- 不同模型的 Tokenizer 可能不同；跨供應商比較時應使用各模型對應的 Token 計數方式。
- 如果供應商未提供精確計數，估算值必須標示為估算，不應呈現成精確值。
- 若模型的上下文容量無法從 API 確認，應標示未知或使用明確標示來源的模型規格，不應假裝是即時讀取值。

### 第三階段：記錄生成設定與回應指標

在供應商與模型支援的範圍內，記錄並顯示：

- 生成參數，例如 temperature。
- 輸入及輸出 Token 數。
- 請求延遲、生成時間與生成速度。
- 模型提供的結束原因或其他使用量資訊。

不同供應商支援的參數和回傳欄位可能不同。介面應標示哪些是供應商實際回傳、哪些是本地量測或估算。

### 第四階段：比較不同模型的回答

加入模型比較功能，讓相同的問題、文件及必要的上下文可以送給不同模型，再並列檢視回答、耗時及使用量。

比較時應使用一致的輸入條件，並將測試請求與正式對話隔離，避免比較結果混入原本對話歷史。模型回答的品質仍需要使用者判讀；單次結果不能代表模型在所有情況下的能力。

### 可觀察範圍與限制

透過這些功能，可以觀察模型 API 的輸入、回應、Token 使用量、延遲、生成設定及部分結束資訊。這有助於理解模型作為「根據輸入產生輸出」的推論過程。

但一般 Gemini 或 Ollama 聊天 API 通常不會提供模型權重、每一層的內部 activations、完整注意力矩陣或訓練資料。這些資料不能只靠在聊天介面加上紀錄功能取得；本專案的優化不應把 API 無法提供的內部狀態假稱為可觀察資訊。

## 特色功能

- **多模型切換**：可在 Gemini 雲端模型與本機 Ollama 模型間切換。Ollama 需安裝、啟動並已有模型，後端才能偵測到。
- **多對話管理**：可新增、切換及刪除各自獨立的對話。
- **對話紀錄保存**：對話訊息及主題偏好保存在瀏覽器 `localStorage`。
- **文件上傳分析**：支援 TXT、PDF、DOCX。
- **淺色 / 深色主題**：記住使用者選擇。
- **程式碼區塊**：語法高亮及一鍵複製。
- **連線狀態檢查**：每 5 秒檢查一次後端健康狀態。
- **儲存空間提示**：瀏覽器 `localStorage` 寫入失敗時顯示提示，協助使用者刪除舊對話。

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

### 2. 後端

後端入口為 `backend/app.py`：

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

在 `backend/` 下建立 `.env`，格式請參考 `.env.example`：

```env
GEMINI_API_KEY=你的_API_金鑰
```

啟動後端，預設使用埠 5002：

```bash
python app.py
```

### 3. 前端

```bash
cd frontend
npm install
npm start
```

前端預設於 <http://localhost:3000> 開啟，並連線至後端 <http://localhost:5002>。

## 環境變數

| 變數 | 說明 | 預設值 |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API 金鑰 | 無；後端啟動時必須設定 |
| `OLLAMA_BASE` | 本機 Ollama 服務位址 | `http://localhost:11434` |
| `OLLAMA_NUM_CTX` | Ollama 上下文長度（tokens）；增加時會占用更多記憶體 | `8192` |

> Ollama 模型的上下文設定會影響可處理的輸入長度。調高設定可能增加記憶體使用量及推論時間。

## 穩定性與安全性

### 檔案上傳

- 支援的副檔名為 TXT、PDF、DOCX，後端單一請求上限為 20 MB。
- 以檔案開頭的內容（magic bytes）檢查實際格式，不只信任副檔名。
- 使用隨機命名的暫存檔，不使用使用者提供的檔名作為磁碟路徑。
- 以 `try/finally` 清除處理完成的暫存檔。
- PDF 優先使用 PyMuPDF 擷取文字，必要時退回 PyPDF2。掃描圖片且沒有文字層的 PDF 不會自動 OCR。

### 前端資料與連線

- 前端 `localStorage` 的容量有限；寫入失敗時會顯示提示。此時尚未保存的內容可能只留在目前頁面的記憶體中。
- 後端對話上下文保存在程序記憶體中，重新啟動後端會清除上下文。
- 連線狀態顯示在標題列，並定期重新檢查後端狀態。

### 部署注意事項

目前 CORS 設定允許 `http://localhost:3000`，適合本機開發。若要部署到其他網域，應明確設定允許的來源，並妥善管理 API 金鑰、HTTPS、工作階段及資料保存方式。不要將 `.env` 或 API 金鑰提交到版本控制。

## 目錄結構

```text
My-ChatBot/
├── backend/
│   ├── app.py              # Flask API、模型路由、文件解析
│   ├── requirements.txt    # Python 後端相依套件
│   └── .env.example        # 環境變數範例
└── frontend/
    ├── package.json        # 前端相依套件及指令
    └── src/
        ├── App.js          # React 聊天介面與主要邏輯
        ├── App.css         # 應用程式樣式
        └── index.css       # 全域樣式
```

## API 端點

| 方法 | 路徑 | 說明 |
|---|---|---|
| `POST` | `/api/chat` | 送出訊息；支援 JSON 或含文件的 multipart，並可帶 `model`、`conversation_id`。 |
| `POST` | `/api/clear` | 清除指定 `conversation_id` 的後端對話歷史。 |
| `GET` | `/api/models` | 取得可用模型清單與預設模型。 |
| `GET` | `/api/health` | 檢查後端服務狀態。 |
