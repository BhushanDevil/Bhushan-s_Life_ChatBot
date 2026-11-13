/**
 * public/js/app.js
 * Main application logic coordinating UI, history, text queries, and speech.
 */

import { elements, setControlState, appendMessage, clearChatStream, showToast, initDialog } from './ui.js';
import { sendChatMessage } from './api.js';

// Application State
const state = {
  history: [], // [{ role: 'user' | 'model', text: string }] (max 6 turns)
  isProcessing: false
};

/**
 * Adds a message turn to the short-term history (keeps last 6 turns)
 */
function recordTurn(role, text) {
  state.history.push({ role, text });
  if (state.history.length > 6) {
    state.history = state.history.slice(-6);
  }
}

/**
 * Handles sending a text question to the chat API
 */
async function handleTextQuery(queryText) {
  if (state.isProcessing) return;
  const question = queryText.trim();
  if (!question) return;

  state.isProcessing = true;
  setControlState('thinking');

  // Display user's question bubble immediately
  appendMessage('user', question);
  recordTurn('user', question);

  // Clear input field
  elements.chatInput.value = '';

  try {
    const res = await sendChatMessage({
      text: question,
      history: state.history.slice(0, -1) // send history prior to current turn
    });

    if (!res.ok) {
      showToast(res.error?.message || 'Failed to get an answer. Please try again.');
      setControlState('idle');
      state.isProcessing = false;
      return;
    }

    const answerText = res.data.answer;
    recordTurn('model', answerText);

    // Display Bhushan's answer bubble
    appendMessage('bot', answerText, () => {
      handleTextQuery('Could you tell me more about that?');
    });

    // In Prompt 5 (text phase), transition back to idle
    // In Prompt 6, speaking audio is triggered here
    setControlState('idle');
  } catch (err) {
    console.error('Query error:', err);
    showToast('An unexpected error occurred. Please try again.');
    setControlState('idle');
  } finally {
    state.isProcessing = false;
  }
}

/**
 * Clears the conversation and starts fresh
 */
function resetConversation() {
  state.history = [];
  state.isProcessing = false;
  clearChatStream();
  setControlState('idle');
  showToast('Started a new conversation.');
}

/**
 * Initializes the application
 */
function init() {
  initDialog();

  // Handle example question chips
  if (elements.chipsContainer) {
    elements.chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip && chip.dataset.question) {
        handleTextQuery(chip.dataset.question);
      }
    });
  }

  // Handle typing form submission
  if (elements.chatForm) {
    elements.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleTextQuery(elements.chatInput.value);
    });
  }

  // Handle reset button
  if (elements.btnReset) {
    elements.btnReset.addEventListener('click', resetConversation);
  }

  // Mic button in Prompt 5 (wires state transitions; full voice loop connects in Prompt 6)
  if (elements.btnMic) {
    elements.btnMic.addEventListener('click', () => {
      if (state.isProcessing) return;
      showToast('Voice recording is activating. You can also type or tap chips anytime.');
    });
  }

  console.log('Ask Bhushan voice app initialized.');
}

document.addEventListener('DOMContentLoaded', init);
