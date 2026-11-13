// client/src/lib/micProcessing.js
// AI noise removal for the microphone. Everything runs inside the browser: no audio is uploaded anywhere, no account, no API key.
//
// The browser's own noise suppression is good at steady hum. A small neural network (the kind of model Meet and Zoom use) also removes
// keyboard clicks, a fan, traffic, a busy street... and keeps the voice. Two free open-source models are supported:
//   'gtcrn'   - the stronger one. Very good with keyboard and room noise. Voice band up to about 8 kHz ("HD voice").
//   'rnnoise' - the lighter one. Keeps the full voice band, a little less strict with keyboard clicks.
// Both run in an AudioWorklet (the browser's audio thread) using WebAssembly, so the page and the video are not slowed down.
//
// Safety: useWebRTC only switches to the processed voice after the model has proven it is alive (see modelAlive), and switches back
// to the plain microphone as soon as anything looks wrong (onLost is called). The plain microphone always still works.
//
// Package: npm i @sapphi-red/web-noise-suppressor   (MIT licence; models: GTCRN MIT, RNNoise BSD)
import { loadGtcrn, GtcrnWorkletNode, loadRnnoise, RnnoiseWorkletNode } from '@sapphi-red/web-noise-suppressor';
import gtcrnWorkletUrl from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url';
import gtcrnWasmUrl from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

const RATE = 48000;                         // both models are built for 48 kHz audio
const OVERLOAD_RATIO = 0.03;                // more than 3% of audio blocks late ...
const OVERLOAD_SECONDS = 4;                 // ... for 4 seconds in a row = this computer is too slow for the model

const cache = {};                           // model -> Promise<{ worklet, wasm }>; downloaded once, reused on every restart
const isWasm = (buf) => !!buf && buf.byteLength > 8 && new Uint8Array(buf, 0, 4).join(',') === '0,97,115,109';   // starts with "\0asm"

function assets(model) {
  if (!cache[model]) {
    const job = model === 'rnnoise'
      ? loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }).then((wasm) => ({ worklet: rnnoiseWorkletUrl, wasm }))
      : loadGtcrn({ url: gtcrnWasmUrl }).then((wasm) => ({ worklet: gtcrnWorkletUrl, wasm }));
    cache[model] = job
      .then((a) => { if (!isWasm(a.wasm)) throw new Error('the noise model file could not be loaded'); return a; })
      .catch((e) => { delete cache[model]; throw e; });
  }
  return cache[model];
}

// Download the model ahead of time (for example while the person is still in the lobby) so the join is instant. Never throws.
export function preloadMicModel(model) { return assets(model === 'rnnoise' ? 'rnnoise' : 'gtcrn').catch(() => null); }

const withTimeout = (promise, ms, what) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(what)), ms))]);
const peakOf = (a) => { let p = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > p) p = v; } return p; };
const rmsOf = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / (a.length || 1)); };

// Until its WebAssembly has started, a worklet outputs exact digital silence, and if that start fails it stays silent for ever without
// saying so. So feed it a short burst of noise and wait until something comes out: only then is it safe to use.
function modelAlive(ctx, model, meter, timeoutMs) {
  const buf = ctx.createBuffer(1, Math.round(ctx.sampleRate / 4), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
  const probe = ctx.createBufferSource(); probe.buffer = buf; probe.loop = true; probe.connect(model); probe.start();
  const data = new Float32Array(meter.fftSize);
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      meter.getFloatTimeDomainData(data);
      const alive = peakOf(data) > 1e-7, late = performance.now() - t0 > timeoutMs;
      if (!alive && !late) return;
      clearInterval(iv);
      try { probe.stop(); probe.disconnect(); } catch { /* already stopped */ }
      if (alive) resolve(); else reject(new Error('the noise model did not start'));
    }, 40);
  });
}

// Start noise removal for one microphone track. Resolves with { track, model, context, stop } where `track` is the cleaned voice (send
// this instead of the raw track). Rejects if anything is unsupported or broken (the caller then simply keeps the plain microphone).
// onLost(reason) is called once if the processing dies later: 'overload' | 'suspended' | 'crashed' | 'silent' | 'ended'.
// `stop()` releases the audio context; it never stops the raw microphone track (the page owns that).
export async function startMicDenoise(rawTrack, { model = 'gtcrn', onLost = () => {}, readyTimeoutMs = 6000 } = {}) {
  if (!rawTrack || rawTrack.kind !== 'audio' || rawTrack.readyState !== 'live') throw new Error('there is no live microphone');
  const which = model === 'rnnoise' ? 'rnnoise' : 'gtcrn';
  const { worklet, wasm } = await assets(which);
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC({ sampleRate: RATE, latencyHint: 'interactive' });
  const cleanups = [];
  let stopped = false, lost = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cleanups.splice(0).forEach((fn) => { try { fn(); } catch { /* already gone */ } });
    ctx.close().catch(() => {});
  };
  const fail = (reason) => { if (stopped || lost) return; lost = true; stop(); try { onLost(reason); } catch { /* caller's problem */ } };

  try {
    await ctx.audioWorklet.addModule(worklet);
    if (ctx.state !== 'running') await withTimeout(ctx.resume(), 1500, 'the audio context could not start');
    if (ctx.state !== 'running') throw new Error(`the audio context is ${ctx.state}`);
    if (ctx.sampleRate !== RATE) throw new Error(`the audio context runs at ${ctx.sampleRate} Hz, not ${RATE} Hz`);

    const node = which === 'rnnoise' ? new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary: wasm }) : new GtcrnWorkletNode(ctx, { maxChannels: 1, wasmBinary: wasm });
    node.channelCount = 1; node.channelCountMode = 'explicit'; node.channelInterpretation = 'speakers';   // always mono in, mono out
    node.onprocessorerror = () => fail('crashed');
    const out = ctx.createMediaStreamDestination(); out.channelCount = 1;
    const outMeter = ctx.createAnalyser(); outMeter.fftSize = 2048;
    node.connect(out); node.connect(outMeter);
    cleanups.push(() => { try { node.destroy(); } catch { /* ignore */ } node.disconnect(); out.disconnect(); });

    await modelAlive(ctx, node, outMeter, readyTimeoutMs);

    const mic = ctx.createMediaStreamSource(new MediaStream([rawTrack]));
    const micMeter = ctx.createAnalyser(); micMeter.fftSize = 2048;
    mic.connect(node); mic.connect(micMeter);
    cleanups.push(() => mic.disconnect());

    const track = out.stream.getAudioTracks()[0];
    if (!track) throw new Error('no processed audio track');
    try { track.contentHint = 'speech'; } catch { /* read-only in some browsers */ }
    track.addEventListener('ended', () => fail('ended'));

    // ---- watch for trouble: any of these hands the plain microphone back ----
    ctx.addEventListener('statechange', () => {                      // another app grabbed the audio device, the browser paused audio, ...
      if (stopped || ctx.state === 'running') return;
      ctx.resume().catch(() => {});
      setTimeout(() => { if (!stopped && ctx.state !== 'running') fail('suspended'); }, 1500);
    });
    if (ctx.renderCapacity && ctx.renderCapacity.start) {            // the browser tells us when the audio thread cannot keep up
      let strikes = 0;
      const onUpdate = (e) => { strikes = e.underrunRatio > OVERLOAD_RATIO ? strikes + 1 : 0; if (strikes >= OVERLOAD_SECONDS) fail('overload'); };
      ctx.renderCapacity.addEventListener('update', onUpdate);
      ctx.renderCapacity.start({ updateInterval: 1 });
      cleanups.push(() => { ctx.renderCapacity.removeEventListener('update', onUpdate); ctx.renderCapacity.stop(); });
    }
    const a = new Float32Array(micMeter.fftSize), b = new Float32Array(outMeter.fftSize);
    let deadMs = 0;
    const watch = setInterval(() => {                                // the microphone is clearly loud but nothing at all comes out of the model
      micMeter.getFloatTimeDomainData(a); outMeter.getFloatTimeDomainData(b);
      if (peakOf(b) > 0) deadMs = 0;                                 // the model is answering: all good
      else if (rmsOf(a) > 0.02) deadMs += 250;                       // loud input, exact silence out (pauses in speech do not reset this)
      if (deadMs >= 3000) fail('silent');
    }, 250);
    cleanups.push(() => clearInterval(watch));

    return { track, model: which, context: ctx, meters: { mic: micMeter, out: outMeter }, stop };
  } catch (e) {
    stop();
    throw e;
  }
}