/**
 * public/js/history.js
 * Multi-session conversation management with localStorage persistence and sliding context windows.
 */

const STORAGE_KEY = 'bhushan_voice_bot_chats_v1';
const ACTIVE_ID_KEY = 'bhushan_voice_bot_active_id';

/**
 * Generates a concise title from the user's initial question
 */
export function generateChatTitle(firstMessage) {
  if (!firstMessage) return 'New Conversation';
  const clean = firstMessage.trim().replace(/^[^\w]+/, '');
  const lower = clean.toLowerCase();

  if (lower.includes('life story')) return 'Life Story & Background';
  if (lower.includes('superpower')) return 'Superpower: Root Cause';
  if (lower.includes('grow') || lower.includes('growth')) return 'Growth Areas in AI';
  if (lower.includes('misconception')) return 'Coworker Perceptions';
  if (lower.includes('push') || lower.includes('limit') || lower.includes('boundar')) return 'Pushing Technical Limits';
  if (lower.includes('fci ccm') || lower.includes('varta')) return 'Work at FCI CCM';
  if (lower.includes('pipeline') || lower.includes('databricks')) return 'Data Pipelines & Scale';
  if (lower.includes('salary')) return 'Compensation Discussion';
  if (lower.includes('education') || lower.includes('iit') || lower.includes('iim')) return 'Education: IIT & IIM';
  if (lower.includes('java')) return 'Java Codebase RAG Project';

  return clean.length > 36 ? `${clean.slice(0, 33).trim()}...` : clean;
}

/**
 * Loads all saved chat sessions from localStorage
 * @returns {Array<Object>}
 */
export function loadAllChats() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to load chats from localStorage:', err);
    return [];
  }
}

/**
 * Saves the conversation list to localStorage
 */
function saveAllChats(chats) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch (err) {
    console.warn('Failed to save chats to localStorage:', err);
  }
}

/**
 * Gets the current active conversation ID
 */
export function getActiveChatId() {
  return localStorage.getItem(ACTIVE_ID_KEY);
}

/**
 * Sets the active conversation ID
 */
export function setActiveChatId(id) {
  if (id) {
    localStorage.setItem(ACTIVE_ID_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_ID_KEY);
  }
}

/**
 * Retrieves the currently active conversation, or creates one if none exists
 */
export function getActiveChat() {
  const chats = loadAllChats();
  const activeId = getActiveChatId();

  if (activeId) {
    const found = chats.find(c => c.id === activeId);
    if (found) return found;
  }

  // If chats exist but none active, activate the most recent one
  if (chats.length > 0) {
    setActiveChatId(chats[0].id);
    return chats[0];
  }

  // Otherwise create a fresh default chat
  return createNewChat('Welcome Session');
}

/**
 * Creates and saves a new conversation
 */
export function createNewChat(initialTitle = 'New Conversation') {
  const chats = loadAllChats();
  const newChat = {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: initialTitle,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    history: []
  };

  chats.unshift(newChat);
  saveAllChats(chats);
  setActiveChatId(newChat.id);
  return newChat;
}

/**
 * Adds a message turn to the active conversation
 */
export function addMessageToActiveChat(role, text) {
  const chats = loadAllChats();
  const activeId = getActiveChatId();
  let chat = chats.find(c => c.id === activeId);

  if (!chat) {
    chat = createNewChat(generateChatTitle(text));
    chats.unshift(chat);
  }

  // If this is the first user message, update title
  if (role === 'user' && (chat.title === 'New Conversation' || chat.title === 'Welcome Session')) {
    chat.title = generateChatTitle(text);
  }

  chat.history.push({
    role,
    text,
    timestamp: Date.now()
  });
  chat.updatedAt = Date.now();

  // Re-sort chats by updatedAt desc
  const filtered = chats.filter(c => c.id !== chat.id);
  filtered.unshift(chat);
  saveAllChats(filtered);

  return chat;
}

/**
 * Deletes a chat by ID
 */
export function deleteChat(id) {
  let chats = loadAllChats();
  chats = chats.filter(c => c.id !== id);
  saveAllChats(chats);

  if (getActiveChatId() === id) {
    if (chats.length > 0) {
      setActiveChatId(chats[0].id);
    } else {
      createNewChat('New Conversation');
    }
  }
}

/**
 * Clears all conversations
 */
export function clearAllChats() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ACTIVE_ID_KEY);
  return createNewChat('New Conversation');
}

/**
 * Formats a relative timestamp
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
