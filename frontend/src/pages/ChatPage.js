import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendChatMessage } from '../services/chatApi';
import { useAuth } from '../context/AuthContext';

const MAX_CHAT_TITLE = 48;
const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
const VOICE_LANGUAGE_OPTIONS = [
  { value: 'en-IN', label: 'English' },
  { value: 'ta-IN', label: 'Tamil' },
  { value: 'hi-IN', label: 'Hindi' },
];

function getSpeechLang(languageName) {
  const normalized = (languageName || '').toLowerCase();
  if (normalized.includes('tamil')) {
    return 'ta-IN';
  }

  if (normalized.includes('hindi')) {
    return 'hi-IN';
  }

  return 'en-IN';
}

function getScriptCategory(char) {
  const code = char.charCodeAt(0);

  if (code >= 0x0b80 && code <= 0x0bff) {
    return 'ta';
  }

  if (code >= 0x0900 && code <= 0x097f) {
    return 'hi';
  }

  if ((code >= 0x0041 && code <= 0x007a) || (code >= 0x00c0 && code <= 0x024f)) {
    return 'en';
  }

  return 'other';
}

function resolveChunkLang(category, fallbackLang) {
  if (category === 'ta') {
    return 'ta-IN';
  }

  if (category === 'hi') {
    return 'hi-IN';
  }

  if (category === 'en') {
    return 'en-IN';
  }

  return fallbackLang || 'en-IN';
}

function splitTextForSpeech(text, fallbackLang) {
  const cleaned = (text || '').trim();
  if (!cleaned) {
    return [];
  }

  const chunks = [];
  let buffer = '';
  let currentCategory = 'other';

  for (const char of cleaned) {
    const nextCategory = getScriptCategory(char);

    if (!buffer) {
      buffer = char;
      currentCategory = nextCategory;
      continue;
    }

    if (nextCategory === currentCategory || nextCategory === 'other' || currentCategory === 'other') {
      buffer += char;
      if (currentCategory === 'other' && nextCategory !== 'other') {
        currentCategory = nextCategory;
      }
      continue;
    }

    chunks.push({
      text: buffer.trim(),
      lang: resolveChunkLang(currentCategory, fallbackLang),
    });
    buffer = char;
    currentCategory = nextCategory;
  }

  if (buffer.trim()) {
    chunks.push({
      text: buffer.trim(),
      lang: resolveChunkLang(currentCategory, fallbackLang),
    });
  }

  return chunks.filter((chunk) => chunk.text.length > 0);
}

function selectVoiceForLang(targetLang) {
  const synth = window.speechSynthesis;
  if (!synth || typeof synth.getVoices !== 'function') {
    return null;
  }

  const voices = synth.getVoices() || [];
  if (!voices.length) {
    return null;
  }

  const primaryPrefix = targetLang.split('-')[0].toLowerCase();
  const directMatch = voices.find((voice) => voice.lang?.toLowerCase() === targetLang.toLowerCase());
  if (directMatch) {
    return directMatch;
  }

  const familyMatch = voices.find((voice) => voice.lang?.toLowerCase().startsWith(primaryPrefix));
  return familyMatch || null;
}

function createMessage(payload) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...payload,
  };
}

function createStarterMessage() {
  return createMessage({
    role: 'assistant',
    title: 'Health Guide',
    text: 'Describe your symptoms. I will respond in the same language and share guidance with precautions.',
  });
}

function buildNewConversation() {
  const createdAt = new Date().toISOString();
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'New chat',
    createdAt,
    updatedAt: createdAt,
    messages: [createStarterMessage()],
  };
}

function getStorageKey(userId) {
  return `ph_chats_${userId}`;
}

function readUserChats(userId) {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function formatTime(isoDate) {
  try {
    return new Date(isoDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return '';
  }
}

function createChatTitle(text) {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return 'New chat';
  }

  if (trimmed.length <= MAX_CHAT_TITLE) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_CHAT_TITLE)}...`;
}

function getLatestUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      return messages[index].text;
    }
  }

  return '';
}

function buildDescriptiveReply(response) {
  const issues = (response.advice?.possibleCauses || []).join(', ');
  const precautions = (response.precautions || []).join(', ');
  const nextStep = response.nextSteps || '';

  const parts = [response.message];

  if (issues) {
    parts.push(`Possible health issues: ${issues}.`);
  }

  if (precautions) {
    parts.push(`Precautions: ${precautions}.`);
  }

  if (nextStep) {
    parts.push(`Recommended next step: ${nextStep}`);
  }

  return parts.join(' ');
}

function getUserInitials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 'U';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
}

export function ChatPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [activeSpeechId, setActiveSpeechId] = useState('');
  const [pendingSpeechId, setPendingSpeechId] = useState('');
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [voiceLocale, setVoiceLocale] = useState('en-IN');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const endRef = useRef(null);
  const recognitionRef = useRef(null);
  const speakingMessageIdRef = useRef('');
  const speechSessionRef = useRef(0);
  const userInitials = useMemo(() => getUserInitials(user.name), [user.name]);

  const stopSpeechPlayback = () => {
    speechSessionRef.current += 1;
    window.speechSynthesis.cancel();
    speakingMessageIdRef.current = '';
    setActiveSpeechId('');
    setPendingSpeechId('');
  };

  useEffect(() => {
    const existingChats = readUserChats(user.id);
    if (existingChats.length > 0) {
      setChats(existingChats);
      setActiveChatId(existingChats[0].id);
      return;
    }

    const newConversation = buildNewConversation();
    setChats([newConversation]);
    setActiveChatId(newConversation.id);
  }, [user.id]);

  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem(getStorageKey(user.id), JSON.stringify(chats));
    }
  }, [chats, user.id]);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) || null,
    [chats, activeChatId]
  );

  const messages = useMemo(() => activeChat?.messages || [], [activeChat]);

  const filteredChats = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) {
      return chats;
    }

    return chats.filter((chat) => {
      const haystack = `${chat.title} ${chat.messages.map((message) => message.text).join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [chats, searchText]);

  const hasConversation = useMemo(
    () => messages.some((message) => message.role === 'user' || Boolean(message.meta)),
    [messages]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(
    () => () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }

      stopSpeechPlayback();
    },
    []
  );

  useEffect(() => {
    stopSpeechPlayback();
  }, [activeChatId]);

  const updateChatById = (chatId, updater) => {
    setChats((currentChats) =>
      currentChats.map((chat) => {
        if (chat.id !== chatId) {
          return chat;
        }

        return updater(chat);
      })
    );
  };

  const handleNewChat = () => {
    stopSpeechPlayback();
    const newConversation = buildNewConversation();
    setChats((currentChats) => [newConversation, ...currentChats]);
    setActiveChatId(newConversation.id);
    setError('');
    setInputValue('');
  };

  const handleDeleteChat = (chatId) => {
    stopSpeechPlayback();
    setChats((currentChats) => {
      const nextChats = currentChats.filter((chat) => chat.id !== chatId);
      if (nextChats.length === 0) {
        const replacement = buildNewConversation();
        setActiveChatId(replacement.id);
        return [replacement];
      }

      if (activeChatId === chatId) {
        setActiveChatId(nextChats[0].id);
      }

      return nextChats;
    });
  };

  const submitMessage = async () => {
    const content = inputValue.trim();
    if (!content || isLoading || !activeChatId) {
      return;
    }

    stopSpeechPlayback();

    const targetChatId = activeChatId;
    const userMessage = createMessage({ role: 'user', text: content });

    updateChatById(targetChatId, (chat) => {
      const nextTitle = chat.title === 'New chat' ? createChatTitle(content) : chat.title;
      return {
        ...chat,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
        messages: [...chat.messages, userMessage],
      };
    });

    setInputValue('');
    setError('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(content);
      const assistantMessage = createMessage({
        role: 'assistant',
        title: response.title,
        text: buildDescriptiveReply(response),
        meta: {
          urgent: response.urgent,
        },
      });

      updateChatById(targetChatId, (chat) => ({
        ...chat,
        updatedAt: new Date().toISOString(),
        messages: [...chat.messages, assistantMessage],
      }));
    } catch (requestError) {
      setError('Unable to reach the NLP backend. Start backend on port 8000 and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitMessage();
  };

  const handleVoiceInput = () => {
    if (!SpeechRecognitionApi) {
      setError('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognitionRef.current = recognition;
    recognition.lang = voiceLocale;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError('');
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();

      if (transcript) {
        setInputValue(transcript);
      }
    };

    recognition.onerror = () => {
      setError('Could not capture voice. Try again or switch voice language to English, Tamil, or Hindi.');
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.start();
  };

  const handleSpeakMessage = (message) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      setError('Text to speech is not supported in this browser.');
      return;
    }

    const textToSpeak = (message.text || '').trim();
    if (!textToSpeak) {
      return;
    }

    if (activeSpeechId === message.id) {
      stopSpeechPlayback();
      return;
    }

    stopSpeechPlayback();
    synth.resume();

    const fallbackLang = getSpeechLang(message.meta?.languageName);
    const chunks = splitTextForSpeech(textToSpeak, fallbackLang);
    if (chunks.length === 0) {
      return;
    }

    const sessionId = speechSessionRef.current + 1;
    speechSessionRef.current = sessionId;
    speakingMessageIdRef.current = message.id;
    setActiveSpeechId(message.id);
    setPendingSpeechId(message.id);

    const speakChunk = (index) => {
      if (speechSessionRef.current !== sessionId) {
        return;
      }

      if (index >= chunks.length) {
        if (speechSessionRef.current === sessionId) {
          speakingMessageIdRef.current = '';
          setActiveSpeechId('');
          setPendingSpeechId('');
        }
        return;
      }

      const chunk = chunks[index];
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      utterance.lang = chunk.lang;
      utterance.rate = 1;
      utterance.pitch = 1;

      const selectedVoice = selectVoiceForLang(chunk.lang);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onend = () => {
        if (speechSessionRef.current === sessionId) {
          if (index === 0) {
            setPendingSpeechId('');
          }
          speakChunk(index + 1);
        }
      };

      utterance.onerror = () => {
        if (speechSessionRef.current === sessionId) {
          speakingMessageIdRef.current = '';
          setActiveSpeechId('');
          setPendingSpeechId('');
          setError('Unable to play voice output for this message.');
        }
      };

      synth.speak(utterance);
    };

    speakChunk(0);
  };

  const handleComposerKeyDown = async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await submitMessage();
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className={`chat-layout ${isSidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className={`chat-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-scroll">
          <p className="brand">AI Public Heath Chat Bot</p>

          <div className="sidebar-section">
            <p className="sidebar-label">New chat</p>
            <button type="button" className="new-chat-button" onClick={handleNewChat}>
              ✎ New chat
            </button>
          </div>

          <div className="sidebar-section">
            <p className="sidebar-label">Search chat</p>
            <label className="chat-search-wrap" htmlFor="chat-search-input">
              <span>⌕</span>
              <input
                id="chat-search-input"
                className="chat-search"
                type="text"
                placeholder="Search chats"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </label>
          </div>

          <div className="chat-history-list" aria-label="Saved chats">
            {filteredChats.map((chat) => {
              const preview = getLatestUserMessage(chat.messages) || 'No messages yet';
              return (
                <div key={chat.id} className={`chat-history-item ${activeChatId === chat.id ? 'active' : ''}`}>
                  <button type="button" onClick={() => setActiveChatId(chat.id)}>
                    <strong>{chat.title}</strong>
                    <span>{preview}</span>
                  </button>
                  <button
                    type="button"
                    className="delete-chat-button"
                    onClick={() => handleDeleteChat(chat.id)}
                    aria-label={`Delete ${chat.title}`}
                  >
                    x
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="user-card">
          <div className="user-profile-row">
            <div className="user-avatar" aria-hidden="true">
              {userInitials}
            </div>
            <div className="user-meta">
              <p>Signed in</p>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <section className="chat-main">
        <header className="chat-topbar">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setIsSidebarOpen((current) => !current)}
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <span className="icon-text" aria-hidden="true">
              {isSidebarOpen ? '◀' : '▶'}
            </span>
          </button>
          <h2>AI Public Heath Chat Bot</h2>
          <div className="topbar-actions">
            <div className="topbar-profile" title={user.email}>
              <div className="user-avatar" aria-hidden="true">
                {userInitials}
              </div>
              <strong>{user.name}</strong>
            </div>
          </div>
        </header>

        <div className="chat-thread" role="log" aria-live="polite">
          {!hasConversation ? <h3 className="empty-state-title">Ready when you are.</h3> : null}
          {(hasConversation ? messages : []).map((message) => (
            <article key={message.id} className={`chat-bubble ${message.role}`}>
              {message.role === 'assistant' ? (
                <>
                  <div className="bubble-header">
                    <p className="bubble-title">{message.title || 'Health Guide'}</p>
                    <button
                      type="button"
                      className="speak-button"
                      onClick={() => handleSpeakMessage(message)}
                      aria-label={activeSpeechId === message.id ? 'Stop reading aloud' : 'Read aloud'}
                      title={activeSpeechId === message.id ? 'Stop reading aloud' : 'Read aloud'}
                    >
                      <span className="icon-text" aria-hidden="true">
                        {activeSpeechId === message.id
                          ? pendingSpeechId === message.id
                            ? '⏳'
                            : '🔇'
                          : '🔊'}
                      </span>
                    </button>
                  </div>
                  <p>{message.text}</p>
                  <p className="bubble-time">{formatTime(message.timestamp)}</p>
                </>
              ) : (
                <>
                  <p>{message.text}</p>
                  <p className="bubble-time">{formatTime(message.timestamp)}</p>
                </>
              )}
            </article>
          ))}
          {isLoading ? (
            <article className="chat-bubble assistant">
              <p className="bubble-title">Health Guide</p>
              <p>Analyzing symptoms...</p>
            </article>
          ) : null}
          <div ref={endRef} />
        </div>

        <form className="chat-composer" onSubmit={handleSubmit}>
          <div className="prompt-shell">
            <textarea
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask anything"
              rows="1"
            />
            <div className="prompt-actions">
              <label className="voice-lang-wrap" htmlFor="voice-lang-select">
                <span>Voice</span>
                <select
                  id="voice-lang-select"
                  className="voice-lang-select"
                  value={voiceLocale}
                  onChange={(event) => setVoiceLocale(event.target.value)}
                >
                  {VOICE_LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`voice-button ${isListening ? 'listening' : ''}`}
                onClick={handleVoiceInput}
                title="Speak symptoms"
              >
                {isListening ? (
                  <span className="icon-text" aria-hidden="true">⏹</span>
                ) : (
                  <svg className="icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.07A7 7 0 0 1 5 12a1 1 0 1 1 2 0 5 5 0 1 0 10 0Z" />
                  </svg>
                )}
              </button>
              <button type="submit" className="send-button" disabled={isLoading || !inputValue.trim()}>
                {isLoading ? 'Sending...' : '➤'}
              </button>
            </div>
          </div>
          <div className="composer-row">
            <p>
              {error ||
                'Use Voice to Text to dictate symptoms. Click Play voice on any assistant reply for text to speech.'}
            </p>
          </div>
        </form>
      </section>
    </main>
  );
}