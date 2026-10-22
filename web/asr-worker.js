// 在后台线程里运行 Whisper（transformers.js），输出带时间戳的词
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

const SR = 16000;
const WINDOW = 30;   // Whisper 一次最多处理 30 秒
const STEP = 25;     // 相邻窗口重叠 5 秒，每个窗口只保留中间那段，避免切断的词
const MARGIN = (WINDOW - STEP) / 2;

let asr = null;
let loadedKey = '';

async function hasWebGPU() {
  try {
    return !!(self.navigator.gpu && (await self.navigator.gpu.requestAdapter()));
  } catch {
    return false;
  }
}

async function load(model) {
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status !== 'progress' || !p.total) return;
    files.set(p.file, [p.loaded, p.total]);
    let loaded = 0, total = 0;
    for (const [l, t] of files.values()) { loaded += l; total += t; }
    self.postMessage({ type: 'progress', stage: 'download', value: loaded / total, loaded, total });
  };
  if (await hasWebGPU()) {
    try {
      return await pipeline('automatic-speech-recognition', model, {
        device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback,
      });
    } catch (e) {
      console.warn('WebGPU 加载失败，改用 WASM', e);
    }
  }
  return pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback });
}

self.onmessage = async ({ data }) => {
  if (data.type !== 'transcribe') return;
  const { audio, model, language } = data;
  try {
    if (!asr || loadedKey !== model) {
      self.postMessage({ type: 'progress', stage: 'download', value: 0 });
      asr = await load(model);
      loadedKey = model;
    }
    const duration = audio.length / SR;
    const count = duration <= WINDOW ? 1 : Math.ceil((duration - WINDOW) / STEP) + 1;
    const words = [];
    for (let w = 0; w < count; w++) {
      self.postMessage({ type: 'progress', stage: 'transcribe', value: w / count });
      const start = w * STEP;
      const chunk = audio.subarray(start * SR, Math.min((start + WINDOW) * SR, audio.length));
      const out = await asr(chunk, { return_timestamps: 'word', language, task: 'transcribe' });
      const lo = w === 0 ? 0 : start + MARGIN;
      const hi = w === count - 1 ? Infinity : start + STEP + MARGIN;
      for (const c of out.chunks ?? []) {
        const s = c.timestamp[0] + start;
        const e = (c.timestamp[1] ?? c.timestamp[0] + 0.3) + start;
        if (s >= lo && s < hi && c.text.trim()) words.push({ text: c.text, start: s, end: Math.max(e, s) });
      }
    }
    self.postMessage({ type: 'done', words });
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e?.message ?? e) });
  }
};
