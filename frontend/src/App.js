import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Upload, Trash2, FileText, User, Bot, AlertCircle, CheckCircle, Info, Copy, Check } from 'lucide-react';
import './App.css';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// API 設定
const API_BASE = 'http://localhost:5002/api';

// 工具函數
const formatTime = () => {
  return new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

// 訊息類型組件
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

// 載入動畫組件
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

// 程式碼區塊組件
const CodeBlock = ({ language, code }) => {
  const [isCopied, setIsCopied] = useState(false);

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

// 訊息內容渲染器
const MessageContent = ({ text }) => {
  const parts = text.split(/(```[\w-]*\n[\s\S]*?```)/);
  return parts.map((part, index) => {
    const match = part.match(/```([\w-]*)\n([\s\S]*?)```/);
    if (match) {
      const language = match[1] || 'plaintext';
      const code = match[2];
      return <CodeBlock key={index} language={language} code={code} />;
    }
    return <div key={index} className="whitespace-pre-wrap text-sm leading-relaxed break-words">{part}</div>;
  });
};

// 主要聊天組件
const ChatBot = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [showHistory, setShowHistory] = useState(false);
  
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // 自動調整 textarea 高度
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${scrollHeight}px`;
    }
  }, [inputMessage]);

  // 添加訊息
  const addMessage = useCallback((message) => {
    setMessages(prev => [...prev, {
      ...message,
      id: Date.now() + Math.random(),
      timestamp: formatTime()
    }]);
  }, []);

  // --- 載入本地歷史或顯示歡迎訊息 ---
  useEffect(() => {
    const savedHistory = localStorage.getItem('chatHistory');
    const history = savedHistory ? JSON.parse(savedHistory) : [];
    
    if (history.length > 0) {
      setMessages(history);
    } else {
      // 使用 setTimeout 來讓歡迎訊息有延遲出現的效果，感覺更自然
      const timer = setTimeout(() => addMessage({ text: '您好！我是您的專屬助理，有什麼可以為您服務的嗎？您可以直接問我問題，或是上傳文件讓我為您分析。', sender: 'bot' }), 500);
      return () => clearTimeout(timer);
    }
  }, [addMessage]);

  // --- 同步本地歷史 ---
  useEffect(() => {
    localStorage.setItem('chatHistory', JSON.stringify(messages));
  }, [messages]);

  // 滾動到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: "smooth",
      block: "end"
    });
  }, []);

  // 健康檢查
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch(`${API_BASE}/health`, {
          credentials: 'include' // 確保發送 session cookie
        });
        if (response.ok) {
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('error');
        }
      } catch (error) {
        setConnectionStatus('error');
        addMessage({
          text: '⚠️ 無法連接到後端服務，請確保後端正在運行於 http://localhost:5002',
          sender: 'system',
          isError: true
        });
      }
    };

    checkConnection();
  }, [addMessage]);

  // 自動滾動
  useEffect(() => {
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [messages, scrollToBottom]);

  // 發送訊息
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

    setInputMessage('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setIsLoading(true);

    addMessage({ 
      text: userFile ? `${userMessage} (文件: ${userFile.name})` : userMessage, 
      sender: 'user',
      isFile: !!userFile,
    });

    try {
      let response;
      if (userFile) {
        // 包含文件和訊息的請求
        const formData = new FormData();
        formData.append('file', userFile);
        formData.append('message', userMessage);
        response = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          body: formData,
          credentials: 'include', // 確保發送 session cookie
        });
      } else {
        // 僅文字的請求
        response = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: userMessage }),
          credentials: 'include', // 確保發送 session cookie
        });
      }

      const data = await response.json().catch(() => {
        throw new Error("從伺服器收到無效的回應格式，預期為 JSON。");
      });

      if (response.ok) {
        addMessage({ text: data.response, sender: 'bot' });
      } else {
        throw new Error(data.error || '發送訊息失敗');
      }
    } catch (error) {
      console.error('發送訊息錯誤:', error);
      addMessage({ text: `錯誤: ${error.message}`, sender: 'bot', isError: true });
    } finally {
      setIsLoading(false);
    }
  };

  // 文件選擇處理
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

  const clearFileSelection = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 清除對話歷史
  const clearHistory = async () => {
    if (!window.confirm('確定要清除所有對話歷史嗎？')) return;

    try {
      const response = await fetch(`${API_BASE}/clear`, { 
        method: 'POST',
        credentials: 'include' // 確保發送 session cookie
      });
      if (response.ok) {
        setMessages([]);
        localStorage.removeItem('chatHistory');
        addMessage({ text: '✅ 對話歷史已清除', sender: 'system' });
      }
    } catch (error) {
      console.error('清除歷史失敗:', error);
      addMessage({ text: '❌ 清除歷史失敗', sender: 'system', isError: true });
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // 如果有輸入文字，就發送
      if (inputMessage.trim()) {
        sendMessage();
      }
    }
  };

  const getMessageClass = (message) => {
    const baseClass = 'max-w-md lg:max-w-2xl px-4 py-3 rounded-lg message-animation ';
    if (message.sender === 'user') return baseClass + 'bg-gradient-to-br from-gray-700 to-gray-900 text-white shadow-md';
    if (message.isError) return baseClass + 'bg-red-50 text-red-700 border border-red-200 error-shake';
    if (message.sender === 'system') return baseClass + 'bg-yellow-50 text-yellow-800 border border-yellow-200';
    return baseClass + 'bg-white text-gray-800 shadow-md border border-gray-100';
  };

  return (

    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-50 to-gray-100 relative">
      
      {/* 標題欄 */}
      <div className="bg-white shadow-lg border-b p-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-full">
            <Bot className="text-blue-600" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">聊天機器人</h1>
            <p className="text-sm text-gray-500">
              連接狀態: {connectionStatus === 'connected' ? '✅ 已連接' : connectionStatus === 'connecting' ? '🔄 連接中...' : '❌ 連接失敗'}
            </p>
          </div>
        </div>
        
        <div className="flex space-x-2">
          {/* 查看歷史紀錄按鈕 */}
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all duration-200"
          >
            <Info size={16} />
            <span className="hidden sm:inline">歷史紀錄</span>
          </button>

                   {/* 清除對話歷史 */}
          <button
            onClick={clearHistory}
            className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200"
          >
            <Trash2 size={16} />
            <span className="hidden sm:inline">清除對話</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ paddingBottom: '20px' }}>
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={getMessageClass(message)}>
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
                  <div className={`text-xs mt-2 opacity-75 ${message.sender === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                    {message.timestamp}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isLoading && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {showHistory && (
        <div className="absolute top-0 right-0 w-80 h-full bg-white shadow-lg border-l z-50 flex flex-col">
          <div className="p-4 flex justify-between items-center border-b">
            <h2 className="font-bold text-gray-700">對話歷史</h2>
            <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-gray-800">關閉</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.length === 0 ? (
              <p className="text-sm text-gray-500">目前沒有歷史訊息。</p>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className="border-b border-gray-200 pb-2">
                  <div className="text-xs text-gray-400">{msg.timestamp} • {msg.sender}</div>
                  <div className="text-sm">{msg.text}</div>
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t">
            <button
              onClick={clearHistory}
              className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-200"
            >
              清除歷史
            </button>
          </div>
        </div>
      )}
      
      {selectedFile && !isLoading && (
        <div className="bg-blue-50 border-t border-blue-200 p-2 px-4 flex items-center justify-between animate-fade-in-fast">
          <div className="flex items-center space-x-2 text-sm text-blue-700">
            <FileText size={16} />
            <span>已選擇文件: <strong>{selectedFile.name}</strong></span>
          </div>
          <button onClick={clearFileSelection} className="text-blue-500 hover:text-blue-700 p-1 rounded-full hover:bg-blue-100">
            <Trash2 size={16} />
          </button>
        </div>
      )}

      <div className="bg-white border-t shadow-lg p-4">
        <div className="flex space-x-3">
          <input ref={fileInputRef} type="file" className="hidden" accept=".txt,.pdf,.docx" onChange={handleFileSelect} />
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-colors btn-hover-effect"
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
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none overflow-y-auto hide-scrollbar"
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
        
        <div className="mt-2 text-xs text-gray-500 text-center">
          {selectedFile ? `將連同文件「${selectedFile.name}」一併發送` : '按 Enter 發送 • 按 Shift + Enter 換行 • 支援 TXT, PDF, DOCX 文件上傳'}
        </div>
      </div>
    </div>
  );
};

export default ChatBot;
