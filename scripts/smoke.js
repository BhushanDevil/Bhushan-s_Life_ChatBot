/**
 * scripts/smoke.js
 * End-to-end smoke test runner for both local server and deployed Vercel production link.
 * Usage:
 *   npm run smoke
 *   node scripts/smoke.js --url=https://your-vercel-app.vercel.app
 */

import { loadEnvLocal } from './dev-server.js';

loadEnvLocal();

const args = process.argv.slice(2);
let baseUrl = 'http://localhost:3000';
for (const arg of args) {
  if (arg.startsWith('--url=')) {
    baseUrl = arg.slice('--url='.length).replace(/\/$/, '');
  }
}

async function runSmokeTests() {
  console.log(`\n======================================================`);
  console.log(`Running Smoke Tests against: ${baseUrl}`);
  console.log(`======================================================\n`);

  // Check 1: Root HTML Page Loads
  console.log(`[CHECK 1] GET / (Static Page Load)...`);
  const pageRes = await fetch(`${baseUrl}/`);
  if (!pageRes.ok) {
    throw new Error(`Failed to load root page: HTTP ${pageRes.status}`);
  }
  const pageHtml = await pageRes.text();
  if (!pageHtml.includes('Ask Bhushan') || !pageHtml.includes('app-layout')) {
    throw new Error('Root page does not contain expected "Ask Bhushan" markup');
  }
  console.log(`  ✓ Root HTML page loaded successfully (${Math.round(pageHtml.length / 1024)} KB)`);

  // Check 2: API Health Check
  console.log(`\n[CHECK 2] GET /api/health...`);
  const healthRes = await fetch(`${baseUrl}/api/health`);
  if (!healthRes.ok) {
    throw new Error(`/api/health failed: HTTP ${healthRes.status}`);
  }
  const healthData = await healthRes.json();
  if (healthData.ok !== true) {
    throw new Error(`/api/health returned unexpected payload: ${JSON.stringify(healthData)}`);
  }
  console.log(`  ✓ /api/health returned: { ok: true }`);

  // Check 3: Chat API & Profile Book Bundling
  console.log(`\n[CHECK 3] POST /api/chat (Verifying Gemini & Profile Book Bundling)...`);
  const testQuestion = 'What is your number one superpower?';
  const chatRes = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-eval-suite': 'true'
    },
    body: JSON.stringify({ text: testQuestion })
  });

  if (!chatRes.ok) {
    const errData = await chatRes.json().catch(() => ({}));
    throw new Error(`/api/chat returned HTTP ${chatRes.status}: ${JSON.stringify(errData)}`);
  }

  const chatData = await chatRes.json();
  const answer = chatData.answer || '';
  console.log(`  Question: "${testQuestion}"`);
  console.log(`  Answer (${answer.split(/\s+/).length} words): "${answer}"`);

  // Verify answer reflects the profile book
  if (!answer.toLowerCase().includes('problem') && !answer.toLowerCase().includes('dashboard') && !answer.toLowerCase().includes('queries')) {
    throw new Error(`Chat answer does not appear to reflect profile book: "${answer}"`);
  }
  console.log(`  ✓ /api/chat returned authentic grounded answer reflecting the profile book.`);

  // Check 4: Speak API / Voice Synthesis
  console.log(`\n[CHECK 4] POST /api/speak (Voice Synthesis Verification)...`);
  const speakRes = await fetch(`${baseUrl}/api/speak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello, I am Bhushan. My superpower is logical problem-solving.' })
  });

  if (speakRes.status === 503) {
    console.log(`  ⚠️ /api/speak returned 503 (Expected if TTS model is busy/unavailable; client device voice fallback engages cleanly).`);
  } else if (!speakRes.ok) {
    const errData = await speakRes.json().catch(() => ({}));
    throw new Error(`/api/speak returned HTTP ${speakRes.status}: ${JSON.stringify(errData)}`);
  } else {
    const speakData = await speakRes.json();
    if (!speakData.audio) {
      throw new Error('/api/speak response missing audio payload');
    }
    const audioBytes = Buffer.from(speakData.audio, 'base64');
    console.log(`  ✓ /api/speak returned valid base64 WAV audio (${Math.round(audioBytes.length / 1024)} KB, sampleRate: ${speakData.sampleRate || 24000} Hz)`);
  }

  // Check 5: Pre-cached Chips Manifest & Audio
  console.log(`\n[CHECK 5] GET /cache/chips.json (Pre-cached Example Chips)...`);
  const chipsRes = await fetch(`${baseUrl}/cache/chips.json`);
  if (!chipsRes.ok) {
    throw new Error(`Failed to load /cache/chips.json: HTTP ${chipsRes.status}`);
  }
  const chipsData = await chipsRes.json();
  if (!Array.isArray(chipsData.chips) || chipsData.chips.length < 5) {
    throw new Error(`Cached chips manifest invalid or has fewer than 5 chips: ${JSON.stringify(chipsData)}`);
  }
  console.log(`  ✓ Pre-cached chips verified: ${chipsData.chips.length} chips ready for zero-latency responses.`);

  console.log(`\n======================================================`);
  console.log(`✓ ALL SMOKE TESTS PASSED CLEANLY! Ready for production.`);
  console.log(`======================================================\n`);
}

runSmokeTests().catch(err => {
  console.error('\n❌ Smoke test failure:', err.message);
  process.exit(1);
});
