/**
 * public/js/audio.js
 * Browser-side audio recording, mono 16 kHz WAV encoding, precision audio playback,
 * word-by-word streaming text synchronization, and young male voice fallbacks.
 */

let audioCtx = null;
let currentSourceNode = null;
let currentMediaRecorder = null;
let currentStream = null;
let recordingTimer = null;
let recordingSeconds = 0;
let speakAbortController = null;
let syncAnimFrame = null;
let vadAnimFrame = null;
let vadSourceNode = null;
let vadAnalyser = null;

// Important keywords for progressive emphasis
const KEYWORDS = [
  'logical problem-solving',
  'problem-solving',
  'root cause',
  'fci ccm',
  '4.5 million',
  '45% faster',
  'productlens',
  'vartasense',
  'iit ropar',
  'iim amritsar',
  'python',
  'sql',
  'pyspark',
  'databricks',
  'rag',
  'bandra',
  '25,000',
  '12,000',
  '92% agreement',
  'f1-score',
  '0.89',
  'superpower',
  'next-best-action'
];

/**
 * Creates and resumes the shared Web Audio context on user gesture
 */
export function unlockAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Parses response text into sentence and word token objects with timing weights
 */
export function prepareSynchronizedText(text) {
  if (!text) return [];

  // Match sentences
  const sentenceRegex = /[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g;
  const rawSentences = text.match(sentenceRegex) || [text];

  const lowerText = text.toLowerCase();
  const matchedKeywords = KEYWORDS.filter(kw => lowerText.includes(kw));

  const words = [];
  let globalWordIndex = 0;

  rawSentences.forEach((sentenceText, sIdx) => {
    const rawWords = sentenceText.trim().split(/\s+/).filter(Boolean);

    rawWords.forEach((wordStr) => {
      const cleanWord = wordStr.toLowerCase().replace(/^[^\w]+|[^\w]+$/g, '');

      // Check if word is part of any key phrase
      const isKeyword = matchedKeywords.some(kw => kw.includes(cleanWord) && cleanWord.length > 2);

      // Duration weight: letters + punctuation pause bonus
      let weight = Math.max(2, cleanWord.length);
      if (/[.,;:\u2014]/.test(wordStr)) {
        weight += 4; // micro-pause
      }
      if (/[.!?]/.test(wordStr)) {
        weight += 6; // clause pause
      }

      words.push({
        globalIndex: globalWordIndex++,
        sentenceIndex: sIdx,
        rawText: wordStr,
        cleanText: cleanWord,
        isKeyword,
        weight,
        startTime: 0,
        endTime: 0
      });
    });
  });

  return words;
}

/**
 * Computes exact start and end timestamps (in seconds) for each word given audio duration
 */
export function computeWordTimings(words, totalDurationSeconds) {
  if (!words || words.length === 0) return words;

  const totalWeight = words.reduce((sum, w) => sum + w.weight, 0);
  let currentSec = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wordDuration = (w.weight / totalWeight) * totalDurationSeconds;
    w.startTime = currentSec;
    w.endTime = currentSec + wordDuration;
    currentSec += wordDuration;
  }

  // Ensure last word aligns with duration
  if (words.length > 0) {
    words[words.length - 1].endTime = Math.max(words[words.length - 1].endTime, totalDurationSeconds);
  }

  return words;
}

/**
 * Checks for best supported recording mime type
 */
function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/wav'
  ];
  for (const type of types) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

/**
 * Encodes Float32 PCM samples into a 16-bit mono WAV ArrayBuffer
 */
function encodeWavBuffer(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Converts any audio blob into mono 16 kHz WAV base64 string using OfflineAudioContext
 */
export async function convertBlobToMono16kWav(blob) {
  const ctx = unlockAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const decodedAudio = await ctx.decodeAudioData(arrayBuffer);

  const targetSampleRate = 16000;
  const targetLength = Math.ceil(decodedAudio.duration * targetSampleRate);

  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const offlineCtx = new OfflineContext(1, targetLength, targetSampleRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = decodedAudio;
  source.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  const monoSamples = renderedBuffer.getChannelData(0);

  const wavArrayBuffer = encodeWavBuffer(monoSamples, targetSampleRate);

  let binary = '';
  const bytes = new Uint8Array(wavArrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Starts recording user voice with real-time Voice Activity Detection (VAD)
 * that automatically detects when speaking finishes and stops recording.
 * @param {Object} options
 * @param {Function} [options.onTick] - Called every second with recording duration
 * @param {Function} [options.onVoiceActivity] - Called when user speech begins
 * @param {Function} [options.onAutoStop] - Called when silence triggers automatic stop
 */
export async function startRecording({ onTick, onVoiceActivity, onAutoStop } = {}) {
  const ctx = unlockAudioContext();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('MEDIA_NOT_SUPPORTED');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  currentStream = stream;
  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  currentMediaRecorder = recorder;

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  recordingSeconds = 0;
  if (onTick) onTick(0);

  recordingTimer = setInterval(() => {
    recordingSeconds++;
    if (onTick) onTick(recordingSeconds);
    if (recordingSeconds >= 30) {
      stopRecording();
    }
  }, 1000);

  // Setup Real-Time Voice Activity Detection (VAD)
  let speechDetected = false;
  let silenceStartTime = null;
  const SILENCE_THRESHOLD_MS = 1300; // 1.3 seconds of silence after speaking triggers auto-finish
  const NOISE_FLOOR = 15; // Average frequency volume threshold

  try {
    vadSourceNode = ctx.createMediaStreamSource(stream);
    vadAnalyser = ctx.createAnalyser();
    vadAnalyser.fftSize = 512;
    vadSourceNode.connect(vadAnalyser);

    const freqData = new Uint8Array(vadAnalyser.frequencyBinCount);

    const checkVolume = () => {
      if (!currentMediaRecorder || currentMediaRecorder.state !== 'recording') {
        return;
      }

      vadAnalyser.getByteFrequencyData(freqData);
      let sum = 0;
      for (let i = 0; i < freqData.length; i++) {
        sum += freqData[i];
      }
      const avgVolume = sum / freqData.length;

      const now = Date.now();
      if (avgVolume > NOISE_FLOOR) {
        if (!speechDetected) {
          speechDetected = true;
          if (onVoiceActivity) onVoiceActivity(true);
        }
        silenceStartTime = null;
      } else if (speechDetected) {
        if (silenceStartTime === null) {
          silenceStartTime = now;
        } else if (now - silenceStartTime >= SILENCE_THRESHOLD_MS) {
          // Automatic silence detected after speech!
          if (onAutoStop) onAutoStop();
          stopRecording();
          return;
        }
      }

      vadAnimFrame = requestAnimationFrame(checkVolume);
    };

    vadAnimFrame = requestAnimationFrame(checkVolume);
  } catch (vadErr) {
    console.warn('VAD setup skipped, manual stop remains fully active:', vadErr);
  }

  return new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      if (vadAnimFrame) {
        cancelAnimationFrame(vadAnimFrame);
        vadAnimFrame = null;
      }
      if (vadSourceNode) {
        try { vadSourceNode.disconnect(); } catch (e) {}
        vadSourceNode = null;
      }
      if (vadAnalyser) {
        try { vadAnalyser.disconnect(); } catch (e) {}
        vadAnalyser = null;
      }

      clearInterval(recordingTimer);
      recordingTimer = null;

      stream.getTracks().forEach(track => track.stop());
      currentStream = null;
      currentMediaRecorder = null;

      try {
        const fullBlob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        const wavBase64 = await convertBlobToMono16kWav(fullBlob);
        resolve(wavBase64);
      } catch (err) {
        reject(err);
      }
    };

    recorder.onerror = (e) => {
      if (vadAnimFrame) cancelAnimationFrame(vadAnimFrame);
      clearInterval(recordingTimer);
      reject(e.error || new Error('RECORDING_FAILED'));
    };

    recorder.start(250);
  });
}

/**
 * Stops an active recording
 */
export function stopRecording() {
  if (vadAnimFrame) {
    cancelAnimationFrame(vadAnimFrame);
    vadAnimFrame = null;
  }
  if (currentMediaRecorder && currentMediaRecorder.state !== 'inactive') {
    currentMediaRecorder.stop();
  }
}

/**
 * Checks if recording is active
 */
export function isRecording() {
  return currentMediaRecorder && currentMediaRecorder.state === 'recording';
}

/**
 * Plays base64 WAV audio through the Web Audio context with real-time onTimeUpdate sync
 * @param {string} base64Wav
 * @param {Function} [onTimeUpdate] - Called with (currentSeconds, totalSeconds) on every animation frame
 * @param {Function} [onEnded] - Called when playback completes
 */
export async function playWavBase64(base64Wav, onTimeUpdate, onEnded) {
  stopPlayback();
  const ctx = unlockAudioContext();

  const binaryString = atob(base64Wav);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
  const duration = audioBuffer.duration;
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  currentSourceNode = source;
  const playbackStartTime = ctx.currentTime;

  // Real-time synchronization loop locked to hardware audio clock
  function trackSync() {
    if (currentSourceNode !== source) return;

    const elapsed = ctx.currentTime - playbackStartTime;
    if (onTimeUpdate) {
      onTimeUpdate(elapsed, duration);
    }

    if (elapsed < duration) {
      syncAnimFrame = requestAnimationFrame(trackSync);
    }
  }

  source.onended = () => {
    if (currentSourceNode === source) {
      if (syncAnimFrame) cancelAnimationFrame(syncAnimFrame);
      if (onTimeUpdate) onTimeUpdate(duration, duration); // mark complete
      currentSourceNode = null;
      if (onEnded) onEnded();
    }
  };

  source.start(0);
  syncAnimFrame = requestAnimationFrame(trackSync);

  return duration;
}

/**
 * Plays an audio buffer (e.g. from fetched ArrayBuffer) with real-time onTimeUpdate sync
 */
export async function playAudioBuffer(audioBuffer, onTimeUpdate, onEnded) {
  stopPlayback();
  const ctx = unlockAudioContext();
  const duration = audioBuffer.duration;

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  currentSourceNode = source;
  const playbackStartTime = ctx.currentTime;

  function trackSync() {
    if (currentSourceNode !== source) return;

    const elapsed = ctx.currentTime - playbackStartTime;
    if (onTimeUpdate) {
      onTimeUpdate(elapsed, duration);
    }

    if (elapsed < duration) {
      syncAnimFrame = requestAnimationFrame(trackSync);
    }
  }

  source.onended = () => {
    if (currentSourceNode === source) {
      if (syncAnimFrame) cancelAnimationFrame(syncAnimFrame);
      if (onTimeUpdate) onTimeUpdate(duration, duration);
      currentSourceNode = null;
      if (onEnded) onEnded();
    }
  };

  source.start(0);
  syncAnimFrame = requestAnimationFrame(trackSync);

  return duration;
}

let cachedDeviceVoice = null;

/**
 * Pre-caches the device voice so it stays 100% consistent across every question
 */
export function initDeviceVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const selectVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return;

    cachedDeviceVoice = voices.find(v =>
      v.lang.startsWith('en') &&
      (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Enhanced') || v.name.includes('Premium')) &&
      (v.name.includes('Male') || v.name.includes('Ryan') || v.name.includes('Guy') || v.name.includes('Christopher') || v.name.includes('Daniel') || v.name.includes('Oliver') || v.name.includes('Alex'))
    ) || voices.find(v =>
      v.lang.startsWith('en') &&
      (v.name.includes('Male') || v.name.includes('Ryan') || v.name.includes('Alex') ||
       v.name.includes('Daniel') || v.name.includes('Oliver') || v.name.includes('Evan') ||
       v.name.includes('Fred') || v.name.includes('George') || v.name.includes('Guy') ||
       v.name.includes('Arthur') || v.name.includes('Aaron') || v.name.includes('Rishi'))
    ) || voices.find(v => v.lang.startsWith('en-IN')) ||
         voices.find(v => v.lang.startsWith('en-GB')) ||
         voices.find(v => v.lang.startsWith('en-US')) ||
         voices.find(v => v.lang.startsWith('en')) || null;
  };

  selectVoice();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = selectVoice;
  }
}

/**
 * Browser SpeechSynthesis fallback with young male voice profile and word-boundary sync.
 * Strictly preserves single voice across questions without switching.
 */
export function speakWithDeviceVoice(text, onWordBoundary, onEnded) {
  stopPlayback();

  if (!window.speechSynthesis) {
    if (onEnded) onEnded();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);

  if (!cachedDeviceVoice) {
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      cachedDeviceVoice = voices.find(v =>
        v.lang.startsWith('en') &&
        (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Enhanced') || v.name.includes('Premium')) &&
        (v.name.includes('Male') || v.name.includes('Ryan') || v.name.includes('Guy') || v.name.includes('Christopher') || v.name.includes('Daniel') || v.name.includes('Oliver') || v.name.includes('Alex'))
      ) || voices.find(v =>
        v.lang.startsWith('en') &&
        (v.name.includes('Male') || v.name.includes('Ryan') || v.name.includes('Alex') ||
         v.name.includes('Daniel') || v.name.includes('Oliver') || v.name.includes('Evan') ||
         v.name.includes('Fred') || v.name.includes('George') || v.name.includes('Guy') ||
         v.name.includes('Arthur') || v.name.includes('Aaron') || v.name.includes('Rishi'))
      ) || voices.find(v => v.lang.startsWith('en-IN')) ||
           voices.find(v => v.lang.startsWith('en-GB')) ||
           voices.find(v => v.lang.startsWith('en-US')) ||
           voices.find(v => v.lang.startsWith('en')) || null;
    }
  }

  if (cachedDeviceVoice) {
    utterance.voice = cachedDeviceVoice;
  }

  // Set crisp, natural conversational cadence with human pacing
  utterance.pitch = 1.0;
  utterance.rate = 1.02;

  // Real-time word boundary synchronization
  utterance.onboundary = (e) => {
    if (e.name === 'word' && onWordBoundary) {
      onWordBoundary(e.charIndex, e.charLength || 5);
    }
  };

  utterance.onend = () => {
    if (onEnded) onEnded();
  };

  utterance.onerror = (err) => {
    console.warn('Device speech synthesis error:', err);
    if (onEnded) onEnded();
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Immediately stops all active audio playback (Web Audio & SpeechSynthesis)
 */
export function stopPlayback() {
  if (syncAnimFrame) {
    cancelAnimationFrame(syncAnimFrame);
    syncAnimFrame = null;
  }

  if (speakAbortController) {
    speakAbortController.abort();
    speakAbortController = null;
  }

  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch (e) {
      // Ignore
    }
    currentSourceNode = null;
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Browser Speech Recognition fallback if microphone access fails
 */
export function tryBrowserSpeechRecognition(onResult, onError) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return false;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript && onResult) onResult(transcript);
    };

    recognition.onerror = (e) => {
      if (onError) onError(e);
    };

    recognition.start();
    return true;
  } catch (err) {
    return false;
  }
}
