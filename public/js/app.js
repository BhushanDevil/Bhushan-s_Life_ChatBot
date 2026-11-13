/**
 * public/js/app.js
 * Main application orchestrator: connects audio recording, speech synthesis,
 * UI states, multi-session chat history, "For You" intelligence engine, and real-time streaming text sync.
 */

import {
  elements,
  setControlState,
  updateTimerDisplay,
  appendMessage,
  createSynchronizedStreamingMessage,
  clearChatStream,
  showToast,
  initDialog,
  initThemeToggle,
  updateVoiceIndicator,
  toggleSidebar,
  closeSidebar,
  renderSidebarHistory,
  openForYouDrawer,
  closeForYouDrawer,
  renderForYouSection
} from './ui.js';
import { sendChatMessage, requestSpeech } from './api.js';
import {
  unlockAudioContext,
  startRecording,
  stopRecording,
  isRecording,
  prepareSynchronizedText,
  computeWordTimings,
  playWavBase64,
  playAudioBuffer,
  initDeviceVoices,
  speakWithDeviceVoice,
  stopPlayback,
  tryBrowserSpeechRecognition
} from './audio.js';
import {
  loadAllChats,
  getActiveChat,
  setActiveChatId,
  createNewChat,
  addMessageToActiveChat,
  deleteChat,
  clearAllChats
} from './history.js';
import { generateRecommendations } from './recommendations.js';

// Application State
const state = {
  activeChatId: null,
  history: [], // [{ role: 'user' | 'model', text: string }] (max 6 turns)
  currentState: 'idle', // 'idle' | 'listening' | 'thinking' | 'speaking'
  cachedChips: [], // Cached { question, answer, audioUrl }
  currentStreamer: null, // Active synchronized streaming message controller
  searchQuery: '',
  selectedVoice: 'Puck' // 'Puck' | 'Charon' | 'Fenrir' | 'Aoede' | 'Kore' | 'device'
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
 * Stops any active audio and reveals remaining streamed text immediately
 */
function stopActivePlaybackAndStreaming() {
  if (state.currentStreamer) {
    state.currentStreamer.completeStreaming();
    state.currentStreamer = null;
  }
  stopPlayback();
}

/**
 * Refreshes the conversation history list in the sidebar
 */
function refreshSidebar() {
  const chats = loadAllChats();
  renderSidebarHistory(
    chats,
    state.activeChatId,
    state.searchQuery,
    (id) => loadChatSession(id),
    (id) => handleDeleteChat(id)
  );
}

/**
 * Refreshes the personalized "For You" drawer
 */
function refreshRecommendations() {
  const activeChat = getActiveChat();
  const recData = generateRecommendations(activeChat.history || []);
  renderForYouSection(recData, (question) => {
    handleChipOrText(question);
  });
}

/**
 * Loads a specific chat session into view
 */
function loadChatSession(chatId) {
  stopActivePlaybackAndStreaming();
  if (isRecording()) stopRecording();

  setActiveChatId(chatId);
  const chat = getActiveChat();
  state.activeChatId = chat.id;
  state.history = (chat.history || []).slice(-6);

  clearChatStream();

  if (chat.history && chat.history.length > 0) {
    chat.history.forEach(m => {
      if (m.role === 'user') {
        appendMessage('user', m.text);
      } else {
        appendMessage('bot', m.text, () => {
          handleTextQuery('Please tell me more about that');
        });
      }
    });
  }

  setState('idle');
  refreshSidebar();
  refreshRecommendations();
}

/**
 * Starts a brand-new conversation session
 */
function startNewChatSession() {
  stopActivePlaybackAndStreaming();
  if (isRecording()) stopRecording();

  const newChat = createNewChat('New Conversation');
  state.activeChatId = newChat.id;
  state.history = [];

  clearChatStream();
  setState('idle');
  refreshSidebar();
  refreshRecommendations();
  showToast('Started a new conversation.');
}

/**
 * Deletes a chat session
 */
function handleDeleteChat(id) {
  deleteChat(id);
  const active = getActiveChat();
  loadChatSession(active.id);
  showToast('Conversation deleted.');
}

/**
 * Clears all conversation sessions
 */
function handleClearAllChats() {
  stopActivePlaybackAndStreaming();
  if (isRecording()) stopRecording();

  clearAllChats();
  const active = getActiveChat();
  state.activeChatId = active.id;
  state.history = [];

  clearChatStream();
  setState('idle');
  refreshSidebar();
  refreshRecommendations();
  showToast('All conversation history cleared.');
}

/**
 * Plays spoken voice for an answer with real-time word-by-word streaming synchronization
 */
async function speakAnswer(answerText, words, streamer) {
  if (!answerText) {
    if (streamer) streamer.completeStreaming();
    setState('idle');
    return;
  }

  setState('speaking');

  // If user selected Device Voice, use 100% free offline speech directly (0 Gemini API cost/quota)
  if (state.selectedVoice === 'device') {
    const estimatedDuration = Math.max(1, words.length * 0.38);
    computeWordTimings(words, estimatedDuration);

    speakWithDeviceVoice(
      answerText,
      (charIndex) => {
        let currentChars = 0;
        for (let i = 0; i < words.length; i++) {
          if (currentChars >= charIndex || i === words.length - 1) {
            if (streamer) streamer.updateSpokenWord(words[i].startTime + 0.01, estimatedDuration);
            break;
          }
          currentChars += words[i].rawText.length + 1;
        }
      },
      () => {
        if (streamer) streamer.completeStreaming();
        state.currentStreamer = null;
        setState('idle');
      }
    );
    return;
  }

  // Otherwise synthesize using selected free Gemini voice (Puck, Charon, Fenrir, Aoede, Kore)
  try {
    const ttsPromise = requestSpeech(answerText, state.selectedVoice);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TTS_TIMEOUT')), 3500)
    );

    const ttsRes = await Promise.race([ttsPromise, timeoutPromise]);

    if (ttsRes.ok && ttsRes.audio) {
      let timingsComputed = false;
      await playWavBase64(
        ttsRes.audio,
        (elapsed, duration) => {
          if (!timingsComputed) {
            computeWordTimings(words, duration);
            timingsComputed = true;
          }
          if (streamer) streamer.updateSpokenWord(elapsed, duration);
        },
        () => {
          if (streamer) streamer.completeStreaming();
          state.currentStreamer = null;
          setState('idle');
        }
      );
      return;
    }
  } catch (err) {
    console.warn('Gemini TTS slow or unavailable, engaging instant device voice fallback:', err.message);
  }

  // Graceful fallback to device voice with word-boundary synchronization
  const estimatedDuration = Math.max(1, words.length * 0.38);
  computeWordTimings(words, estimatedDuration);

  speakWithDeviceVoice(
    answerText,
    (charIndex) => {
      let currentChars = 0;
      for (let i = 0; i < words.length; i++) {
        if (currentChars >= charIndex || i === words.length - 1) {
          if (streamer) streamer.updateSpokenWord(words[i].startTime + 0.01, estimatedDuration);
          break;
        }
        currentChars += words[i].rawText.length + 1;
      }
    },
    () => {
      if (streamer) streamer.completeStreaming();
      state.currentStreamer = null;
      setState('idle');
    }
  );
}

/**
 * Processes a question query (typed text or recorded audio)
 */
async function processQuery({ text = null, audioWavBase64 = null }) {
  if (state.currentState === 'thinking') return;

  setState('thinking');
  stopActivePlaybackAndStreaming();

  // If text query, show user bubble immediately
  if (text) {
    appendMessage('user', text);
    addMessageToActiveChat('user', text);
    state.history.push({ role: 'user', text });
    if (state.history.length > 6) state.history = state.history.slice(-6);
    elements.chatInput.value = '';
    refreshSidebar();
    refreshRecommendations();
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
      addMessageToActiveChat('user', question);
      state.history.push({ role: 'user', question });
      if (state.history.length > 6) state.history = state.history.slice(-6);
      refreshSidebar();
      refreshRecommendations();
    }

    addMessageToActiveChat('model', answer);
    state.history.push({ role: 'model', text: answer });
    if (state.history.length > 6) state.history = state.history.slice(-6);
    refreshSidebar();
    refreshRecommendations();

    // Prepare synchronized text streamer
    const words = prepareSynchronizedText(answer);
    const streamer = createSynchronizedStreamingMessage(words, () => {
      handleTextQuery('Please tell me more about that');
    });
    state.currentStreamer = streamer;

    // Start spoken voice output with real-time text synchronization
    await speakAnswer(answer, words, streamer);
  } catch (err) {
    console.error('Chat processing error:', err);
    showToast('An unexpected network error occurred. Please try again.');
    setState('idle');
  }
}

/**
 * Handles chip clicks or recommended questions with cache support and synchronized streaming
 */
async function handleChipOrText(questionText) {
  unlockAudioContext();
  stopActivePlaybackAndStreaming();

  const cached = state.cachedChips.find(
    c => c.question.toLowerCase().trim() === questionText.toLowerCase().trim()
  );

  if (cached && cached.answer) {
    // Show user bubble
    appendMessage('user', cached.question);
    addMessageToActiveChat('user', cached.question);
    state.history.push({ role: 'user', text: cached.question });
    if (state.history.length > 6) state.history = state.history.slice(-6);

    // Prepare synchronized streaming bubble
    const words = prepareSynchronizedText(cached.answer);
    const streamer = createSynchronizedStreamingMessage(words, () => {
      handleTextQuery('Please tell me more about that');
    });
    state.currentStreamer = streamer;

    addMessageToActiveChat('model', cached.answer);
    state.history.push({ role: 'model', text: cached.answer });
    if (state.history.length > 6) state.history = state.history.slice(-6);
    refreshSidebar();
    refreshRecommendations();

    // Play cached WAV audio immediately ONLY if selected voice is Puck (pre-rendered voice)
    if (state.selectedVoice === 'Puck' && cached.audioUrl) {
      setState('speaking');
      try {
        const audioRes = await fetch(cached.audioUrl);
        if (audioRes.ok) {
          const arrayBuffer = await audioRes.arrayBuffer();
          const ctx = unlockAudioContext();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          computeWordTimings(words, audioBuffer.duration);

          await playAudioBuffer(
            audioBuffer,
            (elapsed, duration) => streamer.updateSpokenWord(elapsed, duration),
            () => {
              streamer.completeStreaming();
              state.currentStreamer = null;
              setState('idle');
            }
          );
          return;
        }
      } catch (err) {
        console.warn('Cached WAV playback error, falling back to live speech:', err);
      }
    }

    // If another voice was chosen (Charon, Fenrir, Aoede, Kore, or Device Voice), synthesize in that voice
    await speakAnswer(cached.answer, words, streamer);
    return;
  }

  // Not in cache: send via standard live flow
  handleTextQuery(questionText);
}

/**
 * Submits a text question
 */
function handleTextQuery(queryText) {
  const text = queryText.trim();
  if (!text) return;
  stopActivePlaybackAndStreaming();
  processQuery({ text });
}

/**
 * Central microphone button handler
 */
async function handleMicClick() {
  unlockAudioContext();

  // If already speaking, stop playback and return to idle
  if (state.currentState === 'speaking') {
    stopActivePlaybackAndStreaming();
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
  stopActivePlaybackAndStreaming();
  setState('listening');

  try {
    const recordingPromise = startRecording({
      onTick: (seconds) => updateTimerDisplay(seconds),
      onVoiceActivity: () => {
        elements.statusText.textContent = 'Listening to your question...';
      },
      onAutoStop: () => {
        elements.statusText.textContent = 'Finished speaking, answering...';
      }
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
 * Initializes listeners and lifecycle events
 */
function init() {
  initDialog();
  initThemeToggle();
  initDeviceVoices();
  loadChipsCache();

  // Load and apply selected voice (persisted across sessions)
  try {
    const savedVoice = localStorage.getItem('bhushan_selected_voice');
    if (savedVoice) {
      state.selectedVoice = savedVoice;
    }
  } catch (e) {}
  updateVoiceIndicator(state.selectedVoice);

  if (elements.voiceSelect) {
    elements.voiceSelect.addEventListener('change', (e) => {
      const newVoice = e.target.value;
      state.selectedVoice = newVoice;
      try {
        localStorage.setItem('bhushan_selected_voice', newVoice);
      } catch (err) {}
      updateVoiceIndicator(newVoice);

      if (newVoice === 'device') {
        showToast('Voice set to Device Voice (Zero API cost / Instant).');
      } else {
        showToast(`Voice set to ${newVoice} (Free Gemini Voice).`);
      }
    });
  }

  // Load active chat session
  const activeChat = getActiveChat();
  loadChatSession(activeChat.id);

  // Mic button
  if (elements.btnMic) {
    elements.btnMic.addEventListener('click', handleMicClick);
  }

  // Stop button
  if (elements.btnStop) {
    elements.btnStop.addEventListener('click', () => {
      stopActivePlaybackAndStreaming();
      setState('idle');
    });
  }

  // Example question chips
  if (elements.chipsContainer) {
    elements.chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip && chip.dataset.question) {
        handleChipOrText(chip.dataset.question);
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

  // Sidebar toggles
  if (elements.btnMenuToggle) {
    elements.btnMenuToggle.addEventListener('click', toggleSidebar);
  }
  if (elements.btnCloseSidebar) {
    elements.btnCloseSidebar.addEventListener('click', closeSidebar);
  }
  if (elements.sidebarBackdrop) {
    elements.sidebarBackdrop.addEventListener('click', closeSidebar);
  }

  // Sidebar new chat
  if (elements.btnNewChatSidebar) {
    elements.btnNewChatSidebar.addEventListener('click', () => {
      startNewChatSession();
      if (window.innerWidth <= 900) closeSidebar();
    });
  }

  // Sidebar search filter
  if (elements.sidebarSearch) {
    elements.sidebarSearch.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      refreshSidebar();
    });
  }

  // Sidebar clear all chats
  if (elements.btnClearAllChats) {
    elements.btnClearAllChats.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete all saved conversations?')) {
        handleClearAllChats();
        if (window.innerWidth <= 900) closeSidebar();
      }
    });
  }

  // "For You" drawer triggers
  if (elements.btnForYouHeader) {
    elements.btnForYouHeader.addEventListener('click', openForYouDrawer);
  }
  if (elements.btnOpenForYouSidebar) {
    elements.btnOpenForYouSidebar.addEventListener('click', () => {
      openForYouDrawer();
      if (window.innerWidth <= 900) closeSidebar();
    });
  }
  if (elements.btnCloseForYou) {
    elements.btnCloseForYou.addEventListener('click', closeForYouDrawer);
  }

  // Close drawer if clicking outside
  document.addEventListener('click', (e) => {
    if (
      elements.forYouDrawer &&
      elements.forYouDrawer.classList.contains('open') &&
      !elements.forYouDrawer.contains(e.target) &&
      e.target !== elements.btnForYouHeader &&
      !elements.btnForYouHeader.contains(e.target) &&
      e.target !== elements.btnOpenForYouSidebar &&
      !elements.btnOpenForYouSidebar.contains(e.target)
    ) {
      closeForYouDrawer();
    }
  });

  // Stop audio playback if tab becomes hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopActivePlaybackAndStreaming();
      if (isRecording()) {
        stopRecording();
      }
      if (state.currentState !== 'thinking') {
        setState('idle');
      }
    }
  });

  console.log('Ask Bhushan voice app initialized with streaming sync, dark mode, history sidebar, and For You insights.');
}

document.addEventListener('DOMContentLoaded', init);
