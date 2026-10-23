import { alignLyrics, segmentLines, cleanLyrics, exportLyrics, lrcTime } from './align.js';
import { decodeFile, computePeaks, to16k, transcribe } from './asr.js';

const $ = (id) => document.getElementById(id);
const els = {
  setup: $('view-setup'), editor: $('view-editor'),
  resume: $('resume'), resumeTitle: $('resume-title'),
  audioInput: $('audio-input'), song: document.querySelector('.song'), songEmpty: $('song-empty'),
  songInfo: $('song-info'), songName: $('song-name'), songMeta: $('song-meta'), songWave: $('song-wave'),
  lyrics: $('lyrics'), lyricsFile: $('lyrics-file'), lyricsCount: $('lyrics-count'),
  auto: $('btn-auto'), manual: $('btn-manual'),
  progress: $('progress'), progressText: $('progress-text'), progressPct: $('progress-pct'), progressFill: $('progress-fill'),
  back: $('btn-back'), exportBtn: $('btn-export'), editorTitle: $('editor-title'), editorSub: $('editor-sub'),
  needAudio: $('need-audio'), needAudioName: $('need-audio-name'),
  lines: $('lines'), wave: $('wave'), clock: $('clock'),
  rew: $('btn-rew'), play: $('btn-play'), fwd: $('btn-fwd'), undo: $('btn-undo'), tap: $('btn-tap'), tapHint: $('tap-hint'),
  sheetLine: $('sheet-line'), slText: $('sl-text'), slTime: $('sl-time'), slNow: $('sl-now'), slNowTime: $('sl-now-time'), slPlay: $('sl-play'),
  sheetExport: $('sheet-export'), exDesc: $('ex-desc'), exportText: $('export-text'), save: $('btn-save'), copy: $('btn-copy'),
  audio: $('audio'), toast: $('toast'),
};

const WHISPER_LANG = { zh: 'chinese', yue: 'chinese', en: 'english', ja: 'japanese', ko: 'korean' };
const FORMAT_DESC = {
  lrc: '最常用的歌词格式，音乐播放器都支持。',
  klrc: '带每个字的时间，可用于卡拉 OK 逐字变色。',
  srt: '视频字幕格式，剪映、Premiere 等都能导入。',
};
const STORE_KEY = 'lyricsync.v2';

const state = {
  file: null,
  audioName: '',
  peaks: null,
  duration: 0,
  lines: [],       // [{text, start, end, words:[{text,start,end,matched}], confidence}]，start 为 null 表示还没打点
  undo: [],
  current: -1,
  sheetIndex: -1,
  format: 'lrc',
  busy: false,
  options: { lang: 'zh', model: 'onnx-community/whisper-base_timestamped' },
};

// ---------- 本地保存（只在这台设备的浏览器里） ----------

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      lyrics: els.lyrics.value, lines: state.lines, options: state.options, audioName: state.audioName,
    }));
  } catch {}
}

function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (!s) return;
    els.lyrics.value = s.lyrics ?? '';
    Object.assign(state.options, s.options);
    state.lines = Array.isArray(s.lines) ? s.lines : [];
    state.audioName = s.audioName ?? '';
  } catch {}
}

// ---------- 页面切换 ----------

function showView(name) {
  els.setup.hidden = name !== 'setup';
  els.editor.hidden = name !== 'editor';
  if (name === 'editor') {
    renderLines();
    requestAnimationFrame(() => { sizeCanvas(els.wave); drawWave(); });
  } else {
    els.audio.pause();
    updateSetup();
  }
  window.scrollTo(0, 0);
}

els.back.addEventListener('click', () => showView('setup'));
els.resume.addEventListener('click', () => showView('editor'));

// ---------- 新建页 ----------

function songHue(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function setHue(name) {
  document.documentElement.style.setProperty('--h', name ? String(songHue(name)) : '14');
}

const displayName = () => state.audioName.replace(/\.[^.]+$/, '') || '未命名歌曲';

els.audioInput.addEventListener('change', async () => {
  const file = els.audioInput.files[0];
  els.audioInput.value = '';
  if (!file) return;
  state.file = file;
  state.audioName = file.name;
  state.peaks = null;
  state.duration = 0;
  if (els.audio.src) URL.revokeObjectURL(els.audio.src);
  els.audio.src = URL.createObjectURL(file);
  setHue(file.name);
  updateSetup();
  save();
  try {
    const buffer = await decodeFile(file);
    if (state.file !== file) return;
    state.duration = buffer.duration;
    state.peaks = computePeaks(buffer);
    updateSetup();
    if (!els.editor.hidden) drawWave();
  } catch {
    toast('这个文件读不出声音，换一个试试');
  }
});

els.audio.addEventListener('loadedmetadata', () => {
  if (!state.duration) state.duration = els.audio.duration || 0;
  updateSetup();
});

els.lyricsFile.addEventListener('change', async () => {
  const file = els.lyricsFile.files[0];
  els.lyricsFile.value = '';
  if (!file) return;
  els.lyrics.value = await readText(file);
  updateSetup();
  save();
});

async function readText(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gb18030').decode(buf); // 老的中文 .lrc 常是 GBK 编码
  }
}

els.lyrics.addEventListener('input', () => { updateSetup(); save(); });

for (const group of document.querySelectorAll('.chips[data-name]')) {
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    state.options[group.dataset.name] = btn.dataset.value;
    syncChips();
    save();
  });
}

function syncChips() {
  for (const group of document.querySelectorAll('.chips[data-name]')) {
    for (const b of group.querySelectorAll('button')) {
      b.setAttribute('aria-checked', String(b.dataset.value === state.options[group.dataset.name]));
    }
  }
}

function updateSetup() {
  const lyricLines = cleanLyrics(els.lyrics.value);
  els.lyricsCount.textContent = lyricLines.length ? `${lyricLines.length} 行` : '';
  els.auto.textContent = lyricLines.length ? '自动对齐' : '自动识别歌词';
  els.auto.disabled = !state.file || state.busy;
  els.manual.disabled = !state.file || !lyricLines.length || state.busy;

  const has = !!state.file;
  els.song.classList.toggle('has-file', has);
  els.songEmpty.hidden = has;
  els.songInfo.hidden = !has;
  if (has) {
    els.songName.textContent = displayName();
    els.songMeta.textContent = state.duration ? lrcTime(state.duration).slice(0, 5) : '';
    requestAnimationFrame(() => { sizeCanvas(els.songWave); drawPeaks(els.songWave, { progress: 1 }); });
  }

  els.resume.hidden = !state.lines.length;
  els.resumeTitle.textContent = `${displayName()} · ${state.lines.length} 行`;
}

// ---------- 识别与对齐 ----------

function showProgress(text, value = null, error = false) {
  els.progress.hidden = false;
  els.progress.classList.toggle('error', error);
  els.progressText.textContent = text;
  els.progressPct.textContent = value == null || error ? '' : `${Math.round(value * 100)}%`;
  els.progressFill.style.width = value == null ? '0' : `${Math.round(value * 100)}%`;
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
  updateSetup();
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  try {
    showProgress('正在读取音频…', 0);
    const buffer = await decodeFile(state.file);
    state.duration = buffer.duration;
    state.peaks ??= computePeaks(buffer);
    const samples = await to16k(buffer);
    const { lang, model } = state.options;
    const words = await transcribe(samples, { model, language: WHISPER_LANG[lang] }, (p) => {
      if (p.stage === 'download') {
        const mb = p.total ? ` ${(p.loaded / 1e6).toFixed(0)}/${(p.total / 1e6).toFixed(0)}MB` : '';
        showProgress(`下载识别模型（仅首次）${mb}`, p.value);
      } else {
        showProgress('正在听歌识词…', p.value);
      }
    });
    const lyricLines = cleanLyrics(els.lyrics.value);
    if (lyricLines.length) {
      showProgress('正在逐行对齐…', 1);
      const phonetic = lang === 'zh' ? await loadPinyin() : null;
      setLines(alignLyrics(lyricLines, words, state.duration, { phonetic }));
    } else {
      setLines(segmentLines(words));
    }
    if (!state.lines.length) {
      showProgress('没有识别到人声。检查一下演唱语言，或者用手动打点。', 0, true);
    } else {
      els.progress.hidden = true;
      const low = state.lines.filter((l) => l.confidence != null && l.confidence < 0.5).length;
      showView('editor');
      toast(low ? `完成，有 ${low} 行需要检查` : '完成，播放核对一下');
    }
  } catch (e) {
    console.error(e);
    showProgress(`识别失败：${e.message}。可以换“快速”模型重试，或者用手动打点。`, 0, true);
  } finally {
    wakeLock?.release?.().catch(() => {});
    state.busy = false;
    updateSetup();
  }
});

els.manual.addEventListener('click', () => {
  const lyricLines = cleanLyrics(els.lyrics.value);
  if (!lyricLines.length) return;
  setLines(lyricLines.map((text) => ({ text, start: null, end: null, words: [], confidence: null })));
  els.progress.hidden = true;
  showView('editor');
  toast('播放歌曲，每句开口时点“打点”');
});

function setLines(lines) {
  state.lines = lines;
  state.undo = [];
  state.current = -1;
  save();
}

// ---------- 歌词列表 ----------

function renderLines() {
  els.editorTitle.textContent = displayName();
  els.undo.disabled = state.undo.length === 0;
  els.needAudio.hidden = !!state.file;
  els.needAudioName.textContent = displayName();

  els.lines.replaceChildren(...state.lines.map((line, i) => {
    const li = document.createElement('li');
    li.className = 'line';
    li.dataset.i = i;
    const ts = document.createElement('button');
    ts.type = 'button';
    ts.className = 'ts' + (line.start == null ? ' unset' : '');
    ts.dataset.act = 'adjust';
    ts.append(line.start == null ? '--:--.--' : lrcTime(line.start));
    if (line.confidence != null && line.confidence < 0.5) {
      const flag = document.createElement('span');
      flag.className = 'flag';
      flag.textContent = '需检查';
      ts.append(flag);
    }
    ts.setAttribute('aria-label', `调整第 ${i + 1} 句的时间`);
    const text = document.createElement('button');
    text.type = 'button';
    text.className = 'text' + (line.words.length ? '' : ' plain');
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
    li.append(ts, text);
    return li;
  }));
  state.current = -1;
  updateEditorMeta();
  tick(true);
}

function updateEditorMeta() {
  const unset = state.lines.filter((l) => l.start == null).length;
  const low = state.lines.filter((l) => l.confidence != null && l.confidence < 0.5).length;
  els.editorSub.textContent = unset ? `还有 ${unset} 句没打点` : low ? `${state.lines.length} 句 · ${low} 句需检查` : `${state.lines.length} 句`;
  els.undo.disabled = state.undo.length === 0;
}

els.needAudio.addEventListener('click', () => els.audioInput.click());
els.audioInput.addEventListener('change', () => {
  if (!els.editor.hidden) setTimeout(() => { renderLines(); sizeCanvas(els.wave); drawWave(); }, 0);
});

els.lines.addEventListener('click', (e) => {
  const target = e.target.closest('[data-act]');
  const li = e.target.closest('.line');
  if (!target || !li) return;
  const i = Number(li.dataset.i);
  if (target.dataset.act === 'adjust') openLineSheet(i);
  else playFrom(i);
});

function playFrom(i) {
  const line = state.lines[i];
  if (!state.file) return toast('先重新选择音频');
  if (line.start == null) return openLineSheet(i);
  els.audio.currentTime = Math.max(0, line.start - 0.05);
  els.audio.play().catch(() => {});
  tick(true);
}

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
  refreshRows();
  save();
}

/** 只更新时间标签，不重建整个列表（保持滚动位置） */
function refreshRows() {
  state.lines.forEach((line, i) => {
    const ts = els.lines.children[i]?.querySelector('.ts');
    if (!ts) return;
    ts.firstChild.textContent = line.start == null ? '--:--.--' : lrcTime(line.start);
    ts.classList.toggle('unset', line.start == null);
  });
  updateEditorMeta();
  if (els.sheetLine.open) fillLineSheet();
  state.current = -1;
  tick(true);
}

els.undo.addEventListener('click', () => {
  const prev = state.undo.pop();
  if (!prev) return;
  state.lines = JSON.parse(prev);
  refreshRows();
  save();
});

// 打点：没打完时按顺序给下一句设开始时间；都打过了，就给当前句的下一句设时间
function tapTarget() {
  const i = state.lines.findIndex((l) => l.start == null);
  return i >= 0 ? i : state.current + 1;
}

els.tap.addEventListener('click', () => {
  if (!state.file) return toast('先重新选择音频');
  const i = tapTarget();
  if (i >= state.lines.length) return toast('已经是最后一句');
  edit(() => setStart(i, els.audio.currentTime));
  if (els.audio.paused) toast(`第 ${i + 1} 句设为 ${lrcTime(els.audio.currentTime)}`);
});

// ---------- 单句微调弹层 ----------

function openLineSheet(i) {
  state.sheetIndex = i;
  fillLineSheet();
  els.sheetLine.showModal();
}

function fillLineSheet() {
  const line = state.lines[state.sheetIndex];
  if (!line) return;
  els.slText.textContent = line.text;
  els.slTime.textContent = line.start == null ? '--:--.--' : lrcTime(line.start);
  els.slNowTime.textContent = lrcTime(els.audio.currentTime || 0);
  els.slPlay.disabled = line.start == null || !state.file;
}

els.sheetLine.addEventListener('click', (e) => {
  const nudge = e.target.closest('[data-nudge]');
  if (nudge) {
    const line = state.lines[state.sheetIndex];
    edit(() => setStart(state.sheetIndex, (line.start ?? els.audio.currentTime ?? 0) + Number(nudge.dataset.nudge)));
  }
});
els.slNow.addEventListener('click', () => edit(() => setStart(state.sheetIndex, els.audio.currentTime || 0)));
els.slPlay.addEventListener('click', () => { els.sheetLine.close(); playFrom(state.sheetIndex); });

for (const dlg of [els.sheetLine, els.sheetExport]) {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); // 点遮罩或“完成”关闭
  });
}

// ---------- 播放 ----------

els.play.addEventListener('click', () => {
  if (!state.file) return toast('先重新选择音频');
  if (els.audio.paused) els.audio.play().catch(() => {}); else els.audio.pause();
});
els.rew.addEventListener('click', () => seekTo(els.audio.currentTime - 5));
els.fwd.addEventListener('click', () => seekTo(els.audio.currentTime + 5));
els.audio.addEventListener('play', () => { els.play.classList.add('playing'); els.play.setAttribute('aria-label', '暂停'); loop(); });
els.audio.addEventListener('pause', () => { els.play.classList.remove('playing'); els.play.setAttribute('aria-label', '播放'); tick(true); });

function seekTo(t) {
  if (!state.file) return;
  els.audio.currentTime = Math.max(0, Math.min(state.duration || els.audio.duration || 0, t));
  tick(true);
}

function loop() {
  tick();
  if (!els.audio.paused) requestAnimationFrame(loop);
}

let lastUserScroll = 0;
for (const ev of ['touchstart', 'wheel']) els.lines.addEventListener(ev, () => { lastUserScroll = Date.now(); }, { passive: true });

function tick(force = false) {
  if (els.editor.hidden) return;
  const t = els.audio.currentTime || 0;
  els.clock.textContent = lrcTime(t);
  let cur = -1;
  state.lines.forEach((l, i) => { if (l.start != null && l.start <= t + 0.01) cur = i; });
  const rows = els.lines.children;
  if (cur !== state.current || force) {
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('current', i === cur);
      rows[i].classList.toggle('past', cur >= 0 && i < cur);
    }
    if (cur >= 0 && cur !== state.current && !els.audio.paused && Date.now() - lastUserScroll > 2500) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      rows[cur]?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    }
    state.current = cur;
    const next = tapTarget();
    els.tapHint.textContent = state.lines[next] ? `下一句：${state.lines[next].text}` : '';
  }
  const line = state.lines[cur];
  if (line?.words.length) {
    const spans = rows[cur].querySelectorAll('.w');
    line.words.forEach((w, k) => spans[k]?.classList.toggle('sung', w.start <= t));
  }
  if (els.sheetLine.open) els.slNowTime.textContent = lrcTime(t);
  drawWave();
}

// ---------- 波形 ----------

function sizeCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 画波形；progress 之前的部分用主色，markers 是每句开始时间的小刻度 */
function drawPeaks(canvas, { progress = 0, markers = [], currentMarker = -1 } = {}) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const dpr = window.devicePixelRatio || 1;
  const bar = 3 * dpr, gap = 2 * dpr;
  const n = Math.max(1, Math.floor((W + gap) / (bar + gap)));
  const top = markers.length ? 10 * dpr : 0;
  const mid = top + (H - top) / 2;
  const accent = cssVar('--accent');
  for (let i = 0; i < n; i++) {
    let v = 0.08;
    if (state.peaks) {
      const a = Math.floor((i / n) * state.peaks.length), b = Math.max(a + 1, Math.floor(((i + 1) / n) * state.peaks.length));
      for (let k = a; k < b; k++) v = Math.max(v, state.peaks[k]);
    }
    const h = Math.max(2 * dpr, v * (H - top) * 0.92);
    ctx.fillStyle = (i + 0.5) / n <= progress ? accent : 'rgba(255,255,255,0.22)';
    const x = i * (bar + gap);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, mid - h / 2, bar, h, bar / 2) : ctx.rect(x, mid - h / 2, bar, h);
    ctx.fill();
  }
  markers.forEach((m, i) => {
    ctx.fillStyle = i === currentMarker ? accent : 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(m * W, 4 * dpr, (i === currentMarker ? 3 : 2) * dpr, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawWave() {
  const d = state.duration || els.audio.duration || 0;
  const markers = d ? state.lines.filter((l) => l.start != null).map((l) => l.start / d) : [];
  const currentMarker = state.current >= 0 ? state.lines.slice(0, state.current + 1).filter((l) => l.start != null).length - 1 : -1;
  drawPeaks(els.wave, { progress: d ? (els.audio.currentTime || 0) / d : 0, markers, currentMarker });
}

function seekFromPointer(e) {
  const r = els.wave.getBoundingClientRect();
  const d = state.duration || els.audio.duration || 0;
  seekTo(((e.clientX - r.left) / r.width) * d);
}
els.wave.addEventListener('pointerdown', (e) => { els.wave.setPointerCapture(e.pointerId); seekFromPointer(e); });
els.wave.addEventListener('pointermove', (e) => { if (els.wave.hasPointerCapture(e.pointerId)) seekFromPointer(e); });
els.wave.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') seekTo(els.audio.currentTime - 1);
  if (e.key === 'ArrowRight') seekTo(els.audio.currentTime + 1);
});
window.addEventListener('resize', () => {
  if (!els.editor.hidden) { sizeCanvas(els.wave); drawWave(); }
  else if (state.file) { sizeCanvas(els.songWave); drawPeaks(els.songWave, { progress: 1 }); }
});

// ---------- 导出 ----------

els.exportBtn.addEventListener('click', () => { updateExport(); els.sheetExport.showModal(); });

els.sheetExport.querySelector('.seg').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-format]');
  if (!btn) return;
  state.format = btn.dataset.format;
  for (const b of els.sheetExport.querySelectorAll('.seg button')) b.setAttribute('aria-checked', String(b === btn));
  updateExport();
});

function updateExport() {
  els.exDesc.textContent = FORMAT_DESC[state.format];
  els.exportText.value = exportLyrics(state.lines, state.format, displayName());
}

els.save.addEventListener('click', async () => {
  const text = els.exportText.value;
  const name = `${displayName()}.${state.format === 'srt' ? 'srt' : 'lrc'}`;
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
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2400);
}

// ---------- 启动 ----------

restore();
setHue(state.audioName);
syncChips();
updateSetup();
if (state.options.lang === 'zh') loadPinyin();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
