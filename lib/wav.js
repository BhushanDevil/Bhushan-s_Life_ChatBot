/**
 * lib/wav.js
 * Utility to wrap raw PCM audio in a valid 44-byte RIFF WAV header.
 */

/**
 * Creates a standard 44-byte RIFF WAV header for linear PCM audio.
 * @param {Object} options
 * @param {number} options.dataLength - Length of raw PCM audio data in bytes
 * @param {number} [options.sampleRate=24000] - Audio sample rate in Hz (default 24000 Hz for Gemini)
 * @param {number} [options.numChannels=1] - Number of audio channels (1 = mono)
 * @param {number} [options.bitsPerSample=16] - Bit depth (16-bit linear PCM)
 * @returns {Buffer} 44-byte WAV header
 */
export function createWavHeader({ dataLength, sampleRate = 24000, numChannels = 1, bitsPerSample = 16 }) {
  const header = Buffer.alloc(44);
  const byteRate = Math.floor((sampleRate * numChannels * bitsPerSample) / 8);
  const blockAlign = Math.floor((numChannels * bitsPerSample) / 8);

  // 00-03: "RIFF"
  header.write('RIFF', 0, 'ascii');
  // 04-07: File size - 8 bytes = 36 + dataLength
  header.writeUInt32LE(36 + dataLength, 4);
  // 08-11: "WAVE"
  header.write('WAVE', 8, 'ascii');
  // 12-15: "fmt "
  header.write('fmt ', 12, 'ascii');
  // 16-19: Subchunk1Size (16 for PCM)
  header.writeUInt32LE(16, 16);
  // 20-21: AudioFormat (1 = Linear PCM)
  header.writeUInt16LE(1, 20);
  // 22-23: NumChannels (1 = Mono, 2 = Stereo)
  header.writeUInt16LE(numChannels, 22);
  // 24-27: SampleRate (e.g. 24000)
  header.writeUInt32LE(sampleRate, 24);
  // 28-31: ByteRate (SampleRate * NumChannels * BitsPerSample / 8)
  header.writeUInt32LE(byteRate, 28);
  // 32-33: BlockAlign (NumChannels * BitsPerSample / 8)
  header.writeUInt16LE(blockAlign, 32);
  // 34-35: BitsPerSample (16)
  header.writeUInt16LE(bitsPerSample, 34);
  // 36-39: "data"
  header.write('data', 36, 'ascii');
  // 40-43: Subchunk2Size (dataLength)
  header.writeUInt32LE(dataLength, 40);

  return header;
}

/**
 * Wraps raw PCM data in a WAV header if not already formatted as WAV.
 * @param {Buffer} pcmBuffer - Raw audio data buffer
 * @param {number} [sampleRate=24000] - Audio sample rate in Hz
 * @returns {Buffer} WAV formatted audio buffer
 */
export function pcmToWav(pcmBuffer, sampleRate = 24000) {
  if (!Buffer.isBuffer(pcmBuffer)) {
    throw new TypeError('Audio data must be a Buffer.');
  }

  // Check if buffer is already a valid WAV (starts with 'RIFF' and has 'WAVE' at offset 8)
  if (
    pcmBuffer.length >= 12 &&
    pcmBuffer.toString('ascii', 0, 4) === 'RIFF' &&
    pcmBuffer.toString('ascii', 8, 12) === 'WAVE'
  ) {
    return pcmBuffer;
  }

  const header = createWavHeader({
    dataLength: pcmBuffer.length,
    sampleRate,
    numChannels: 1,
    bitsPerSample: 16
  });

  return Buffer.concat([header, pcmBuffer]);
}
