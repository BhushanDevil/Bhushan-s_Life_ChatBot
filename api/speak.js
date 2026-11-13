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

  const { text, voice } = validation;

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

  const primaryTtsModel = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
  const candidateModels = [
    primaryTtsModel,
    'gemini-3.8-flash-lite-tts',
    'gemini-3.8-flash-tts',
    'gemini-2.5-flash-preview-tts'
  ];
  // Remove duplicates
  const ttsModels = Array.from(new Set(candidateModels));

  const voiceName = voice || process.env.TTS_VOICE || 'Puck'; // User chosen voice or server default

  // Prompt instructing natural, expressive, youthful conversational delivery
  const promptText = `Say in a warm, natural, spontaneous young male voice as Bhushan. Use realistic conversational intonation, natural dynamic pitch, lively pacing, and clean expressive articulation:\n\n${text}`;

  let lastError = null;

  for (const ttsModel of ttsModels) {
    try {
      const url = `${GEMINI_API_BASE}/${encodeURIComponent(ttsModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

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
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(6000)
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.warn(`[api/speak] TTS model ${ttsModel} returned HTTP ${response.status}:`, errText.slice(0, 160));
        lastError = new Error(`TTS model ${ttsModel} HTTP ${response.status}`);
        continue; // Try next model in candidate list
      }

      const data = await response.json();
      const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;

      if (!inlineData?.data) {
        console.warn(`[api/speak] No inline audio data returned by ${ttsModel}.`);
        lastError = new Error(`No audio data from ${ttsModel}`);
        continue;
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
        sampleRate,
        modelUsed: ttsModel,
        voice: voiceName
      });
    } catch (err) {
      console.warn(`[api/speak] Error with model ${ttsModel}:`, err.message);
      lastError = err;
    }
  }

  // All Gemini TTS candidate models failed/exhausted
  return res.status(503).json({
    error: {
      code: 'TTS_UNAVAILABLE',
      message: `Gemini TTS service unavailable (${lastError?.message || 'quota exceeded'}). Falling back to device voice.`
    }
  });
}
