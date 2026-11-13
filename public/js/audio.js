/**
 * public/js/audio.js
 * Browser-side audio recording, mono 16 kHz WAV encoding, playback, and voice fallbacks.
 */

let audioCtx = null;
let currentSourceNode = null;
let currentMediaRecorder = null;
let currentStream = null;
let recordingTimer = null;
let recordingSeconds = 0;
let speakAbortController = null;

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

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + samples.length * 2, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (1 = raw PCM)
  view.setUint16(20, 1, true);
  // channel count (1 = mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sampleRate * 1 * 2)
  view.setUint32(28, sampleRate * 2, true);
  // block align (1 * 2)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, samples.length * 2, true);

  // Write 16-bit PCM samples with clipping protection
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

  // Convert ArrayBuffer to base64
  let binary = '';
  const bytes = new Uint8Array(wavArrayBuffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Starts recording user voice
 */
export async function startRecording({ onTick, onLevel }) {
  unlockAudioContext();

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
    // Automatic cut-off at 30 seconds
    if (recordingSeconds >= 30) {
      stopRecording();
    }
  }, 1000);

  return new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      clearInterval(recordingTimer);
      recordingTimer = null;

      // Stop all tracks to turn off mic hardware indicator
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
      clearInterval(recordingTimer);
      reject(e.error || new Error('RECORDING_FAILED'));
    };

    recorder.start(250); // Slice every 250ms
  });
}

/**
 * Stops an active recording
 */
export function stopRecording() {
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
 * Plays base64 WAV audio through the Web Audio context
 */
export async function playWavBase64(base64Wav, onEnded) {
  stopPlayback();
  const ctx = unlockAudioContext();

  const binaryString = atob(base64Wav);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const audioBuffer = await ctx.decodeAudioData(bytes.buffer);
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);

  currentSourceNode = source;

  source.onended = () => {
    if (currentSourceNode === source) {
      currentSourceNode = null;
      if (onEnded) onEnded();
    }
  };

  source.start(0);
}

/**
 * Browser SpeechSynthesis fallback
 */
export function speakWithDeviceVoice(text, onEnded) {
  stopPlayback();

  if (!window.speechSynthesis) {
    if (onEnded) onEnded();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);

  // Select preferred English voice
  const voices = window.speechSynthesis.getVoices();
  const englishVoice = voices.find(v => v.lang.startsWith('en-IN')) ||
                       voices.find(v => v.lang.startsWith('en-GB')) ||
                       voices.find(v => v.lang.startsWith('en-US')) ||
                       voices.find(v => v.lang.startsWith('en'));

  if (englishVoice) {
    utterance.voice = englishVoice;
  }

  utterance.rate = 1.0;
  utterance.pitch = 1.0;

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
  if (speakAbortController) {
    speakAbortController.abort();
    speakAbortController = null;
  }

  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch (e) {
      // Ignore if already stopped
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
