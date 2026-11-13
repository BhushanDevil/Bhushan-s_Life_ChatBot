# Ask Bhushan — AI Voice Bot

An interactive, voice-enabled web application built for an engineering job assignment. A recruiter or interviewer can tap a microphone, ask an interview question, and hear a short, natural spoken answer in Bhushan's authentic voice and perspective (~30 seconds, 70–90 words), with the transcript displayed on screen.

---

## Architecture Overview

```
Recruiter / Browser
  │
  ├─► [Microphone] ──► Web Audio / MediaRecorder ──► Mono 16 kHz WAV ──┐
  │                                                                    │
  ├─► [Instant Chips Cache] ◄── /cache/chips.json & /cache/chip-*.wav  │
  │                                                                    ▼
  ├─► [Typed Input] ──────────────────────────────────────────► /api/chat (Vercel Serverless)
  │                                                                    │
  │   ◄── JSON { question, answer } ───────────────────────────────────┤
  │                                                                    ▼
  ├─► [/api/speak] ◄───────────────────────────────────────────── Gemini 3.5 Flash / Flash-Lite
  │        │                                                           │
  │        ▼                                                           ▼
  └─► Gemini TTS (WAV) ──► Web Audio Playback (Device Voice Fallback)  Profile Book (/content/*.md)
```

### Component Breakdown
1. **Frontend (`/public`)**:
   - Zero framework, zero build step, pure HTML5, CSS3, and ES modules.
   - **Audio Recording**: Captures audio, downsamples/resamples to 16 kHz mono 16-bit linear PCM WAV using `OfflineAudioContext` directly in the browser.
   - **Audio Playback**: Unlocks Web Audio on first tap to bypass mobile browser autoplay restrictions; plays server-generated WAV with fallback to `window.speechSynthesis`.
   - **Instant Chip Cache**: The five example questions answer instantly with zero quota usage from pre-rendered JSON and WAV files in `public/cache/`.
2. **Serverless Functions (`/api`)**:
   - `/api/chat`: Validates payloads, enforces rate limits and daily caps, compiles system prompt from `/content/*.md`, and invokes Gemini API with structured JSON output and automatic fallback.
   - `/api/speak`: Synthesizes natural spoken voice via Gemini TTS model, wraps raw PCM in 44-byte RIFF WAV headers, and returns base64 WAV.
   - `/api/health`: Health check endpoint returning `{ ok: true }`.
3. **Knowledge Base (`/content`)**:
   - 11 markdown files capturing Bhushan's background, education, work at FCI CCM, problem-solving superpower, growth areas, resume metrics, and strict guardrails.

---

## Security & Privacy Note
- **No Data Retention**: No voice recordings, transcripts, or personal data are stored in any database or on the server.
- **Confidentiality**: Never reveals confidential client or company details from FCI CCM.
- **Factual Honesty**: 100% grounded in Bhushan's profile book. Does not fabricate numbers or claims. Collaborative tools are attributed to the team.
- **Guardrails**: Resists prompt injection, ignores instruction-override attempts, politely deflects off-topic questions, and keeps contact/salary discussions professional.
- **Security Headers**: Strict Content-Security-Policy (CSP), Permissions-Policy, X-Content-Type-Options, and Referrer-Policy configured in `vercel.json` and local dev server.

---

## Environment Variables

Configure these in `.env.local` for local development and in the Vercel Project Settings for production:

| Variable | Description | Recommended / Tested Value |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google AI Studio Gemini API Key | *(Secret, never committed)* |
| `GEMINI_MODEL` | Primary chat completion model | `gemini-3.5-flash-lite` or `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODEL` | Fallback model if primary encounters 429/503 | `gemini-3.1-flash-lite` or `gemini-flash-latest` |
| `GEMINI_TTS_MODEL` | Multimodal voice generation model | `gemini-2.5-flash-preview-tts` |
| `TTS_VOICE` | Prebuilt voice personality name | `Puck` (Warm, natural male tone) |
| `DAILY_CAP` | Maximum daily requests per instance | `200` |

### Available TTS Voices
You can configure `TTS_VOICE` to any of the following Gemini prebuilt voices:
- `Puck`: Warm, natural, friendly conversational tone (Default, recommended for Bhushan)
- `Charon`: Deeper, calm, thoughtful tone
- `Kore`: Clear, articulate, bright tone
- `Fenrir`: Strong, confident tone
- `Aoede`: Warm, expressive tone

---

## Quick Start & Running Locally

### Prerequisites
- Node.js >= 20.0.0

### Steps
1. Clone the repository and navigate into the folder.
2. Create `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Add your `GEMINI_API_KEY` into `.env.local`.
3. Start the local server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available Scripts

- `npm run dev`: Starts the local development server at `http://localhost:3000` with hot reloading and environment variable support.
- `npm run smoke`: Runs automated smoke tests against the dev server verifying HTML serving, `/api/health`, and error handling.
- `npm run cache`: Generates pre-cached JSON and WAV files in `public/cache/` for the 5 sample questions.
- `npm run eval`: Runs the evaluation test suite across 25 benchmark interview questions.

---

## Known Limits
- **Serverless In-Memory Rate Limiting**: The rate limiter and daily cap use in-memory counters, which are ephemeral per serverless instance (best-effort protection).
- **Mobile Audio Autoplay**: Mobile browsers (iOS Safari, Android Chrome) require a user tap to unlock audio context playback.
- **Microphone Permissions**: If microphone permission is denied, the app automatically falls back to browser speech recognition or focuses the typing box.
