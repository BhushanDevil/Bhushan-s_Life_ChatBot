/**
 * public/js/ui.js
 * UI management: DOM rendering, states, safe text formatting, and toasts.
 */

// Cache DOM elements
export const elements = {
  chatStream: document.getElementById('chat-stream'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  btnSend: document.getElementById('btn-send'),
  btnMic: document.getElementById('btn-mic'),
  btnStop: document.getElementById('btn-stop'),
  btnReset: document.getElementById('btn-reset'),
  btnAbout: document.getElementById('btn-about'),
  aboutDialog: document.getElementById('about-dialog'),
  btnCloseDialog: document.getElementById('btn-close-dialog'),
  btnDialogDone: document.getElementById('btn-dialog-done'),
  chipsContainer: document.getElementById('chips-container'),
  statusText: document.getElementById('status-text'),
  statusTimer: document.getElementById('status-timer'),
  toastRegion: document.getElementById('toast-region')
};

let currentToastTimeout = null;

/**
 * Updates the interaction state of the mic and controls
 * @param {'idle' | 'listening' | 'thinking' | 'speaking'} state
 */
export function setControlState(state) {
  const { btnMic, btnStop, statusText, statusTimer } = elements;

  btnMic.classList.remove('idle', 'listening', 'thinking', 'speaking');
  btnMic.classList.add(state);

  switch (state) {
    case 'idle':
      statusText.textContent = 'Ready to talk';
      statusTimer.hidden = true;
      btnStop.hidden = true;
      btnMic.disabled = false;
      break;

    case 'listening':
      statusText.textContent = 'Listening...';
      statusTimer.hidden = false;
      statusTimer.textContent = '00:00';
      btnStop.hidden = true;
      btnMic.disabled = false;
      break;

    case 'thinking':
      statusText.textContent = 'Bhushan is thinking...';
      statusTimer.hidden = true;
      btnStop.hidden = true;
      btnMic.disabled = true;
      break;

    case 'speaking':
      statusText.textContent = 'Bhushan is speaking...';
      statusTimer.hidden = true;
      btnStop.hidden = false;
      btnMic.disabled = false;
      break;
  }
}

/**
 * Updates the audio recording timer display
 * @param {number} totalSeconds
 */
export function updateTimerDisplay(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  elements.statusTimer.textContent = `${mins}:${secs}`;
}

/**
 * Appends a conversation bubble safely using textContent (safe against XSS)
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
  bubble.textContent = text; // Safe textContent rendering
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
}

/**
 * Clears the chat stream and re-inserts the welcome prompt
 */
export function clearChatStream() {
  elements.chatStream.innerHTML = `
    <div class="welcome-message">
      <p>👋 Hi! I'm an AI voice version of Bhushan. Tap any question above, type below, or tap the microphone to ask anything about my work, projects, and background.</p>
    </div>
  `;
}

/**
 * Scrolls the chat log to the latest message
 */
export function scrollToBottom() {
  elements.chatStream.scrollTop = elements.chatStream.scrollHeight;
}

/**
 * Displays a friendly floating toast notification
 * @param {string} message
 * @param {number} [duration=4000]
 */
export function showToast(message, duration = 4000) {
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
