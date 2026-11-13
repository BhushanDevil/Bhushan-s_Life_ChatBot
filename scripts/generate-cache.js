/**
 * scripts/generate-cache.js
 * Pre-generates responses and audio WAV files for the 5 sample questions.
 * Outputs to public/cache/chips.json and public/cache/chip-*.wav.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvLocal } from './dev-server.js';
import { buildSystemPrompt } from '../lib/prompts.js';
import { generateChatResponse } from '../lib/gemini.js';
import { pcmToWav } from '../lib/wav.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const cacheDir = path.join(rootDir, 'public', 'cache');

loadEnvLocal();

const SAMPLE_QUESTIONS = [
  {
    id: 'life-story',
    label: 'Life Story',
    question: 'What should we know about your life story in a few sentences?'
  },
  {
    id: 'superpower',
    label: 'Superpower',
    question: 'What is your number one superpower?'
  },
  {
    id: 'growth-areas',
    label: 'Growth Areas',
    question: 'What are the top three areas you would like to grow in?'
  },
  {
    id: 'misconception',
    label: 'Misconception',
    question: 'What misconception do your coworkers have about you?'
  },
  {
    id: 'pushing-limits',
    label: 'Pushing Limits',
    question: 'How do you push your boundaries and limits?'
  }
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSpeechAudio(text, apiKey, ttsModel, voiceName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ttsModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const promptText = `Speak the following response naturally in a warm, friendly, calm conversational tone as Bhushan:\n\n${text}`;

  const requestBody = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
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
    throw new Error(`TTS API failed with HTTP ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const inlineData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) {
    throw new Error('No inline audio data returned by model');
  }

  let sampleRate = 24000;
  const rateMatch = (inlineData.mimeType || '').match(/rate=(\d+)/);
  if (rateMatch && rateMatch[1]) {
    sampleRate = parseInt(rateMatch[1], 10);
  }

  const rawBuffer = Buffer.from(inlineData.data, 'base64');
  return pcmToWav(rawBuffer, sampleRate);
}

async function run() {
  console.log('Generating cache for the 5 sample questions...');

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('Error: GEMINI_API_KEY is not set in .env.local');
    process.exit(1);
  }

  const systemPrompt = buildSystemPrompt();
  const ttsModel = process.env.GEMINI_TTS_MODEL || 'gemini-2.0-flash';
  const voiceName = process.env.TTS_VOICE || 'Puck';

  const cacheEntries = [];

  for (let i = 0; i < SAMPLE_QUESTIONS.length; i++) {
    const item = SAMPLE_QUESTIONS[i];
    console.log(`\n[${i + 1}/${SAMPLE_QUESTIONS.length}] Processing: "${item.question}"`);

    // 1. Generate text answer
    console.log('  -> Calling Gemini chat...');
    const chatResult = await generateChatResponse({
      systemPrompt,
      history: [],
      text: item.question
    });

    console.log(`  -> Answer (${chatResult.answer.split(/\s+/).length} words): "${chatResult.answer}"`);

    // 2. Generate speech WAV
    console.log(`  -> Generating speech audio via ${ttsModel} (${voiceName})...`);
    let audioFileName = `chip-${i}.wav`;
    let audioRelPath = `/cache/${audioFileName}`;
    let fullAudioPath = path.join(cacheDir, audioFileName);

    try {
      const wavBuffer = await fetchSpeechAudio(chatResult.answer, apiKey, ttsModel, voiceName);
      fs.writeFileSync(fullAudioPath, wavBuffer);
      console.log(`  -> Saved audio: ${audioFileName} (${Math.round(wavBuffer.length / 1024)} KB)`);
    } catch (ttsErr) {
      console.warn(`  ⚠️ TTS generation failed (${ttsErr.message}). Skipping audio file; frontend will fall back to live or device voice.`);
      audioRelPath = null;
    }

    cacheEntries.push({
      id: item.id,
      label: item.label,
      question: chatResult.question || item.question,
      answer: chatResult.answer,
      audioUrl: audioRelPath
    });

    // Pause between calls to avoid bursting rate limits
    if (i < SAMPLE_QUESTIONS.length - 1) {
      console.log('  -> Waiting 3s to respect rate limits...');
      await sleep(3000);
    }
  }

  // Save chips.json
  const chipsJsonPath = path.join(cacheDir, 'chips.json');
  fs.writeFileSync(chipsJsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), chips: cacheEntries }, null, 2));
  console.log(`\n✓ Cache generation complete! Saved manifest to ${chipsJsonPath}`);
}

run().catch(err => {
  console.error('\nFatal error generating cache:', err);
  process.exit(1);
});
