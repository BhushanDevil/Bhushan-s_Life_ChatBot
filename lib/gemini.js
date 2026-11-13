/**
 * lib/gemini.js
 * Client wrapper for Gemini REST API calls with structured JSON output and fallback retry.
 */

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Builds the contents array from history and the current user turn
 */
function buildContents(history = [], { text, audio }) {
  const contents = [];

  // Add history turns
  for (const turn of history) {
    contents.push({
      role: turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.text }]
    });
  }

  // Add current turn
  const userParts = [];
  if (audio?.data) {
    userParts.push({
      inlineData: {
        mimeType: audio.mimeType || 'audio/wav',
        data: audio.data
      }
    });
    userParts.push({
      text: "Transcribe what I asked into 'question' and answer as Bhushan in 'answer' following the system instructions."
    });
  } else if (text) {
    userParts.push({ text });
  }

  contents.push({
    role: 'user',
    parts: userParts
  });

  return contents;
}

/**
 * Executes a generateContent call against Gemini API
 */
async function callGeminiApi({ model, apiKey, systemPrompt, contents }) {
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    contents,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 600,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          answer: { type: 'STRING' }
        },
        required: ['question', 'answer']
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  return response;
}

/**
 * Safe JSON parser for Gemini output text
 */
function parseGeminiOutput(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response from model');
  }

  let cleaned = rawText.trim();
  // Strip markdown code fences if model enclosed JSON in ```json ... ```
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(cleaned);
  return {
    question: (parsed.question || '').trim(),
    answer: (parsed.answer || '').trim()
  };
}

/**
 * Sends a chat query (text or audio) to Gemini with automatic model fallback
 */
export async function generateChatResponse({ systemPrompt, history, text, audio }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not configured on the server.');
    error.code = 'CONFIG_ERROR';
    error.status = 500;
    throw error;
  }

  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';

  const contents = buildContents(history, { text, audio });

  let response;
  let activeModel = primaryModel;

  try {
    response = await callGeminiApi({
      model: primaryModel,
      apiKey,
      systemPrompt,
      contents
    });
  } catch (netErr) {
    // Network error on primary model, attempt fallback
    console.warn(`Primary model ${primaryModel} network error, retrying with fallback ${fallbackModel}:`, netErr.message);
    activeModel = fallbackModel;
    try {
      response = await callGeminiApi({
        model: fallbackModel,
        apiKey,
        systemPrompt,
        contents
      });
    } catch (fallbackNetErr) {
      const err = new Error('Service temporarily unavailable. Please try again.');
      err.code = 'UPSTREAM_ERROR';
      err.status = 503;
      throw err;
    }
  }

  // If primary model returned 429 (rate limit) or 503 (overload), retry once with fallbackModel
  if (response.status === 429 || response.status === 503) {
    console.warn(`Primary model ${primaryModel} returned HTTP ${response.status}, retrying with fallback ${fallbackModel}`);
    activeModel = fallbackModel;
    try {
      response = await callGeminiApi({
        model: fallbackModel,
        apiKey,
        systemPrompt,
        contents
      });
    } catch (fallbackErr) {
      const err = new Error('Failed to reach fallback AI service.');
      err.code = 'UPSTREAM_ERROR';
      err.status = 503;
      throw err;
    }
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(`Gemini API error (${response.status}) on model ${activeModel}:`, errorBody);

    if (response.status === 429) {
      const err = new Error('The AI service is currently busy. Please wait a few seconds and try again.');
      err.code = 'RATE_LIMITED';
      err.status = 429;
      throw err;
    }

    const err = new Error('Upstream AI service error. Please try again shortly.');
    err.code = 'UPSTREAM_ERROR';
    err.status = 503;
    throw err;
  }

  const resultData = await response.json();
  const candidate = resultData.candidates?.[0];
  const candidateText = candidate?.content?.parts?.[0]?.text;

  if (!candidateText) {
    // Handle silent or blocked response
    if (audio) {
      return {
        question: 'unclear',
        answer: "I couldn't quite hear or catch that. Could you please tap the microphone and ask again, or use the typing box?"
      };
    }
    const err = new Error('No answer generated from AI service.');
    err.code = 'UPSTREAM_ERROR';
    err.status = 500;
    throw err;
  }

  const parsed = parseGeminiOutput(candidateText);

  // If audio was unintelligible or empty
  if (audio && (!parsed.question || parsed.question.toLowerCase().includes('inaudible') || parsed.question.toLowerCase().includes('unclear'))) {
    return {
      question: 'unclear',
      answer: "I couldn't quite hear that clearly. Could you please ask again, or type your question below?"
    };
  }

  // If text question, preserve original question text
  if (text && !parsed.question) {
    parsed.question = text;
  }

  return parsed;
}
