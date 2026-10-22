import { alignLyrics, segmentLines, cleanLyrics, exportLyrics, lrcTime } from './align.js';
import { decodeTo16k, transcribe } from './asr.js';

const $ = (id) => document.getElementById(id);
const els = {
  audioInput: $('audio-input'), audioName: $('audio-name'), audioMeta: $('audio-meta'),
  lyrics: $('lyrics'), lyricsFile: $('lyrics-file'), lang: $('lang'), model: $('model'),
  auto: $('btn-auto'), manual: $('btn-manual'),
  status: $('status'), statusFill: $('status-fill'), statusText: $('status-text'),
  editor: $('editor'), editorHint: $('editor-hint'), lines: $('lines'),
  exportText: $('export-text'), save: $('btn-save'), copy: $('btn-copy'),
  player: $('player'), seek: $('seek'), clock: $('clock'), audio: $('audio'),
  play: $('btn-play'), back: $('btn-back'), fwd: $('btn-fwd'), undo: $('btn-undo'), tap: $('btn-tap'),
  toast: $('toast'),
};

const WHISPER_LANG = { zh: 'chinese', yue: 'chinese', en: 'english', ja: 'japanese', ko: 'korean' };
const STORE_KEY = 'lyricsync.v1';

const state = {
  file: null,
  duration: 0,
  lines: [],        // [{text, start, end, words:[{text,start,end,matched}], confidence}]，start 为 null 表示还没打点
  undo: [],
  current: -1,
  selected: -1,     // 展开了微调按钮的行
  format: 'lrc',
  busy: false,
};

// ---------- 本地保存（只存在这台设备的浏览器里） ----------

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      lyrics: els.lyrics.value, lines: state.lines, lang: els.lang.value, model: els.model.value,
      audioName: state.file?.name ?? restoredAudioName,
    }));
  } catch {}
}

let restoredAudioName = '';
function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!s) return;
    els.lyrics.value = s.lyrics ?? '';
    if (s.lang) els.lang.value = s.lang;
    if (s.model) els.model.value = s.model;
    state.lines = Array.isArray(s.lines) ? s.lines : [];
    restoredAudioName = s.audioName ?? '';
  } catch {}
}

// ---------- 导入 ----------

els.audioInput.addEventListener('change', () => {
  const file = els.audioInput.files[0];
  if (!file) return;
  state.file = file;
  if (els.audio.src) URL.revokeObjectURL(els.audio.src);
  els.audio.src = URL.createObjectURL(file);
  els.audioName.textContent = file.name.replace(/\.[^.]+$/, '');
  els.audioMeta.textContent = '';
  els.audioInput.closest('.field').querySelector('.file-btn').classList.add('has-file');
  updateButtons();
  save();
});

els.audio.addEventListener('loadedmetadata', () => {
  state.duration = els.audio.duration || 0;
  els.audioMeta.textContent = lrcTime(state.duration).slice(0, 5);
  els.seek.max = String(state.duration || 1);
});

els.lyricsFile.addEventListener('change', async () => {
  const file = els.lyricsFile.files[0];
  if (!file) return;
  els.lyrics.value = await readText(file);
  els.lyricsFile.value = '';
  updateButtons();
  save();
});

async function readText(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gb18030').decode(buf); // 老的中文 .lrc 常用 GBK 编码
  }
}

els.lyrics.addEventListener('input', () => { updateButtons(); save(); });
els.lang.addEventListener('change', save);
els.model.addEventListener('change', save);

function updateButtons() {
  const hasLyrics = cleanLyrics(els.lyrics.value).length > 0;
  els.auto.textContent = hasLyrics ? '自动对齐' : '自动识别歌词';
  els.auto.disabled = !state.file || state.busy;
  els.manual.disabled = !state.file || !hasLyrics || state.busy;
}

// ---------- 识别与对齐 ----------

function showStatus(text, value = null, error = false) {
  els.status.hidden = false;
  els.status.classList.toggle('error', error);
  els.statusText.textContent = text;
  els.statusFill.style.width = value == null ? '0' : `${Math.round(value * 100)}%`;
}

let pinyinFn = null;
async function loadPinyin() {
  if (pinyinFn) return pinyinFn;
  try {
    const { pinyin } = await import('https://cdn.jsdelivr.net/npm/pinyin-pro@3.27.0/dist/index.mjs');
    const cache = new Map();
    pinyinFn = (s) => {
      if (!cache.has(s)) cache.set(s, pinyin(s, { toneType: 'none' }).replace(/\s+/g, ''));
      return cache.get(s);
    };
  } catch {
    pinyinFn = null; // 拼音库加载失败时只按字比对
  }
  return pinyinFn;
}

els.auto.addEventListener('click', async () => {
  if (!state.file || state.busy) return;
  state.busy = true;
  updateButtons();
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  try {
    showStatus('正在读取音频…');
    const { samples, duration } = await decodeTo16k(state.file);
    state.duration = duration;
    const words = await transcribe(samples, { model: els.model.value, language: WHISPER_LANG[els.lang.value] }, (p) => {
      if (p.stage === 'download') {
        const mb = p.total ? `（${(p.loaded / 1e6).toFixed(0)} / ${(p.total / 1e6).toFixed(0)} MB）` : '';
        showStatus(`正在下载识别模型，只需一次${mb}`, p.value);
      } else {
        showStatus(`正在识别歌词… ${Math.round(p.value * 100)}%`, p.value);
      }
    });
    const lyricLines = cleanLyrics(els.lyrics.value);
    if (lyricLines.length) {
      showStatus('正在逐行对齐…', 1);
      const phonetic = els.lang.value === 'zh' ? await loadPinyin() : null;
      setLines(alignLyrics(lyricLines, words, duration, { phonetic }));
    } else {
      setLines(segmentLines(words));
    }
    if (!state.lines.length) {
      showStatus('没有识别到人声。请确认语言设置，或改用“手动打点”。', 0, true);
    } else {
      const low = state.lines.filter((l) => l.confidence != null && l.confidence < 0.5).length;
      showStatus(low ? `完成。有 ${low} 行匹配度低（标了“需检查”），建议播放核对。` : '完成。播放核对一下，有偏差可以微调。', 1);
      els.editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (e) {
    console.error(e);
    showStatus(`识别失败：${e.message}。可以换“快速”模型重试，或改用“手动打点”。`, 0, true);
  } finally {
    wakeLock?.release?.().catch(() => {});
    state.busy = false;
    updateButtons();
  }
});

els.manual.addEventListener('click', () => {
  const lyricLines = cleanLyrics(els.lyrics.value);
  if (!lyricLines.length) return;
  setLines(lyricLines.map((text) => ({ text, start: null, end: null, words: [], confidence: null })));
  els.status.hidden = true;
  toast('播放歌曲，每句开始唱时点“打点”');
  els.editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function setLines(lines) {
  state.lines = lines;
  state.undo = [];
  state.selected = -1;
  state.current = -1;
  renderLines();
  save();
}

// ---------- 时间轴列表 ----------

function renderLines() {
  const has = state.lines.length > 0;
  els.editor.hidden = !has;
  els.player.hidden = !has;
  els.undo.disabled = state.undo.length === 0;
  if (!has) return;

  const unset = state.lines.filter((l) => l.start == null).length;
  els.editorHint.textContent = !state.file
    ? `已恢复上次的时间轴。请重新选择音频“${baseName()}”才能播放。`
    : unset ? `还有 ${unset} 行没打点` : '点歌词跳到该句，点时间可微调';

  els.lines.replaceChildren(...state.lines.map((line, i) => {
    const li = document.createElement('li');
    li.className = 'line';
    li.dataset.i = i;
    const ts = document.createElement('button');
    ts.type = 'button';
    ts.className = 'ts' + (line.start == null ? ' unset' : '');
    ts.textContent = line.start == null ? '--:--.--' : lrcTime(line.start);
    ts.setAttribute('aria-label', `调整第 ${i + 1} 行时间`);
    ts.dataset.act = 'select';
    const text = document.createElement('div');
    text.className = 'text';
    text.dataset.act = 'seek';
    if (line.words.length) {
      for (const w of line.words) {
        const span = document.createElement('span');
        span.className = 'w';
        span.textContent = w.text;
        text.append(span);
      }
    } else {
      text.textContent = line.text;
    }
    if (line.confidence != null && line.confidence < 0.5) {
      const low = document.createElement('span');
      low.className = 'low';
      low.textContent = '需检查';
      text.append(low);
    }
    li.append(ts, text);
    if (i === state.selected) {
      const tools = document.createElement('div');
      tools.className = 'tools';
      tools.innerHTML = '<button type="button" data-act="minus">−0.1 秒</button>' +
        '<button type="button" data-act="plus">+0.1 秒</button>' +
        '<button type="button" class="set" data-act="now">设为当前播放位置</button>';
      li.append(tools);
    }
    return li;
  }));
  state.current = -1;
  updateExport();
  tick(true);
}

els.lines.addEventListener('click', (e) => {
  const target = e.target.closest('[data-act]');
  const li = e.target.closest('.line');
  if (!target || !li) return;
  const i = Number(li.dataset.i);
  const line = state.lines[i];
  switch (target.dataset.act) {
    case 'select':
      state.selected = state.selected === i ? -1 : i;
      renderLines();
      break;
    case 'seek':
      if (line.start != null && els.audio.src) {
        els.audio.currentTime = line.start;
        els.audio.play().catch(() => {});
      }
      break;
    case 'minus': edit(() => setStart(i, (line.start ?? 0) - 0.1)); break;
    case 'plus': edit(() => setStart(i, (line.start ?? 0) + 0.1)); break;
    case 'now': edit(() => setStart(i, els.audio.currentTime)); break;
  }
});

/** 改一行的开始时间：有逐字时间的整行平移；同时把上一行的结束时间接上 */
function setStart(i, time) {
  const line = state.lines[i];
  const t = Math.max(0, Math.round(time * 100) / 100);
  if (line.start != null && line.words.length) {
    const d = t - line.start;
    line.end += d;
    for (const w of line.words) { w.start += d; w.end += d; }
  } else {
    line.end = line.end != null && line.end > t ? line.end : t;
  }
  line.start = t;
  const prev = state.lines[i - 1];
  if (prev && prev.start != null && !prev.words.length && t > prev.start) prev.end = t;
}

function edit(fn) {
  state.undo.push(JSON.stringify(state.lines));
  if (state.undo.length > 100) state.undo.shift();
  fn();
  renderLines();
  save();
}

els.undo.addEventListener('click', () => {
  const prev = state.undo.pop();
  if (!prev) return;
  state.lines = JSON.parse(prev);
  renderLines();
  save();
});

// 打点：没打完时按顺序给下一句设开始时间；全部打完后，给当前句的下一句设时间
els.tap.addEventListener('click', () => {
  if (!els.audio.src) return toast('先选择音频');
  let i = state.lines.findIndex((l) => l.start == null);
  if (i < 0) i = state.current + 1;
  if (i >= state.lines.length) return toast('已经是最后一句');
  edit(() => setStart(i, els.audio.currentTime));
});

// ---------- 播放 ----------

els.play.addEventListener('click', () => {
  if (!els.audio.src) return toast('先选择音频');
  if (els.audio.paused) els.audio.play().catch(() => {}); else els.audio.pause();
});
els.back.addEventListener('click', () => { els.audio.currentTime = Math.max(0, els.audio.currentTime - 5); tick(true); });
els.fwd.addEventListener('click', () => { els.audio.currentTime = Math.min(state.duration, els.audio.currentTime + 5); tick(true); });
els.seek.addEventListener('input', () => { els.audio.currentTime = Number(els.seek.value); tick(true); });
els.audio.addEventListener('play', () => { els.play.textContent = '❚❚'; els.play.setAttribute('aria-label', '暂停'); loop(); });
els.audio.addEventListener('pause', () => { els.play.textContent = '▶'; els.play.setAttribute('aria-label', '播放'); });

function loop() {
  tick();
  if (!els.audio.paused) requestAnimationFrame(loop);
}

function tick(force = false) {
  const t = els.audio.currentTime || 0;
  els.clock.textContent = lrcTime(t);
  if (document.activeElement !== els.seek) els.seek.value = String(t);
  let cur = -1;
  state.lines.forEach((l, i) => { if (l.start != null && l.start <= t + 0.01) cur = i; });
  const rows = els.lines.children;
  if (cur !== state.current || force) {
    rows[state.current]?.classList.remove('current');
    rows[cur]?.classList.add('current');
    if (cur >= 0 && cur !== state.current && !els.audio.paused) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      rows[cur]?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    }
    state.current = cur;
  }
  // 当前行逐字变色（卡拉 OK 效果）
  const line = state.lines[cur];
  if (line?.words.length) {
    const spans = rows[cur].querySelectorAll('.w');
    line.words.forEach((w, k) => spans[k]?.classList.toggle('sung', w.start <= t));
  }
}

// ---------- 导出 ----------

els.editor.querySelector('.seg').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-format]');
  if (!btn) return;
  state.format = btn.dataset.format;
  for (const b of els.editor.querySelectorAll('.seg button')) b.setAttribute('aria-checked', String(b === btn));
  updateExport();
});

function baseName() {
  return (state.file?.name || restoredAudioName || '歌词').replace(/\.[^.]+$/, '') || '歌词';
}

function updateExport() {
  els.exportText.value = exportLyrics(state.lines, state.format, baseName());
}

els.save.addEventListener('click', async () => {
  const text = els.exportText.value;
  const name = `${baseName()}.${state.format === 'srt' ? 'srt' : 'lrc'}`;
  const file = new File([text], name, { type: 'text/plain' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

els.copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.exportText.value);
    toast('已复制');
  } catch {
    els.exportText.select();
    toast('已选中，长按即可复制');
  }
});

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
}

// ---------- 启动 ----------

restore();
updateButtons();
renderLines();
if (els.lang.value === 'zh') loadPinyin(); // 提前加载拼音库，体积很小
