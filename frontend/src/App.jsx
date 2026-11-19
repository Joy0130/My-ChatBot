// --- 1. 依賴導入 ---
// 引入 React 核心功能 (hooks) 和第三方庫 (lucide-react 圖示庫, react-syntax-highlighter 程式碼高亮)
import React, { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { Send, Upload, Trash2, FileText, User, Bot, AlertCircle, CheckCircle, Info, Copy, Check, Sun, Moon, Plus, MessageSquare, X } from 'lucide-react';
import './App.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// --- 2. 全域設定 ---
/**
 * 後端 API 的基礎 URL。
 * 所有的 API 請求都會發送到這個位址。
 */
const API_BASE = 'http://localhost:5002/api';

/**
 * 工具函數：格式化目前時間。
 * @returns {string} 回傳格式為 "HH:MM" 的時間字串。
 */
const formatTime = () => {
  return new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * 工具函數：產生一個簡單的唯一 ID (用於對話與訊息)。
 */
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// 新對話的預設歡迎訊息。
const WELCOME_TEXT = '您好！我是您的專屬助理，有什麼可以為您服務的嗎？您可以直接問我問題，或是上傳文件讓我為您分析。';

/**
 * 工具函數：建立一個全新的對話物件。
 * @param {string} [title] - 對話標題，預設為「新對話」。
 */
const makeConversation = (title = '新對話') => ({
  id: genId(),
  title,
  model: '', // 空字串代表沿用目前的預設模型
  messages: [{ id: genId(), text: WELCOME_TEXT, sender: 'bot', timestamp: formatTime() }],
});

/**
 * 工具函數：嘗試將對話清單寫入 localStorage。
 * localStorage 通常有約 5MB 容量上限；若對話過多 / 內容過長導致超出配額，
 * 會拋出例外——這裡以 try/catch 攔截，回傳是否寫入成功 (不讓應用崩潰)。
 * 寫入失敗時，對話仍保留在記憶體中，由畫面提示使用者刪除舊對話以釋放空間。
 * @returns {boolean} 是否成功寫入。
 */
const trySaveConversations = (conversations, activeId) => {
  try {
    localStorage.setItem('conversations', JSON.stringify(conversations));
    localStorage.setItem('activeConversationId', activeId);
    return true;
  } catch (e) {
    console.warn('localStorage 容量不足，無法保存對話歷史。', e);
    return false;
  }
};

// --- 3. 主題管理 (Context API) ---
/**
 * 建立一個 React Context 用於全域主題管理。
 */
const ThemeContext = createContext();

/**
 * 主題提供者組件 (ThemeProvider)。
 * 這個組件會包裹整個應用，讓所有子組件都能存取和修改主題。
 * @param {object} props - 組件屬性。
 * @param {React.ReactNode} props.children - 要被包裹的子組件。
 */
const ThemeProvider = ({ children }) => {
  // 使用 useState 初始化主題，優先從 localStorage 讀取，若無則預設為 'light'。
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  // 使用 useEffect 監聽主題變化。
  useEffect(() => {
    // 取得 HTML 的根元素 (<html>)。
    const root = window.document.documentElement;
    // 移除舊的主題 class，並加上新的主題 class。
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    // 將新的主題設定儲存到 localStorage，以便下次開啟時記住選擇。
    localStorage.setItem('theme', theme);
  }, [theme]);

  // 定義一個切換主題的函數。
  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  // 使用 Context.Provider 將 'theme' 狀態和 'toggleTheme' 函數提供給所有子組件。
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
};

/**
 * 訊息圖示組件 (MessageIcon)。
 * 根據訊息的發送者和類型，顯示不同的圖示。
 * @param {object} props - 組件屬性。
 * @param {string} props.sender - 訊息發送者 ('user', 'bot', 'system')。
 * @param {boolean} props.isError - 是否為錯誤訊息。
 * @param {boolean} props.isFile - 是否為文件相關的系統訊息。
 */
const MessageIcon = ({ sender, isError, isFile }) => {
  const iconProps = { size: 16, className: "mt-1 flex-shrink-0" };
  
  if (sender === 'user') {
    return <User {...iconProps} className="mt-1 flex-shrink-0 text-blue-100" />;
  }
  
  if (isError) {
    return <AlertCircle {...iconProps} className="mt-1 flex-shrink-0 text-red-500" />;
  }
  
  if (sender === 'system') {
    return isFile ? 
      <CheckCircle {...iconProps} className="mt-1 flex-shrink-0 text-green-500" /> :
      <Info {...iconProps} className="mt-1 flex-shrink-0 text-yellow-600" />;
  }
  
  return <Bot {...iconProps} className="mt-1 flex-shrink-0 text-gray-500" />;
};

/**
 * "正在輸入中" 的載入動畫組件 (TypingIndicator)。
 * 當機器人正在處理回應時顯示。
 */
const TypingIndicator = () => (
  <div className="flex justify-start mb-4">
    <div className="bg-white shadow-sm border rounded-lg px-4 py-3 max-w-xs">
      <div className="flex items-center space-x-2">
        <Bot size={16} className="text-gray-500" />
        <div className="typing-dots">
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
          <div className="typing-dot"></div>
        </div>
        <span className="text-sm text-gray-500">正在輸入...</span>
      </div>
    </div>
  </div>
);

/**
 * 程式碼區塊組件 (CodeBlock)。
 * 使用 react-syntax-highlighter 來美化程式碼，並提供一個複製按鈕。
 * @param {object} props - 組件屬性。
 * @param {string} props.language - 程式碼的語言。
 * @param {string} props.code - 要顯示的程式碼字串。
 */
const CodeBlock = ({ language, code }) => {
  // 狀態：用來追蹤程式碼是否已被複製。
  const [isCopied, setIsCopied] = useState(false);

  // 處理複製按鈕的點擊事件。
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <div className="relative my-2 bg-gray-800 rounded-lg overflow-hidden">
      <div className="flex justify-between items-center px-4 py-1 bg-gray-700 text-gray-300 text-xs">
        <span>{language || 'code'}</span>
        <button onClick={handleCopy} className="flex items-center space-x-1 text-gray-300 hover:text-white">
          {isCopied ? <Check size={14} /> : <Copy size={14} />}
          <span>{isCopied ? '已複製!' : '複製'}</span>
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={atomDark}
        customStyle={{ margin: 0, padding: '1rem', fontSize: '0.875rem' }}
        codeTagProps={{ style: { fontFamily: 'monospace' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

/**
 * 訊息內容渲染器 (MessageContent)。
 * 這個組件會解析訊息文字，如果找到程式碼區塊 (```...```)，
 * 就會使用 CodeBlock 組件來渲染，否則就當作一般文字渲染。
 * @param {object} props - 組件屬性。
 * @param {string} props.text - 完整的訊息文字。
 */
const MessageContent = ({ text }) => {
  // 使用正則表達式分割文字和程式碼區塊。
  const parts = text.split(/(```[\w-]*\n[\s\S]*?```)/);
  return parts.map((part, index) => {
    const match = part.match(/```([\w-]*)\n([\s\S]*?)```/);
    if (match) { // 如果是程式碼區塊
      const language = match[1] || 'plaintext';
      const code = match[2];
      return <CodeBlock key={index} language={language} code={code} />;
    }
    return <div key={index} className="whitespace-pre-wrap text-sm leading-relaxed break-words">{part}</div>;
  });
};

/**
 * 主要的聊天機器人應用組件 (ChatBot)。
 * 包含了所有的 UI 和核心邏輯。
 */
const ChatBot = () => {
  // --- 狀態管理 (State Management) ---
  // 多對話：conversations 為所有對話的清單，activeId 為目前顯示的對話。
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  // 可選用的模型清單，以及預設模型
  const [availableModels, setAvailableModels] = useState([]);
  const [defaultModel, setDefaultModel] = useState('');
  // 當 localStorage 容量不足、無法保存對話時，顯示提示橫幅。
  const [storageFull, setStorageFull] = useState(false);
  // 從 Context 中取得主題狀態和切換函數。
  const { theme, toggleTheme } = useContext(ThemeContext);

  // --- 衍生狀態 (Derived State) ---
  // 目前作用中的對話，以及其訊息與模型。
  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeId) || null,
    [conversations, activeId]
  );
  const messages = useMemo(
    () => (activeConversation ? activeConversation.messages : []),
    [activeConversation]
  );
  const selectedModel = (activeConversation && activeConversation.model) || defaultModel;

  // --- DOM 引用 (Refs) ---
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  /**
   * Effect Hook: 自動調整輸入框 (textarea) 的高度。
   * 根據輸入內容的行數動態改變高度。
   */
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${scrollHeight}px`;
    }
  }, [inputMessage]);

  /**
   * Callback: 將一條訊息新增到「指定對話」的訊息列表中。
   * @param {string} convId - 目標對話的 id。
   * @param {object} message - 要新增的訊息物件。
   */
  const addMessageToConversation = useCallback((convId, message) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [
                ...c.messages,
                { ...message, id: genId(), timestamp: formatTime() },
              ],
            }
          : c
      )
    );
  }, []);

  /**
   * Callback: 將一條訊息新增到「目前作用中」的對話。
   * @param {object} message - 要新增的訊息物件。
   */
  const addMessage = useCallback(
    (message) => {
      if (activeId) addMessageToConversation(activeId, message);
    },
    [activeId, addMessageToConversation]
  );

  /**
   * Callback: 建立一個新對話並切換過去。
   */
  const createNewConversation = useCallback(() => {
    const conv = makeConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setInputMessage('');
    setSelectedFile(null);
  }, []);

  /**
   * Callback: 切換到指定的對話。
   */
  const switchConversation = useCallback((id) => {
    setActiveId(id);
    setInputMessage('');
    setSelectedFile(null);
  }, []);

  /**
   * Effect Hook: 組件初次渲染時執行。
   * 從 localStorage 載入多對話資料；若無則 (嘗試沿用舊版單一對話) 或建立一個新對話。
   */
  useEffect(() => {
    let loaded = [];
    let loadedActiveId = null;
    try {
      const savedConvos = localStorage.getItem('conversations');
      if (savedConvos) {
        loaded = JSON.parse(savedConvos) || [];
        loadedActiveId = localStorage.getItem('activeConversationId');
      } else {
        // 向下相容：把舊版單一對話 (chatHistory) 轉為一個對話。
        const oldHistory = localStorage.getItem('chatHistory');
        const parsed = oldHistory ? JSON.parse(oldHistory) : [];
        if (parsed.length > 0) {
          const conv = makeConversation('先前的對話');
          conv.messages = parsed;
          loaded = [conv];
        }
      }
    } catch (e) {
      console.error('載入對話資料失敗:', e);
    }

    if (!loaded || loaded.length === 0) {
      loaded = [makeConversation()];
    }
    // 清理先前版本殘留的「無法連接到後端」系統錯誤訊息 (現已不再寫入對話)，避免過時訊息造成誤解。
    loaded = loaded.map((c) => ({
      ...c,
      messages: (c.messages || []).filter(
        (m) => !(m.isError && typeof m.text === 'string' && m.text.includes('無法連接到後端服務'))
      ),
    }));
    // 確認 activeId 有效，否則採用第一個對話。
    if (!loadedActiveId || !loaded.some((c) => c.id === loadedActiveId)) {
      loadedActiveId = loaded[0].id;
    }
    setConversations(loaded);
    setActiveId(loadedActiveId);
  }, []);

  /**
   * Effect Hook: 當對話清單或作用中對話變化時，儲存到 localStorage。
   */
  useEffect(() => {
    // activeId 尚未初始化 (null) 時不覆寫，避免把初始空狀態寫入。
    if (activeId === null) return;
    const ok = trySaveConversations(conversations, activeId);
    // 寫入失敗代表容量不足：顯示提示橫幅，讓使用者自行刪除舊對話釋放空間。
    // 成功則清除提示 (例如使用者刪除舊對話後空間已足夠)。
    setStorageFull(!ok);
  }, [conversations, activeId]);

  /**
   * Callback: 將聊天視窗平滑地滾動到最底部。
   * 用於確保最新的訊息總是可見的。
   */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: "smooth",
      block: "end"
    });
  }, []);

  /**
   * Effect Hook: 執行後端健康檢查 (定期輪詢)。
   * 連線狀態只反映在標題列，不寫入對話訊息中，避免留下過時的錯誤訊息造成誤解。
   * 每 5 秒重新檢查一次，後端恢復後畫面會自動變回「已連接」。
   */
  useEffect(() => {
    let cancelled = false;

    const checkConnection = async () => {
      try {
        // 向後端的 /health 端點發送請求。
        const response = await fetch(`${API_BASE}/health`, {
          credentials: 'include' // 確保請求中包含 cookie，以便 session 正常工作。
        });
        if (!cancelled) setConnectionStatus(response.ok ? 'connected' : 'error');
      } catch (error) {
        if (!cancelled) setConnectionStatus('error');
      }
    };

    checkConnection();
    const intervalId = setInterval(checkConnection, 5000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  /**
   * Effect Hook: 載入後端提供的可用模型清單。
   * 組件掛載時向 /models 端點請求，取得模型清單與目前使用中的模型。
   */
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch(`${API_BASE}/models`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setAvailableModels(data.models || []);
          // 記錄預設模型；未指定模型的對話會沿用此預設值。
          setDefaultModel(data.default || (data.models && data.models[0]) || '');
        }
      } catch (error) {
        console.error('載入模型清單失敗:', error);
      }
    };

    fetchModels();
  }, []);

  /**
   * Effect Hook: 當訊息列表更新時，自動滾動到底部。
   */
  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  /**
   * 異步函數: 處理發送訊息的邏輯。
   * 收集使用者輸入和文件，然後發送到後端 API。
   */
  const sendMessage = async () => {
    // 如果沒有文字訊息，或正在載入中，則不執行
    if (!inputMessage.trim() || isLoading) {
      // 如果有選擇文件但沒有輸入文字，提示用戶
      if (selectedFile && !inputMessage.trim()) {
        addMessage({ text: '請輸入您想對此文件執行的操作。', sender: 'system', isError: true });
      }
      return;
    }

    const userMessage = inputMessage.trim();
    const userFile = selectedFile;
    // 記住這則訊息屬於哪個對話，避免傳送過程中切換對話導致回應寫錯地方。
    const convId = activeId;
    const modelForRequest = selectedModel;

    // 清空輸入框和已選文件。
    setInputMessage('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setIsLoading(true);

    // 將使用者發送的訊息立即顯示在畫面上。
    addMessageToConversation(convId, {
      text: userFile ? `${userMessage} (文件: ${userFile.name})` : userMessage,
      sender: 'user',
      isFile: !!userFile,
    });

    // 若這是該對話的第一則使用者訊息，用它作為對話標題。
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId && (c.title === '新對話' || !c.title)
          ? { ...c, title: userMessage.slice(0, 20) }
          : c
      )
    );

    try {
      let response;
      if (userFile) {
        // 如果有文件，使用 FormData 格式發送 multipart/form-data 請求。
        const formData = new FormData();
        formData.append('file', userFile);
        formData.append('message', userMessage);
        if (modelForRequest) formData.append('model', modelForRequest);
        formData.append('conversation_id', convId);
        response = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
        });
      } else {
        // 僅文字的請求
        response = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage, model: modelForRequest, conversation_id: convId }),
          credentials: 'include',
        });
      }

      const data = await response.json().catch(() => {
        throw new Error("從伺服器收到無效的回應格式，預期為 JSON。");
      });

      if (response.ok) {
        // 如果請求成功，將機器人的回應新增到該對話。
        addMessageToConversation(convId, { text: data.response, sender: 'bot' });
        // 以後端實際使用的模型同步該對話的模型 (例如指定的模型無效時後端會退回預設)。
        if (data.model) {
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, model: data.model } : c))
          );
        }
      } else {
        throw new Error(data.error || '發送訊息失敗');
      }
    } catch (error) {
      console.error('發送訊息錯誤:', error);
      // 如果發生錯誤，顯示一條錯誤訊息。
      addMessageToConversation(convId, { text: `錯誤: ${error.message}`, sender: 'bot', isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  // 文件選擇處理
  /**
   * 事件處理器: 處理文件選擇事件。
   * 驗證文件類型和大小。
   */
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const allowedTypes = ['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      alert('不支援的文件格式。請選擇 TXT、PDF 或 DOCX 文件。');
      return;
    }

    const maxSize = 16 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('文件太大。請選擇小於 16MB 的文件。');
      return;
    }

    setSelectedFile(file);
  };

  /**
   * 函數: 清除已選擇的文件。
   */
  const clearFileSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
   * 異步函數: 清除「目前對話」的歷史 (本地與後端)。
   */
  const clearHistory = async () => {
    if (!activeId) return;
    // 彈出確認對話框，防止誤觸。
    if (!window.confirm('確定要清除這個對話的歷史嗎？')) return;

    try {
      // 向後端發送清除請求 (帶上 conversation_id)。
      await fetch(`${API_BASE}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: activeId }),
        credentials: 'include'
      });
    } catch (error) {
      console.error('清除歷史失敗:', error);
    }
    // 將目前對話的訊息重置為只剩一則系統提示。
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? { ...c, messages: [{ id: genId(), text: '✅ 對話歷史已清除', sender: 'system', timestamp: formatTime() }] }
          : c
      )
    );
  };

  /**
   * 異步函數: 刪除一個對話 (含後端歷史)。
   */
  const deleteConversation = async (id) => {
    if (!window.confirm('確定要刪除這個對話嗎？此動作無法復原。')) return;

    try {
      await fetch(`${API_BASE}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: id }),
        credentials: 'include'
      });
    } catch (error) {
      console.error('刪除對話失敗:', error);
    }

    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      // 若刪除的是目前對話，切換到剩下的第一個；若已無對話則建立新的。
      if (id === activeId) {
        if (remaining.length > 0) {
          setActiveId(remaining[0].id);
        } else {
          const fresh = makeConversation();
          setActiveId(fresh.id);
          return [fresh];
        }
      }
      return remaining;
    });
  };

  /**
   * 事件處理器: 刪除最舊、且非目前使用中的一個對話，用於容量不足時釋放空間。
   */
  const deleteOldestConversation = async () => {
    // 陣列尾端為最舊；找出第一個非使用中的對話。
    const target = [...conversations].reverse().find((c) => c.id !== activeId);
    if (!target) {
      window.alert('目前只剩一個對話，無法再刪除。請改用「清除對話」縮短內容。');
      return;
    }
    try {
      await fetch(`${API_BASE}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: target.id }),
        credentials: 'include'
      });
    } catch (error) {
      console.error('刪除對話失敗:', error);
    }
    setConversations((prev) => prev.filter((c) => c.id !== target.id));
  };

  /**
   * 事件處理器: 變更目前對話所使用的模型。
   */
  const handleModelChange = (model) => {
    if (!activeId) return;
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, model } : c))
    );
  };

  /**
   * 事件處理器: 處理鍵盤按下事件。
   * 實現 "Enter" 發送訊息，"Shift + Enter" 換行。
   */
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // 如果有輸入文字，就發送
      if (inputMessage.trim()) {
        sendMessage();
      }
    }
  };

  /**
   * 函數: 根據訊息的屬性回傳對應的 CSS class。
   * 用於動態設定訊息氣泡的樣式。
   * @param {object} message - 訊息物件。
   */
  //網頁對話框顏色
  const getMessageClass = (message) => {
    const baseClass = 'max-w-md lg:max-w-2xl px-4 py-3 rounded-xl shadow-md message-animation ';
    if (message.sender === 'user') return baseClass + 'bg-blue-100 text-slate-800 dark:bg-blue-700 dark:text-slate-100';
    if (message.isError) return baseClass + 'bg-red-100 text-red-800 border border-red-200 error-shake dark:bg-red-900/30 dark:text-red-200 dark:border-red-800/50';
    if (message.sender === 'system') return baseClass + 'bg-yellow-100 text-yellow-800 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800/50';
    return baseClass + 'bg-white text-slate-800 border border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600';
  };

  return (
    // --- JSX 渲染 ---
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">

      {/* 對話側邊欄 (多對話清單) */}
      <div className="w-64 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col dark:bg-slate-800 dark:border-slate-700">
        {/* 新增對話按鈕 */}
        <div className="p-3 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={createNewConversation}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus size={18} />
            <span>新增對話</span>
          </button>
        </div>
        {/* 對話清單 */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => switchConversation(conv.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                conv.id === activeId
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
              title={conv.title}
            >
              <div className="flex items-center space-x-2 min-w-0">
                <MessageSquare size={16} className="flex-shrink-0" />
                <span className="truncate text-sm">{conv.title || '新對話'}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 hover:text-red-600 transition-all dark:hover:bg-red-900/40"
                title="刪除對話"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 主要區域 (標題欄 + 訊息 + 輸入) */}
      <div className="flex flex-col flex-1 relative min-w-0">

      {/* 標題欄 */}
      <div className="bg-white shadow-lg border-b p-4 flex justify-between items-center dark:bg-gray-800 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-full">
            <Bot className="text-blue-600" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">My ChatBot</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              連接狀態: {connectionStatus === 'connected' ? '✅ 已連接' : connectionStatus === 'connecting' ? '🔄 連接中...' : '❌ 連接失敗'}
              {selectedModel && <span className="ml-2">• 目前模型: <strong className="text-slate-700 dark:text-slate-200">{selectedModel}</strong></span>}
            </p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* 模型選擇下拉選單 */}
          {availableModels.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              title="選擇要使用的模型"
              className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors cursor-pointer dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-600"
            >
              {/* Gemini 雲端模型 */}
              {availableModels.filter((m) => !m.startsWith('ollama:')).length > 0 && (
                <optgroup label="Gemini (雲端)">
                  {availableModels.filter((m) => !m.startsWith('ollama:')).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </optgroup>
              )}
              {/* Ollama 本機模型 */}
              {availableModels.filter((m) => m.startsWith('ollama:')).length > 0 && (
                <optgroup label="Ollama (本機)">
                  {availableModels.filter((m) => m.startsWith('ollama:')).map((m) => (
                    <option key={m} value={m}>{m.replace('ollama:', '')}</option>
                  ))}
                </optgroup>
              )}
            </select>
          )}

          {/* 主題切換按鈕 */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
            title={theme === 'light' ? '切換到深色模式' : '切換到淺色模式'}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          {/* 清除目前對話歷史 */}
          <button
            onClick={clearHistory}
            className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200 dark:bg-red-600 dark:hover:bg-red-500"
          >
            <Trash2 size={16} />
            <span className="hidden sm:inline">清除對話</span>
          </button>
        </div>
      </div>

      {/* 儲存空間不足提示橫幅 */}
      {storageFull && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-3 flex items-center justify-between gap-3 dark:bg-amber-900/30 dark:border-amber-800/50">
          <div className="flex items-center space-x-2 text-sm text-amber-800 dark:text-amber-200 min-w-0">
            <AlertCircle size={18} className="flex-shrink-0" />
            <span>瀏覽器儲存空間已滿，新的對話可能無法保存。請刪除一些舊對話以釋放空間。</span>
          </div>
          <button
            onClick={deleteOldestConversation}
            className="flex-shrink-0 flex items-center space-x-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm"
          >
            <Trash2 size={14} />
            <span>刪除最舊對話</span>
          </button>
        </div>
      )}

      {/* 訊息顯示區域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ paddingBottom: '20px' }}>
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`${getMessageClass(message)} relative group`}>
              <div className="flex items-start space-x-3">
                <MessageIcon sender={message.sender} isError={message.isError} isFile={message.isFile} />
                <div className="flex-1 min-w-0">
                  {message.isFile && !message.isError && (
                    <div className="flex items-center space-x-1 mb-1">
                      <FileText size={14} className="text-current opacity-75" />
                      <span className="text-xs font-medium opacity-75">文件</span>
                    </div>
                  )}
                  <MessageContent text={message.text} />
                  <div className={`text-xs mt-2 opacity-60 ${message.sender === 'user' ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                    {message.timestamp}
                  </div>
                </div>
              </div>
              {message.sender === 'bot' && !message.isError && (
                <CopyButton textToCopy={message.text} />
              )}
            </div>
          </div>
        ))}

        {isLoading && <TypingIndicator />}
        {/* 這個 div 作為一個錨點，用於滾動到最底部 */}
        <div ref={messagesEndRef} />
      </div>

      {selectedFile && !isLoading && (
        // 已選擇文件的提示欄
        <div className="bg-blue-100 border-t border-blue-200 p-2 px-4 flex items-center justify-between animate-fade-in-fast dark:bg-blue-900/30 dark:border-blue-800/50">
          <div className="flex items-center space-x-2 text-sm text-blue-700 dark:text-blue-300">
            <FileText size={16} />
            <span>已選擇文件: <strong>{selectedFile.name}</strong></span>
          </div>
          <button onClick={clearFileSelection} className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-200/50 dark:text-blue-400 dark:hover:bg-blue-800/50">
            <Trash2 size={16} />
          </button>
        </div>
      )}

      {/* 底部輸入區域 */}
      <div className="bg-white/80 backdrop-blur-sm border-t border-slate-200 p-4 dark:bg-slate-800/80 dark:border-slate-700">
        <div className="flex space-x-3">
          <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.pdf,.docx" onChange={handleFileSelect} />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors btn-hover-effect dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            title="上傳文件 (支援 TXT, PDF, DOCX)"
          >
            <Upload size={20} />
          </button>
          
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={selectedFile ? "輸入關於文件的問題..." : "輸入你的訊息..."}
            className="flex-1 border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none overflow-y-auto hide-scrollbar dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600 dark:placeholder-slate-400"
            rows="1"
            style={{ maxHeight: '120px' }}
            disabled={isLoading}
          />
          
          <button
            onClick={sendMessage}
            disabled={isLoading || !inputMessage.trim()}
            className="p-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-hover-effect"
            title="發送訊息 (Enter)"
          >
            <Send size={20} />
          </button>
        </div>
        
        <div className="mt-2 text-xs text-slate-500 text-center dark:text-slate-400">
          {selectedFile ? `將連同文件「${selectedFile.name}」一併發送` : '按 Enter 發送 • 按 Shift + Enter 換行 • 支援 TXT, PDF, DOCX 文件上傳'}
        </div>
      </div>
      </div>
    </div>
  );
};

/**
 * 訊息複製按鈕組件 (CopyButton)。
 * 顯示在機器人訊息的右上角，用於複製訊息內容。
 * @param {object} props - 組件屬性。
 * @param {string} props.textToCopy - 要複製的文字。
 */
const CopyButton = ({ textToCopy }) => {
  // 狀態：追蹤是否已複製。
  const [isCopied, setIsCopied] = useState(false);

  // 處理複製事件。
  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-200/50 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-600 dark:text-slate-300 dark:hover:bg-slate-500"
      title={isCopied ? "已複製" : "複製"}
    >
      {isCopied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
};

/**
 * 應用的根組件 (App)。
 * 使用 ThemeProvider 包裹 ChatBot 組件，以啟用全域主題功能。
 */
const App = () => {
  return (
    <ThemeProvider>
      <ChatBot />
    </ThemeProvider>
  );
};

export default App;
