/**
 * lib/guard.js
 * Input validation, sanitization, and best-effort in-memory rate limiting.
 *
 * NOTE: Serverless memory is per container/instance and ephemeral, so this
 * in-memory rate limit and daily cap is best-effort protection against spam
 * and quota exhaustion.
 */

const ipRequests = new Map(); // ip -> [timestamps]
let dailyRequestCount = 0;
let currentDay = new Date().toISOString().slice(0, 10);

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX_REQUESTS = 12; // 12 requests per 10 minutes

/**
 * Strips ASCII control characters except \n, \r, \t
 */
export function stripControlCharacters(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Validates and extracts client IP
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Rate limit check per IP and global daily cap
 */
export function checkRateLimits(req) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== currentDay) {
    currentDay = today;
    dailyRequestCount = 0;
    ipRequests.clear();
  }

  // Daily cap check
  const dailyCap = parseInt(process.env.DAILY_CAP || '150', 10);
  if (dailyCap > 0 && dailyRequestCount >= dailyCap) {
    return {
      allowed: false,
      code: 'DAILY_CAP_EXCEEDED',
      message: 'Daily question limit reached. Please check back tomorrow or contact Bhushan directly.'
    };
  }

  // Per-IP rate limit check
  const ip = getClientIp(req);
  const now = Date.now();
  const timestamps = (ipRequests.get(ip) || []).filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      code: 'RATE_LIMITED',
      message: 'You have asked several questions recently. Please wait a few minutes before asking another.'
    };
  }

  timestamps.push(now);
  ipRequests.set(ip, timestamps);
  dailyRequestCount++;

  return { allowed: true };
}

/**
 * Validates chat request payload:
 * - text: max 500 characters
 * - audio: base64 audio/wav, max ~1.5 MB decoded (approx 2 MB base64 string)
 * - history: array of up to 6 turns, each turn object { role, text }, max 600 chars per text
 */
export function validateChatPayload(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, code: 'INVALID_REQUEST', message: 'Request body must be a JSON object.' };
  }

  const { text, audio, history } = body;

  if (!text && !audio) {
    return { valid: false, code: 'INVALID_REQUEST', message: 'Please provide either text or audio.' };
  }

  let sanitizedText = '';
  if (text) {
    if (typeof text !== 'string') {
      return { valid: false, code: 'INVALID_REQUEST', message: 'Text must be a string.' };
    }
    sanitizedText = stripControlCharacters(text);
    if (sanitizedText.length === 0) {
      return { valid: false, code: 'INVALID_REQUEST', message: 'Question text cannot be empty.' };
    }
    if (sanitizedText.length > 500) {
      return { valid: false, code: 'INVALID_REQUEST', message: 'Question exceeds the 500 character limit.' };
    }
  }

  let validatedAudio = null;
  if (audio) {
    if (typeof audio !== 'object') {
      return { valid: false, code: 'INVALID_REQUEST', message: 'Audio must be an object with data and mimeType.' };
    }
    const { data, mimeType } = audio;
    if (mimeType !== 'audio/wav') {
      return { valid: false, code: 'INVALID_REQUEST', message: 'Only audio/wav format is supported.' };
    }
    if (typeof data !== 'string' || data.length === 0) {
      return { valid: false, code: 'INVALID_REQUEST', message: 'Audio data must be a non-empty base64 string.' };
    }
    // 1.5 MB decoded binary is approx 2,097,152 base64 chars
    if (data.length > 2_100_000) {
      return { valid: false, code: 'INVALID_REQUEST', message: 'Audio recording exceeds the 1.5 MB limit.' };
    }
    validatedAudio = { data, mimeType };
  }

  const validatedHistory = [];
  if (history !== undefined) {
    if (!Array.isArray(history)) {
      return { valid: false, code: 'INVALID_REQUEST', message: 'History must be an array.' };
    }
    // Keep at most the last 6 turns
    const recentHistory = history.slice(-6);
    for (const turn of recentHistory) {
      if (!turn || typeof turn !== 'object') continue;
      const role = turn.role === 'user' ? 'user' : 'model';
      const rawTurnText = typeof turn.text === 'string' ? turn.text : '';
      const turnText = stripControlCharacters(rawTurnText).slice(0, 600);
      if (turnText.length > 0) {
        validatedHistory.push({ role, text: turnText });
      }
    }
  }

  return {
    valid: true,
    data: {
      text: sanitizedText,
      audio: validatedAudio,
      history: validatedHistory
    }
  };
}

/**
 * Validates speak request payload (max 900 chars)
 */
export function validateSpeakPayload(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, code: 'INVALID_REQUEST', message: 'Request body must be a JSON object.' };
  }

  const { text } = body;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { valid: false, code: 'INVALID_REQUEST', message: 'Speak text is required.' };
  }

  const sanitized = stripControlCharacters(text);
  if (sanitized.length > 900) {
    return { valid: false, code: 'INVALID_REQUEST', message: 'Speak text exceeds the 900 character limit.' };
  }

  return { valid: true, text: sanitized };
}
