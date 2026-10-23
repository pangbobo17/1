// 解码音频、生成波形、重采样为 16kHz 单声道后交给 Whisper worker
let worker = null;

export async function decodeFile(file) {
  const buf = await file.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(buf);
  } finally {
    ctx.close?.();
  }
}

/** 每个区间的峰值（0..1），用来画波形 */
export function computePeaks(buffer, bins = 1200) {
  const ch = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(ch.length / bins));
  const peaks = new Float32Array(bins);
  let max = 0;
  for (let b = 0; b < bins; b++) {
    let m = 0;
    const end = Math.min(ch.length, (b + 1) * size);
    for (let i = b * size; i < end; i += 8) {
      const v = Math.abs(ch[i]);
      if (v > m) m = v;
    }
    peaks[b] = m;
    if (m > max) max = m;
  }
  if (max > 0) for (let b = 0; b < bins; b++) peaks[b] /= max;
  return peaks;
}

export async function to16k(buffer) {
  const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * 16000), 16000);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

/**
 * language 传 null 表示自动判断。
 * onProgress({stage: 'download'|'detect'|'transcribe', value: 0..1, loaded?, total?})；判断出语言时 onLanguage({code, prob})。
 * 返回 {words, language}
 */
export function transcribe(samples, { model, language }, onProgress, onLanguage) {
  worker ??= new Worker(new URL('./asr-worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress?.(data);
      else if (data.type === 'language') onLanguage?.(data);
      else if (data.type === 'done') resolve({ words: data.words, language: data.language });
      else if (data.type === 'error') reject(new Error(data.message));
    };
    worker.onerror = (e) => {
      reject(new Error(e.message || '识别模块加载失败，请检查网络'));
      worker = null;
    };
    const copy = samples.slice();
    worker.postMessage({ type: 'transcribe', audio: copy, model, language }, [copy.buffer]);
  });
}
