// 解码音频 → 16kHz 单声道 → 交给 Whisper worker
let worker = null;

export async function decodeTo16k(file) {
  const buf = await file.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await ctx.decodeAudioData(buf);
  ctx.close?.();
  const length = Math.ceil(decoded.duration * 16000);
  const offline = new OfflineAudioContext(1, length, 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return { samples: rendered.getChannelData(0), duration: decoded.duration };
}

/** onProgress({stage: 'download'|'transcribe', value: 0..1}) */
export function transcribe(samples, { model, language }, onProgress) {
  worker ??= new Worker(new URL('./asr-worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress?.(data);
      else if (data.type === 'done') resolve(data.words);
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
