/**
 * public/js/api.js
 * API communication helpers for /api/chat and /api/speak.
 */

/**
 * Sends a chat query (text or audio with history) to /api/chat
 */
export async function sendChatMessage({ text, audio, history = [] }) {
  try {
    const payload = {};
    if (text) payload.text = text;
    if (audio) payload.audio = audio;
    if (history.length > 0) payload.history = history;

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || {
          code: 'SERVER_ERROR',
          message: `Request failed with status ${response.status}`
        }
      };
    }

    return {
      ok: true,
      data: {
        question: data.question || text || 'Voice Question',
        answer: data.answer || ''
      }
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Could not connect to the server. Please check your internet connection.'
      }
    };
  }
}

/**
 * Requests speech audio for an answer text from /api/speak
 */
export async function requestSpeech(text) {
  try {
    const response = await fetch('/api/speak', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || {
          code: 'TTS_UNAVAILABLE',
          message: 'Voice synthesis service is currently unavailable.'
        }
      };
    }

    return {
      ok: true,
      audio: data.audio, // base64 WAV
      sampleRate: data.sampleRate || 24000
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'TTS_NETWORK_ERROR',
        message: 'Network error requesting voice audio.'
      }
    };
  }
}
