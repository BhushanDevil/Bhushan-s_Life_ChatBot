/**
 * api/speak.js
 * Vercel Serverless Function converting answer text to spoken audio using Gemini TTS.
 */

import { checkRateLimits, validateSpeakPayload } from '../lib/guard.js';
import { pcmToWav } from '../lib/wav.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export default async function handler(req, res) {
  if (!res.status) {
    res.status = function (code) {
      res.statusCode = code;
      return res;
    };
  }
  if (!res.json) {
    res.json = function (data) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
      return res;
    };
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST requests are allowed.' }
    });
  }

  // 1. Rate limiting
  const rateLimit = checkRateLimits(req);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: { code: rateLimit.code, message: rateLimit.message }
    });
  }

  // 2. Input validation (max 900 chars)
  const validation = validateSpeakPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({
      error: { code: validation.code, message: validation.message }
    });
  }

  const { text } = validation;

  // 3. Check API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: {
        code: 'TTS_UNAVAILABLE',
        message: 'GEMINI_API_KEY is not configured on the server. Falling back to device voice.'
      }
    });
  }

  const ttsModel = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
  const voiceName = process.env.TTS_VOICE || 'Puck';

  try {
    const url = `${GEMINI_API_BASE}/${encodeURIComponent(ttsModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const promptText = `Speak the following response naturally in a warm, friendly, calm conversational tone as Bhushan:\n\n${text}`;

    const requestBody = {
      contents: [
        {
          parts: [{ text: promptText }]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName
            }
          }
        }
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[api/speak] TTS model ${ttsModel} returned HTTP ${response.status}:`, errText);
      return res.status(503).json({
        error: {
          code: 'TTS_UNAVAILABLE',
          message: 'Upstream TTS service returned an error. Falling back to device voice.'
        }
      });
    }

    const data = await response.json();
    const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;

    if (!inlineData?.data) {
      console.warn('[api/speak] No inline audio data returned by TTS model.');
      return res.status(503).json({
        error: {
          code: 'TTS_FAILED',
          message: 'No audio returned by AI model. Falling back to device voice.'
        }
      });
    }

    // Extract sample rate from mimeType if provided (e.g. "audio/pcm;rate=24000")
    let sampleRate = 24000;
    const rateMatch = (inlineData.mimeType || '').match(/rate=(\d+)/);
    if (rateMatch && rateMatch[1]) {
      sampleRate = parseInt(rateMatch[1], 10);
    }

    const rawBuffer = Buffer.from(inlineData.data, 'base64');
    const wavBuffer = pcmToWav(rawBuffer, sampleRate);

    return res.status(200).json({
      audio: wavBuffer.toString('base64'),
      mimeType: 'audio/wav',
      sampleRate
    });
  } catch (err) {
    console.error('[api/speak] Exception during TTS generation:', err.message);
    return res.status(503).json({
      error: {
        code: 'TTS_UNAVAILABLE',
        message: 'TTS generation failed. Falling back to device voice.'
      }
    });
  }
}
