// 在后台线程里运行 Whisper（transformers.js），输出带时间戳的词
import { pipeline, Tensor } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

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

/**
 * 判断语言：取歌曲中间几段（避开前奏），让模型只预测 <|startoftranscript|> 之后的第一个 token，
 * 在所有语言 token 里看哪个概率最高。transformers.js 自己没有实现这一步，不指定语言会默认英语。
 */
async function detectLanguage(audio) {
  const gc = asr.model.generation_config;
  const langIds = Object.entries(gc.lang_to_id ?? {});
  if (!langIds.length) return null;
  const duration = audio.length / SR;
  const starts = duration <= WINDOW ? [0] : [0.2, 0.45, 0.7].map((f) => Math.max(0, Math.min(duration - WINDOW, f * duration - WINDOW / 2)));
  const score = new Map();
  for (const start of starts) {
    const chunk = audio.subarray(Math.floor(start * SR), Math.min(audio.length, Math.floor((start + WINDOW) * SR)));
    const { input_features } = await asr.processor(chunk);
    const decoder_input_ids = new Tensor('int64', BigInt64Array.from([BigInt(gc.decoder_start_token_id)]), [1, 1]);
    const { logits } = await asr.model({ input_features, decoder_input_ids });
    const data = logits.data;
    let max = -Infinity;
    for (const [, id] of langIds) max = Math.max(max, data[id]);
    let sum = 0;
    const probs = langIds.map(([tok, id]) => { const e = Math.exp(data[id] - max); sum += e; return [tok, e]; });
    for (const [tok, e] of probs) score.set(tok, (score.get(tok) ?? 0) + e / sum / starts.length);
  }
  const [token, prob] = [...score].sort((a, b) => b[1] - a[1])[0];
  return { code: token.replace(/<\|(.+)\|>/, '$1'), prob };
}

self.onmessage = async ({ data }) => {
  if (data.type !== 'transcribe') return;
  const { audio, model } = data;
  let { language } = data;
  try {
    if (!asr || loadedKey !== model) {
      self.postMessage({ type: 'progress', stage: 'download', value: 0 });
      asr = await load(model);
      loadedKey = model;
    }
    if (!language) {
      self.postMessage({ type: 'progress', stage: 'detect', value: 0 });
      const detected = await detectLanguage(audio);
      language = detected?.code ?? 'en';
      self.postMessage({ type: 'language', ...detected });
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
    self.postMessage({ type: 'done', words, language });
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e?.message ?? e) });
  }
};
