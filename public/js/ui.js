/**
 * public/js/ui.js
 * Comprehensive UI management: DOM controls, ChatGPT-style sidebar, "For You" drawer,
 * theme toggle, real-time synchronized streaming text rendering, toasts, and dialogs.
 */

import { formatRelativeTime } from './history.js';

// Cache all primary DOM elements
export const elements = {
  // Main chat elements
  chatStream: document.getElementById('chat-stream'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  btnSend: document.getElementById('btn-send'),
  btnMic: document.getElementById('btn-mic'),
  btnStop: document.getElementById('btn-stop'),
  btnAbout: document.getElementById('btn-about'),
  aboutDialog: document.getElementById('about-dialog'),
  btnCloseDialog: document.getElementById('btn-close-dialog'),
  btnDialogDone: document.getElementById('btn-dialog-done'),
  chipsContainer: document.getElementById('chips-container'),
  statusText: document.getElementById('status-text'),
  statusTimer: document.getElementById('status-timer'),
  toastRegion: document.getElementById('toast-region'),

  // Header controls
  btnMenuToggle: document.getElementById('btn-menu-toggle'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  btnForYouHeader: document.getElementById('btn-for-you-header'),
  voiceSelect: document.getElementById('voice-select'),

  // Sidebar elements
  chatSidebar: document.getElementById('chat-sidebar'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  btnCloseSidebar: document.getElementById('btn-close-sidebar'),
  btnNewChatSidebar: document.getElementById('btn-new-chat-sidebar'),
  sidebarSearch: document.getElementById('sidebar-search'),
  sidebarHistoryList: document.getElementById('sidebar-history-list'),
  sidebarActiveVoiceName: document.getElementById('sidebar-active-voice-name'),
  btnOpenForYouSidebar: document.getElementById('btn-open-for-you-sidebar'),
  btnClearAllChats: document.getElementById('btn-clear-all-chats'),

  // "For You" drawer elements
  forYouDrawer: document.getElementById('for-you-drawer'),
  btnCloseForYou: document.getElementById('btn-close-for-you'),
  exploredCount: document.getElementById('explored-count'),
  totalTopics: document.getElementById('total-topics'),
  topicsGrid: document.getElementById('topics-grid'),
  recommendationsList: document.getElementById('recommendations-list'),
  highlightsGrid: document.getElementById('highlights-grid')
};

let currentToastTimeout = null;

// SVG Icons for Theme Toggle
const SUN_ICON = `
  <svg class="icon-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="5"></circle>
    <line x1="12" y1="1" x2="12" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line>
    <line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
`;

const MOON_ICON = `
  <svg class="icon-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
  </svg>
`;

/**
 * Initializes and manages Theme Toggle
 */
export function initThemeToggle() {
  const { btnThemeToggle } = elements;
  if (!btnThemeToggle) return;

  function updateIcon(theme) {
    btnThemeToggle.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;
    btnThemeToggle.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btnThemeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  // Detect current active theme
  const currentTheme = document.documentElement.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

  updateIcon(currentTheme);

  btnThemeToggle.addEventListener('click', () => {
    const active = document.documentElement.getAttribute('data-theme') || 'light';
    const next = active === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('bhushan_theme', next);
    } catch (e) {}
    updateIcon(next);
  });
}

/**
 * Updates the voice indicator display across UI controls
 * @param {string} voiceName
 */
export function updateVoiceIndicator(voiceName) {
  const { voiceSelect, sidebarActiveVoiceName } = elements;
  if (voiceSelect && voiceSelect.value !== voiceName) {
    voiceSelect.value = voiceName;
  }
  if (sidebarActiveVoiceName) {
    const labels = {
      Puck: 'Puck (Young Male)',
      Charon: 'Charon (Deep Male)',
      Fenrir: 'Fenrir (Confident Male)',
      Aoede: 'Aoede (Warm Expressive)',
      Kore: 'Kore (Clear Bright)',
      device: 'Device Voice (Free / Fast)'
    };
    sidebarActiveVoiceName.textContent = labels[voiceName] || voiceName;
  }
}

/**
 * Sidebar Drawer controls (responsive for desktop and mobile)
 */
export function toggleSidebar() {
  const { chatSidebar, sidebarBackdrop } = elements;
  if (!chatSidebar) return;

  if (window.innerWidth <= 900) {
    const isOpen = chatSidebar.classList.toggle('open');
    if (sidebarBackdrop) {
      sidebarBackdrop.classList.toggle('open', isOpen);
    }
  } else {
    chatSidebar.classList.toggle('collapsed');
  }
}

export function closeSidebar() {
  const { chatSidebar, sidebarBackdrop } = elements;
  if (chatSidebar) chatSidebar.classList.remove('open');
  if (sidebarBackdrop) sidebarBackdrop.classList.remove('open');
}

/**
 * Renders the conversation history list in the sidebar
 * @param {Array<Object>} chats
 * @param {string} activeChatId
 * @param {string} searchQuery
 * @param {Function} onSelectChat
 * @param {Function} onDeleteChat
 */
export function renderSidebarHistory(chats = [], activeChatId = '', searchQuery = '', onSelectChat, onDeleteChat) {
  const { sidebarHistoryList } = elements;
  if (!sidebarHistoryList) return;

  sidebarHistoryList.innerHTML = '';

  const cleanQuery = searchQuery.trim().toLowerCase();
  const filtered = cleanQuery
    ? chats.filter(c =>
        c.title.toLowerCase().includes(cleanQuery) ||
        c.history.some(m => m.text.toLowerCase().includes(cleanQuery))
      )
    : chats;

  if (filtered.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.style.padding = '1rem 0.5rem';
    emptyState.style.color = 'var(--text-sidebar-muted)';
    emptyState.style.fontSize = '0.8rem';
    emptyState.style.textAlign = 'center';
    emptyState.textContent = cleanQuery ? 'No matching conversations.' : 'No conversations yet.';
    sidebarHistoryList.appendChild(emptyState);
    return;
  }

  filtered.forEach(chat => {
    const item = document.createElement('div');
    item.className = `history-item ${chat.id === activeChatId ? 'active' : ''}`;
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');

    const content = document.createElement('div');
    content.className = 'history-item-content';

    const title = document.createElement('span');
    title.className = 'history-item-title';
    title.textContent = chat.title || 'Conversation';

    const time = document.createElement('span');
    time.className = 'history-item-time';
    time.textContent = formatRelativeTime(chat.updatedAt || chat.createdAt);

    content.appendChild(title);
    content.appendChild(time);
    item.appendChild(content);

    // Delete button
    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-delete-chat';
    btnDelete.setAttribute('aria-label', 'Delete conversation');
    btnDelete.setAttribute('title', 'Delete conversation');
    btnDelete.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;

    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onDeleteChat) onDeleteChat(chat.id);
    });

    item.appendChild(btnDelete);

    item.addEventListener('click', () => {
      if (onSelectChat) onSelectChat(chat.id);
      if (window.innerWidth <= 900) closeSidebar();
    });

    sidebarHistoryList.appendChild(item);
  });
}

/**
 * "For You" slide-over drawer controls
 */
export function openForYouDrawer() {
  if (elements.forYouDrawer) {
    elements.forYouDrawer.classList.add('open');
  }
}

export function closeForYouDrawer() {
  if (elements.forYouDrawer) {
    elements.forYouDrawer.classList.remove('open');
  }
}

/**
 * Renders the "For You" insights panel
 * @param {Object} recData - Output of generateRecommendations
 * @param {Function} onSelectQuestion - Callback when a question or highlight is selected
 */
export function renderForYouSection(recData, onSelectQuestion) {
  const {
    exploredCount,
    totalTopics,
    topicsGrid,
    recommendationsList,
    highlightsGrid
  } = elements;

  if (!recData) return;

  if (exploredCount) exploredCount.textContent = recData.exploredCount;
  if (totalTopics) totalTopics.textContent = recData.totalTopics;

  // 1. Render Topics
  if (topicsGrid) {
    topicsGrid.innerHTML = '';
    const allTopics = [...recData.exploredTopics, ...recData.unexploredTopics];

    allTopics.forEach(topic => {
      const isExplored = recData.exploredTopics.some(t => t.id === topic.id);
      const badge = document.createElement('span');
      badge.className = `topic-badge ${isExplored ? 'explored' : ''}`;
      badge.textContent = `${isExplored ? '✓ ' : '○ '}${topic.name}`;
      topicsGrid.appendChild(badge);
    });
  }

  // 2. Render Recommended Questions
  if (recommendationsList) {
    recommendationsList.innerHTML = '';

    recData.recommendedQuestions.forEach(item => {
      const card = document.createElement('div');
      card.className = 'rec-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      const tag = document.createElement('span');
      tag.className = 'rec-tag';
      tag.textContent = item.tag;

      const question = document.createElement('p');
      question.className = 'rec-question';
      question.textContent = item.question;

      card.appendChild(tag);
      card.appendChild(question);

      card.addEventListener('click', () => {
        closeForYouDrawer();
        if (onSelectQuestion) onSelectQuestion(item.question);
      });

      recommendationsList.appendChild(card);
    });
  }

  // 3. Render Portfolio Highlights
  if (highlightsGrid) {
    highlightsGrid.innerHTML = '';

    recData.highlights.forEach(highlight => {
      const card = document.createElement('div');
      card.className = 'highlight-card';
      card.style.cursor = 'pointer';

      const metric = document.createElement('span');
      metric.className = 'highlight-metric';
      metric.textContent = highlight.metric;

      const title = document.createElement('h4');
      title.className = 'highlight-title';
      title.textContent = highlight.title;

      const desc = document.createElement('p');
      desc.className = 'highlight-desc';
      desc.textContent = highlight.description;

      const promptLink = document.createElement('span');
      promptLink.style.display = 'inline-block';
      promptLink.style.marginTop = '0.4rem';
      promptLink.style.fontSize = '0.75rem';
      promptLink.style.fontWeight = '600';
      promptLink.style.color = 'var(--accent-primary)';
      promptLink.textContent = 'Ask Bhushan about this →';

      card.appendChild(metric);
      card.appendChild(title);
      card.appendChild(desc);
      card.appendChild(promptLink);

      card.addEventListener('click', () => {
        closeForYouDrawer();
        if (onSelectQuestion) onSelectQuestion(highlight.promptQuestion);
      });

      highlightsGrid.appendChild(card);
    });
  }
}

/**
 * Updates the interaction state of the mic and controls
 * @param {'idle' | 'listening' | 'thinking' | 'speaking'} state
 */
export function setControlState(state) {
  const { btnMic, btnStop, statusText, statusTimer } = elements;
  if (!btnMic) return;

  btnMic.classList.remove('idle', 'listening', 'thinking', 'speaking');
  btnMic.classList.add(state);

  switch (state) {
    case 'idle':
      if (statusText) statusText.textContent = 'Ready to talk';
      if (statusTimer) statusTimer.hidden = true;
      if (btnStop) btnStop.hidden = true;
      btnMic.disabled = false;
      break;

    case 'listening':
      if (statusText) statusText.textContent = 'Listening...';
      if (statusTimer) {
        statusTimer.hidden = false;
        statusTimer.textContent = '00:00';
      }
      if (btnStop) btnStop.hidden = true;
      btnMic.disabled = false;
      break;

    case 'thinking':
      if (statusText) statusText.textContent = 'Bhushan is thinking...';
      if (statusTimer) statusTimer.hidden = true;
      if (btnStop) btnStop.hidden = true;
      btnMic.disabled = true;
      break;

    case 'speaking':
      if (statusText) statusText.textContent = 'Bhushan is speaking...';
      if (statusTimer) statusTimer.hidden = true;
      if (btnStop) btnStop.hidden = false;
      btnMic.disabled = false;
      break;
  }
}

/**
 * Updates the audio recording timer display
 * @param {number} totalSeconds
 */
export function updateTimerDisplay(totalSeconds) {
  if (!elements.statusTimer) return;
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  elements.statusTimer.textContent = `${mins}:${secs}`;
}

/**
 * Appends a static completed conversation bubble (for user messages or past history)
 * @param {'user' | 'bot'} role
 * @param {string} text
 * @param {Function} [onTellMore]
 */
export function appendMessage(role, text, onTellMore = null) {
  const row = document.createElement('div');
  row.className = `chat-bubble-row ${role}`;

  const sender = document.createElement('span');
  sender.className = 'bubble-sender';
  sender.textContent = role === 'user' ? 'Recruiter' : 'Bhushan';
  row.appendChild(sender);

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = text; // Safe textContent against XSS
  row.appendChild(bubble);

  if (role === 'bot' && onTellMore) {
    const actions = document.createElement('div');
    actions.className = 'bubble-actions';

    const btnTellMore = document.createElement('button');
    btnTellMore.className = 'btn-tell-more';
    btnTellMore.textContent = 'Tell me more';
    btnTellMore.addEventListener('click', () => {
      btnTellMore.disabled = true;
      onTellMore();
    });

    actions.appendChild(btnTellMore);
    row.appendChild(actions);
  }

  elements.chatStream.appendChild(row);
  scrollToBottom();
  return row;
}

/**
 * Creates and mounts a synchronized streaming message bubble for live responses.
 * Words start unrevealed and stream progressively synchronized with speech.
 * @param {Array<Object>} words - Array of tokenized words from audio.prepareSynchronizedText
 * @param {Function} [onTellMore]
 * @returns {Object} Streaming controller { updateSpokenWord, completeStreaming }
 */
export function createSynchronizedStreamingMessage(words, onTellMore = null) {
  const row = document.createElement('div');
  row.className = 'chat-bubble-row bot';

  const sender = document.createElement('span');
  sender.className = 'bubble-sender';
  sender.textContent = 'Bhushan';
  row.appendChild(sender);

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble bot';

  // Group words into sentences
  const sentenceMap = new Map();
  words.forEach(w => {
    if (!sentenceMap.has(w.sentenceIndex)) {
      sentenceMap.set(w.sentenceIndex, []);
    }
    sentenceMap.get(w.sentenceIndex).push(w);
  });

  const wordDoms = [];
  const sentenceDoms = [];

  sentenceMap.forEach((sentenceWords, sIdx) => {
    const sSpan = document.createElement('span');
    sSpan.className = `sentence sentence-${sIdx}`;

    sentenceWords.forEach(w => {
      const wSpan = document.createElement('span');
      wSpan.className = 'word';
      if (w.isKeyword) {
        wSpan.classList.add('keyword-highlight');
      }
      wSpan.textContent = w.rawText + ' ';
      wSpan.dataset.wordIdx = w.globalIndex;
      sSpan.appendChild(wSpan);

      wordDoms.push({
        dom: wSpan,
        word: w,
        sentenceDom: sSpan
      });
    });

    sentenceDoms.push(sSpan);
    bubble.appendChild(sSpan);
  });

  row.appendChild(bubble);

  // Tell me more action button (hidden until playback ends or is completed)
  let actionsContainer = null;
  let btnTellMore = null;

  if (onTellMore) {
    actionsContainer = document.createElement('div');
    actionsContainer.className = 'bubble-actions';
    actionsContainer.style.display = 'none';

    btnTellMore = document.createElement('button');
    btnTellMore.className = 'btn-tell-more';
    btnTellMore.textContent = 'Tell me more';
    btnTellMore.addEventListener('click', () => {
      btnTellMore.disabled = true;
      onTellMore();
    });

    actionsContainer.appendChild(btnTellMore);
    row.appendChild(actionsContainer);
  }

  elements.chatStream.appendChild(row);
  scrollToBottom();

  let activeSentenceDom = null;
  let currentSpokenDom = null;

  return {
    rowElement: row,
    bubbleElement: bubble,

    /**
     * Called on each frame or audio clock tick
     * @param {number} elapsedSeconds
     * @param {number} totalSeconds
     */
    updateSpokenWord(elapsedSeconds, totalSeconds) {
      if (elapsedSeconds >= totalSeconds && totalSeconds > 0) {
        this.completeStreaming();
        return;
      }

      for (let i = 0; i < wordDoms.length; i++) {
        const item = wordDoms[i];
        const w = item.word;

        if (elapsedSeconds >= w.startTime && elapsedSeconds < w.endTime) {
          // Current spoken word
          if (currentSpokenDom !== item.dom) {
            if (currentSpokenDom) {
              currentSpokenDom.classList.remove('current-spoken-word');
            }
            item.dom.classList.add('spoken', 'current-spoken-word');
            currentSpokenDom = item.dom;
          }

          // Active sentence
          if (activeSentenceDom !== item.sentenceDom) {
            if (activeSentenceDom) {
              activeSentenceDom.classList.remove('active-sentence');
            }
            item.sentenceDom.classList.add('active-sentence');
            activeSentenceDom = item.sentenceDom;
          }
        } else if (elapsedSeconds >= w.endTime) {
          // Past spoken word
          item.dom.classList.add('spoken');
          if (item.dom === currentSpokenDom) {
            item.dom.classList.remove('current-spoken-word');
          }
        }
      }

      scrollToBottom();
    },

    /**
     * Instantly reveals all words (e.g. when playback ends, is stopped, or on error)
     */
    completeStreaming() {
      wordDoms.forEach(item => {
        item.dom.classList.add('spoken');
        item.dom.classList.remove('current-spoken-word');
      });

      sentenceDoms.forEach(sDom => {
        sDom.classList.remove('active-sentence');
      });

      if (actionsContainer) {
        actionsContainer.style.display = 'flex';
      }

      scrollToBottom();
    }
  };
}

/**
 * Clears the chat stream and re-inserts the welcome prompt
 */
export function clearChatStream() {
  elements.chatStream.innerHTML = `
    <div class="welcome-card">
      <p>👋 <strong>Welcome!</strong> I'm an AI voice version of Bhushan, speaking with a natural young male voice and synchronized text. Tap any example question above, ask by voice with the microphone, or type below.</p>
    </div>
  `;
}

/**
 * Scrolls the chat log to the latest message smoothly
 */
export function scrollToBottom() {
  if (elements.chatStream) {
    elements.chatStream.scrollTop = elements.chatStream.scrollHeight;
  }
}

/**
 * Displays a friendly floating toast notification
 * @param {string} message
 * @param {number} [duration=4000]
 */
export function showToast(message, duration = 4000) {
  if (!elements.toastRegion) return;

  if (currentToastTimeout) {
    clearTimeout(currentToastTimeout);
  }

  elements.toastRegion.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;

  elements.toastRegion.appendChild(toast);

  // Trigger CSS transition
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  currentToastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

/**
 * Initializes the About dialog events
 */
export function initDialog() {
  const { btnAbout, aboutDialog, btnCloseDialog, btnDialogDone } = elements;

  if (btnAbout && aboutDialog) {
    btnAbout.addEventListener('click', () => {
      aboutDialog.showModal();
    });

    const closeDialog = () => aboutDialog.close();

    if (btnCloseDialog) btnCloseDialog.addEventListener('click', closeDialog);
    if (btnDialogDone) btnDialogDone.addEventListener('click', closeDialog);

    aboutDialog.addEventListener('click', (e) => {
      if (e.target === aboutDialog) closeDialog();
    });
  }
}
