const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { env } = require('../../config/aiConfig');
const { AIError } = require('../../utils/aiErrors');
ffmpeg.setFfmpegPath(require('ffmpeg-static'));
ffmpeg.setFfprobePath(require('ffprobe-static').path);

// Formats Groq accepts directly (docs): mp3, mp4, mpeg, mpga, m4a, wav, webm. Anything else is transcoded first.
const DIRECT = new Set(['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm']);
const BYTES_PER_SEC = 8000; // 64 kbps mono mp3

exports.probeDuration = (file) => new Promise((resolve) => {
  ffmpeg.ffprobe(file, (err, d) => { const n = Number(d?.format?.duration); resolve(!err && Number.isFinite(n) && n > 0 ? n : null); });
});

const segmentToChunks = (file, dir, seconds) => new Promise((resolve, reject) => {
  ffmpeg(file).noVideo().audioChannels(1).audioFrequency(16000).audioCodec('libmp3lame').audioBitrate('64k')
    .format('segment').outputOptions(['-segment_time', String(seconds), '-reset_timestamps', '1'])
    .output(path.join(dir, 'chunk_%03d.mp3')).on('end', resolve).on('error', reject).run();
});

// Returns { chunks:[{path, offsetSec}], durationSec, cleanup() }. Original file is never modified or deleted here.
exports.prepare = async (filePath) => {
  const maxBytes = Math.floor(env.MAX_AUDIO_MB * 1024 * 1024);
  const duration = await exports.probeDuration(filePath);
  if (duration && duration > env.MAX_AUDIO_MINUTES * 60) throw new AIError('AUDIO_TOO_LARGE');
  const size = fs.statSync(filePath).size;
  const direct = DIRECT.has(path.extname(filePath).toLowerCase());
  if (size <= maxBytes && direct) return { chunks: [{ path: filePath, offsetSec: 0 }], durationSec: duration, cleanup: async () => {} };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intellmeet-'));
  const cleanup = async () => fs.rmSync(dir, { recursive: true, force: true });
  try {
    const seconds = Math.max(1, Math.floor((maxBytes * 0.8) / BYTES_PER_SEC));
    await segmentToChunks(filePath, dir, seconds);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3')).sort();
    if (!files.length) throw new Error('no chunks produced');
    const chunks = []; let offset = 0;
    for (const f of files) {
      const p = path.join(dir, f);
      if (fs.statSync(p).size > maxBytes) throw new AIError('AUDIO_TOO_LARGE');
      chunks.push({ path: p, offsetSec: offset });
      offset += (await exports.probeDuration(p)) ?? seconds;     // real chunk length, so timestamps stay aligned
    }
    return { chunks, durationSec: duration ?? offset, cleanup };
  } catch (e) {
    await cleanup();
    if (e instanceof AIError) throw e;
    console.error('[audio]', e.message);
    throw new AIError('PROVIDER_ERROR');
  }
};
