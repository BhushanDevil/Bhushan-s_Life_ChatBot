/**
 * public/js/app.js
 * Main application orchestrator: connects audio recording, speech synthesis,
 * UI states, fallback pipelines, and API messaging.
 */

import {
  elements,
  setControlState,
  updateTimerDisplay,
  appendMessage,
  clearChatStream,
  showToast,
  initDialog
} from './ui.js';
import { sendChatMessage, requestSpeech } from './api.js';
import {
  unlockAudioContext,
  startRecording,
  stopRecording,
  isRecording,
  playWavBase64,
  speakWithDeviceVoice,
  stopPlayback,
  tryBrowserSpeechRecognition
} from './audio.js';

// Application State
const state = {
  history: [], // [{ role: 'user' | 'model', text: string }] (max 6 turns)
  currentState: 'idle', // 'idle' | 'listening' | 'thinking' | 'speaking'
  cachedChips: [] // Cached { question, answer, audioUrl }
};

/**
 * Loads pre-cached answers and audio for the 5 sample questions
 */
async function loadChipsCache() {
  try {
    const res = await fetch('/cache/chips.json');
    if (res.ok) {
      const data = await res.json();
      state.cachedChips = data.chips || [];
      console.log(`Loaded ${state.cachedChips.length} pre-cached chip answers.`);
    }
  } catch (err) {
    console.warn('Could not load chips cache, will use live API:', err);
  }
}

function setState(newState) {
  state.currentState = newState;
  setControlState(newState);
}

/**
 * Appends a message turn to history (capped at 6 recent turns)
 */
function recordTurn(role, text) {
  state.history.push({ role, text });
  if (state.history.length > 6) {
    state.history = state.history.slice(-6);
  }
}

/**
 * Handles playing the spoken voice for an answer (Gemini TTS -> Device Voice fallback)
 */
async function speakAnswer(answerText) {
  if (!answerText) {
    setState('idle');
    return;
  }

  setState('speaking');

  try {
    const ttsRes = await requestSpeech(answerText);

    if (ttsRes.ok && ttsRes.audio) {
      await playWavBase64(ttsRes.audio, () => {
        setState('idle');
      });
      return;
    }
  } catch (err) {
    console.warn('Gemini TTS failed, engaging device voice fallback:', err);
  }

  // Graceful fallback to device voice
  speakWithDeviceVoice(answerText, () => {
    setState('idle');
  });
}

/**
 * Processes a question query (either typed text or recorded audio)
 */
async function processQuery({ text = null, audioWavBase64 = null }) {
  if (state.currentState === 'thinking') return;

  setState('thinking');

  // If text, show user bubble immediately
  if (text) {
    appendMessage('user', text);
    recordTurn('user', text);
    elements.chatInput.value = '';
  }

  try {
    const chatPayload = {
      history: state.history.slice(0, text ? -1 : undefined)
    };

    if (text) chatPayload.text = text;
    if (audioWavBase64) chatPayload.audio = { mimeType: 'audio/wav', data: audioWavBase64 };

    const res = await sendChatMessage(chatPayload);

    if (!res.ok) {
      showToast(res.error?.message || 'Could not get an answer. Please try again.');
      setState('idle');
      return;
    }

    const { question, answer } = res.data;

    // If audio query, show the transcribed question
    if (audioWavBase64 && question && question !== 'unclear') {
      appendMessage('user', question);
      recordTurn('user', question);
    }

    recordTurn('model', answer);

    // Show answer text bubble immediately on screen
    appendMessage('bot', answer, () => {
      handleTextQuery('Please tell me more about that');
    });

    // Start spoken voice output
    await speakAnswer(answer);
  } catch (err) {
    console.error('Chat processing error:', err);
    showToast('An unexpected network error occurred. Please try again.');
    setState('idle');
  }
}

/**
 * Handles chip clicks by checking cache first for instant zero-latency zero-quota response
 */
async function handleChipClick(questionText) {
  unlockAudioContext();
  stopPlayback();

  const cached = state.cachedChips.find(
    c => c.question.toLowerCase().trim() === questionText.toLowerCase().trim()
  );

  if (cached && cached.answer) {
    // Show user and bot bubbles immediately
    appendMessage('user', cached.question);
    recordTurn('user', cached.question);

    appendMessage('bot', cached.answer, () => {
      handleTextQuery('Please tell me more about that');
    });
    recordTurn('model', cached.answer);

    // Play cached WAV audio immediately
    if (cached.audioUrl) {
      setState('speaking');
      try {
        const audioRes = await fetch(cached.audioUrl);
        if (audioRes.ok) {
          const arrayBuffer = await audioRes.arrayBuffer();
          const ctx = unlockAudioContext();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = () => setState('idle');
          source.start(0);
          return;
        }
      } catch (err) {
        console.warn('Cached WAV playback error, falling back to device voice:', err);
      }
      speakWithDeviceVoice(cached.answer, () => setState('idle'));
      return;
    } else {
      speakWithDeviceVoice(cached.answer, () => setState('idle'));
      return;
    }
  }

  // Fallback to live API call if cache misses
  handleTextQuery(questionText);
}

/**
 * Submits a text question
 */
function handleTextQuery(queryText) {
  const text = queryText.trim();
  if (!text) return;
  stopPlayback();
  processQuery({ text });
}

/**
 * Central microphone button handler
 */
async function handleMicClick() {
  unlockAudioContext();

  // If already speaking, stop playback and return to idle
  if (state.currentState === 'speaking') {
    stopPlayback();
    setState('idle');
    return;
  }

  // If thinking, ignore taps
  if (state.currentState === 'thinking') {
    return;
  }

  // If currently listening, second tap stops recording and submits
  if (state.currentState === 'listening') {
    stopRecording();
    return;
  }

  // If idle, start listening
  stopPlayback();
  setState('listening');

  try {
    const recordingPromise = startRecording({
      onTick: (seconds) => updateTimerDisplay(seconds)
    });

    const wavBase64 = await recordingPromise;

    if (!wavBase64) {
      setState('idle');
      return;
    }

    await processQuery({ audioWavBase64: wavBase64 });
  } catch (err) {
    console.warn('Microphone recording error:', err);
    setState('idle');

    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message === 'MEDIA_NOT_SUPPORTED') {
      // Try browser speech recognition fallback
      const recognitionStarted = tryBrowserSpeechRecognition(
        (transcript) => {
          handleTextQuery(transcript);
        },
        () => {
          showToast('Microphone access was denied. You can type your question in the text box below.');
          elements.chatInput.focus();
        }
      );

      if (!recognitionStarted) {
        showToast('Microphone access was denied. You can type your question in the text box below.');
        elements.chatInput.focus();
      }
    } else {
      showToast('Could not record audio. Please try typing your question.');
      elements.chatInput.focus();
    }
  }
}

/**
 * Resets the conversation to a clean slate
 */
function resetConversation() {
  stopPlayback();
  if (isRecording()) stopRecording();

  state.history = [];
  clearChatStream();
  setState('idle');
  showToast('Started a new conversation.');
}

/**
 * Initializes listeners and lifecycle events
 */
function init() {
  initDialog();
  loadChipsCache();

  // Mic button
  if (elements.btnMic) {
    elements.btnMic.addEventListener('click', handleMicClick);
  }

  // Stop button
  if (elements.btnStop) {
    elements.btnStop.addEventListener('click', () => {
      stopPlayback();
      setState('idle');
    });
  }

  // Example question chips (serves instantly from cache if available)
  if (elements.chipsContainer) {
    elements.chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip && chip.dataset.question) {
        handleChipClick(chip.dataset.question);
      }
    });
  }

  // Typing form submission
  if (elements.chatForm) {
    elements.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleTextQuery(elements.chatInput.value);
    });
  }

  // New conversation button
  if (elements.btnReset) {
    elements.btnReset.addEventListener('click', resetConversation);
  }

  // Stop audio playback if tab becomes hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPlayback();
      if (isRecording()) {
        stopRecording();
      }
      if (state.currentState !== 'thinking') {
        setState('idle');
      }
    }
  });

  console.log('Ask Bhushan voice app initialized with full voice in/out & fallbacks.');
}

document.addEventListener('DOMContentLoaded', init);
