# Bhushan's Life Voice Bot

A voice-enabled web application built for interview and recruiter interactions. A recruiter can tap a microphone, ask any question about Bhushan's background, work, and thinking, and receive a short, authentic voice response spoken in first person as Bhushan would answer, with the transcript displayed on-screen.

## Features
- **Voice In & Voice Out**: Audio recorded directly in the browser (16 kHz mono WAV) and processed via Gemini API; spoken response returned and played back with Web Speech API fallback.
- **Strictly Grounded**: All answers are grounded 100% in Bhushan's profile book in `/content`. Never fabricates facts or numbers.
- **Fast & Lightweight**: Built with standard vanilla HTML, CSS, and ES modules in `/public`. No front-end frameworks or build steps.
- **Serverless Architecture**: Node.js serverless functions in `/api` deployed on Vercel Hobby plan, with zero database dependencies.

## Project Structure
```text
.
├── api/                # Vercel serverless functions (/api/chat, /api/speak, /api/health)
├── content/            # Profile book markdown files (the bot's knowledge base)
├── eval/               # Evaluation questions and test harness
├── lib/                # Shared server-side modules (book loader, prompt builder, guardrails)
├── public/             # Static frontend files (index.html, style.css, app.js)
│   ├── cache/          # Pre-cached gold question answers
│   └── js/             # Frontend utility modules
├── scripts/            # Dev server, cache generator, smoke tests, evaluation scripts
├── .env.example        # Environment variable template
├── package.json        # Project metadata and scripts
└── vercel.json         # Vercel deployment configuration
```

## Getting Started

### Prerequisites
- Node.js >= 20.0.0
- Google AI Studio API Key (free tier)

### Setup
1. Copy the environment template:
   ```bash
   cp .env.example .env.local
   ```
2. Populate `.env.local` with your Gemini API credentials:
   ```env
   GEMINI_API_KEY=your_key_here
   GEMINI_MODEL=gemini-2.5-flash
   GEMINI_FALLBACK_MODEL=gemini-1.5-flash
   GEMINI_TTS_MODEL=gemini-2.5-flash-tts
   TTS_VOICE=en-US-Journey-F
   DAILY_CAP=100
   ```
3. Start the local development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.
5. Verify API health check:
   ```bash
   curl http://localhost:3000/api/health
   ```
