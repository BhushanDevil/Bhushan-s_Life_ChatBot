/**
 * api/chat.js
 * Vercel Serverless Function handling chat interactions (text and audio input).
 */

import { checkRateLimits, validateChatPayload } from '../lib/guard.js';
import { buildSystemPrompt } from '../lib/prompts.js';
import { generateChatResponse } from '../lib/gemini.js';

export default async function handler(req, res) {
  // Polyfill helper response methods if running directly in plain Node
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

  // Only POST method is accepted
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Only POST requests are allowed.'
      }
    });
  }

  // 1. Rate limiting & daily cap check
  const rateLimit = checkRateLimits(req);
  if (!rateLimit.allowed) {
    const statusCode = rateLimit.code === 'DAILY_CAP_EXCEEDED' ? 429 : 429;
    return res.status(statusCode).json({
      error: {
        code: rateLimit.code,
        message: rateLimit.message
      }
    });
  }

  // 2. Validate request payload
  const validation = validateChatPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({
      error: {
        code: validation.code,
        message: validation.message
      }
    });
  }

  const { text, audio, history } = validation.data;

  try {
    // 3. Build system prompt from persona, rules, and profile book
    const systemPrompt = buildSystemPrompt();

    // 4. Generate response via Gemini API (never log user or bot text)
    const result = await generateChatResponse({
      systemPrompt,
      history,
      text,
      audio
    });

    return res.status(200).json({
      question: result.question,
      answer: result.answer
    });
  } catch (err) {
    const statusCode = err.status || 500;
    const errorCode = err.code || 'INTERNAL_ERROR';
    console.error(`[api/chat] Error (${errorCode}):`, err.message);

    return res.status(statusCode).json({
      error: {
        code: errorCode,
        message: err.message || 'An unexpected error occurred. Please try again.'
      }
    });
  }
}
