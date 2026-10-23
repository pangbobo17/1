import { alignLyrics, segmentLines, cleanLyrics, exportLyrics, lrcTime } from './align.js';
import { decodeFile, computePeaks, to16k, transcribe } from './asr.js';
import * as db from './db.js';

const $ = (id) => document.getElementById(id);
const els = {
  views: { create: $('view-create'), editor: $('view-editor'), library: $('view-library'), settings: $('view-settings') },
  tabbar: document.querySelector('.tabbar'),
  // 制作
  audioInput: $('audio-input'), song: document.querySelector('.song'), songEmpty: $('song-empty'), songInfo: $('song-info'),
  songName: $('song-name'), songMeta: $('song-meta'), songWave: $('song-wave'),
  modeSeg: $('mode-seg'), subtitleCard: $('subtitle-card'), songEmptyTitle: $('song-empty-title'), songEmptyHint: $('song-empty-hint'),
  lyricsCard: $('lyrics-card'), lyricsCount: $('lyrics-count'), lyricsPreview: $('lyrics-preview'),
  sheetLyrics: $('sheet-lyrics'), lyrics: $('lyrics'), lyricsFile: $('lyrics-file'),
  auto: $('btn-auto'), manual: $('btn-manual'),
  progress: $('progress'), progressText: $('progress-text'), progressPct: $('progress-pct'), progressFill: $('progress-fill'),
  // 时间轴
  tools: $('btn-tools'), exportBtn: $('btn-export'), editorTitle: $('editor-title'), editorSub: $('editor-sub'),
  editorEmpty: $('editor-empty'), needAudio: $('need-audio'), lines: $('lines'), dock: $('dock'), wave: $('wave'), clock: $('clock'),
  rew: $('btn-rew'), play: $('btn-play'), fwd: $('btn-fwd'), undo: $('btn-undo'), tap: $('btn-tap'), tapHint: $('tap-hint'),
  sheetLine: $('sheet-line'), slText: $('sl-text'), slTime: $('sl-time'), slNow: $('sl-now'), slNowTime: $('sl-now-time'), slPlay: $('sl-play'), slDelete: $('sl-delete'),
  sheetTools: $('sheet-tools'), speedSeg: $('speed-seg'), clearTimes: $('btn-clear-times'),
  sheetExport: $('sheet-export'), exDesc: $('ex-desc'), exportText: $('export-text'), save: $('btn-save'), copy: $('btn-copy'),
  // 作品
  projects: $('projects'), libraryEmpty: $('library-empty'), librarySub: $('library-sub'), editLibrary: $('btn-edit-library'),
  // 设置
  storageUsed: $('storage-used'), clearModels: $('btn-clear-models'), installCard: $('install-card'),
  // 通用
  sheetPick: $('sheet-pick'), pickTitle: $('pick-title'), pickOptions: $('pick-options'),
  audio: $('audio'), toast: $('toast'),
};

const LANGS = [
  { value: 'zh', label: '普通话', whisper: 'chinese' },
  { value: 'yue', label: '粤语', whisper: 'chinese' },
  { value: 'en', label: 'English', whisper: 'english' },
  { value: 'ja', label: '日本語', whisper: 'japanese' },
  { value: 'ko', label: '한국어', whisper: 'korean' },
];
const MODELS = [
  { value: 'onnx-community/whisper-tiny_timestamped', label: '快速', desc: '约 40MB，速度最快，准确度一般' },
  { value: 'onnx-community/whisper-base_timestamped', label: '标准', desc: '约 80MB，推荐' },
  { value: 'onnx-community/whisper-small_timestamped', label: '精准', desc: '约 250MB，更准，但慢不少' },
];
const SCRIPTS = [
  { value: 'hans', label: '简体', desc: '识别结果里的繁体字自动转成简体' },
  { value: 'hant', label: '繁体', desc: '识别结果统一转成繁体' },
  { value: 'raw', label: '保持原样', desc: '不做转换' },
];
const LINE_LENGTHS = [
  { value: 'short', label: '短', desc: '一行约 10 个字，适合竖屏视频' },
  { value: 'normal', label: '标准', desc: '一行约 16 个字' },
  { value: 'long', label: '长', desc: '一行约 24 个字，适合横屏视频' },
];
const MAX_UNITS = { cjk: { short: 10, normal: 16, long: 24 }, latin: { short: 6, normal: 9, long: 13 } };
const FORMAT_DESC = {
  lrc: '最常用的歌词格式，音乐播放器都支持。',
  klrc: '带每个字的时间，可用于卡拉 OK 逐字变色。',
  srt: '视频字幕格式，剪映、Premiere 等都能导入。',
};
const TABS = ['create', 'editor', 'library', 'settings'];

const state = {
  tab: 'create',
  settings: { defaultLang: 'zh', defaultModel: MODELS[1].value },
  draft: { file: null, name: '', peaks: null, duration: 0, lang: 'zh', model: MODELS[1].value, decoding: null,
    mode: 'lyrics', script: 'hans', lineLength: 'normal' },
  project: null,     // {id, kind: 'lyrics'|'subtitle', name, hue, lyrics, lines, lang, model, duration, peaks, createdAt, updatedAt}
  hasAudio: false,
  undo: [],
  current: -1,
  sheetIndex: -1,
  format: 'lrc',
  busy: false,
  libraryEditing: false,
};

// ---------- 小工具 ----------

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

function songHue(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}
function setHue(h) { document.documentElement.style.setProperty('--h', String(h ?? 14)); }
const stripExt = (name) => name.replace(/\.[^.]+$/, '');
const labelOf = (list, value) => list.find((o) => o.value === value)?.label ?? '';
const newId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2400);
}

// 弹层：点遮罩或 data-close 按钮关闭
for (const dlg of document.querySelectorAll('dialog')) {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
}

function pick(title, options, current) {
  return new Promise((resolve) => {
    els.pickTitle.textContent = title;
    els.pickOptions.replaceChildren(...options.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'list-row';
      const label = document.createElement('span');
      label.textContent = o.label;
      if (o.desc) {
        const d = document.createElement('span');
        d.className = 'opt-desc';
        d.textContent = o.desc;
        label.append(d);
      }
      b.append(label);
      if (o.value === current) {
        const c = document.createElement('span');
        c.className = 'check';
        c.textContent = '✓';
        b.append(c);
      }
      b.addEventListener('click', () => { resolve(o.value); els.sheetPick.close(); });
      return b;
    }));
    els.sheetPick.addEventListener('close', () => resolve(null), { once: true });
    els.sheetPick.showModal();
  });
}

// ---------- 标签页 ----------

function switchTab(tab) {
  state.tab = tab;
  for (const [name, view] of Object.entries(els.views)) view.hidden = name !== tab;
  els.tabbar.style.setProperty('--tab-index', String(TABS.indexOf(tab)));
  for (const b of els.tabbar.querySelectorAll('.tab')) {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  if (tab === 'create') { setHue(state.draft.name ? songHue(state.draft.name) : state.project?.hue); renderCreate(); }
  if (tab === 'editor') { setHue(state.project?.hue); renderEditor(); }
  if (tab === 'library') renderLibrary();
  if (tab === 'settings') renderSettings();
}

els.tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (b) switchTab(b.dataset.tab);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (b) switchTab(b.dataset.goto);
});

// ---------- 选项（制作页本次 / 设置页默认） ----------

const PICKERS = {
  lang: { title: '语言', list: LANGS, get: () => state.draft.lang, set: (v) => { state.draft.lang = v; } },
  model: { title: '识别模型', list: MODELS, get: () => state.draft.model, set: (v) => { state.draft.model = v; } },
  script: { title: '中文字形', list: SCRIPTS, get: () => state.draft.script, set: (v) => { state.draft.script = v; } },
  lineLength: { title: '每行长度', list: LINE_LENGTHS, get: () => state.draft.lineLength, set: (v) => { state.draft.lineLength = v; } },
  defaultLang: { title: '默认语言', list: LANGS, get: () => state.settings.defaultLang, set: (v) => { state.settings.defaultLang = v; state.draft.lang = v; } },
  defaultModel: { title: '默认识别模型', list: MODELS, get: () => state.settings.defaultModel, set: (v) => { state.settings.defaultModel = v; state.draft.model = v; } },
};

document.addEventListener('click', async (e) => {
  const row = e.target.closest('[data-pick]');
  if (!row) return;
  const p = PICKERS[row.dataset.pick];
  const value = await pick(p.title, p.list, p.get());
  if (value == null) return;
  p.set(value);
  store.set('lyricsync.settings', state.settings);
  saveDraft();
  syncPickerValues();
  if (row.dataset.pick === 'lang' || row.dataset.pick === 'defaultLang') { if (state.draft.lang === 'zh') loadPinyin(); }
});

function syncPickerValues() {
  for (const el of document.querySelectorAll('[data-show]')) {
    const p = PICKERS[el.dataset.show];
    el.textContent = labelOf(p.list, p.get());
  }
}

// ---------- 制作 ----------

els.audioInput.addEventListener('change', () => {
  const file = els.audioInput.files[0];
  els.audioInput.value = '';
  if (!file) return;
  const d = state.draft;
  Object.assign(d, { file, name: file.name, peaks: null, duration: 0 });
  setHue(songHue(file.name));
  els.progress.hidden = true;
  d.decoding = decodeFile(file).then((buffer) => {
    if (d.file !== file) return;
    d.duration = buffer.duration;
    d.peaks = computePeaks(buffer);
    renderCreate();
  }).catch(() => toast('这个文件读不出声音，换一个试试'));
  renderCreate();
});

els.lyricsCard.addEventListener('click', () => {
  els.sheetLyrics.showModal();
  if (!els.lyrics.value) els.lyrics.focus();
});
els.lyrics.addEventListener('input', () => {
  saveDraft();
  renderCreate();
});

function saveDraft() {
  const { lang, model, mode, script, lineLength } = state.draft;
  store.set('lyricsync.draft', { lyrics: els.lyrics.value, lang, model, mode, script, lineLength });
}

els.modeSeg.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  state.draft.mode = b.dataset.mode;
  saveDraft();
  renderCreate();
});
els.lyricsFile.addEventListener('change', async () => {
  const file = els.lyricsFile.files[0];
  els.lyricsFile.value = '';
  if (!file) return;
  els.lyrics.value = await readText(file);
  els.lyrics.dispatchEvent(new Event('input'));
});

async function readText(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gb18030').decode(buf); // 老的中文 .lrc 常是 GBK 编码
  }
}

function renderCreate() {
  const d = state.draft;
  const subtitle = d.mode === 'subtitle';
  for (const b of els.modeSeg.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.mode === d.mode));
  els.lyricsCard.hidden = subtitle;
  els.subtitleCard.hidden = !subtitle;
  els.manual.hidden = subtitle;
  els.songEmptyTitle.textContent = subtitle ? '选择音频或视频' : '选择歌曲';
  els.songEmptyHint.textContent = subtitle ? 'mp3、m4a、mp4、mov 都可以' : 'mp3、m4a、wav 都可以';
  const lyricLines = subtitle ? [] : cleanLyrics(els.lyrics.value);
  els.lyricsCount.textContent = lyricLines.length ? `· ${lyricLines.length} 行` : '';
  els.lyricsPreview.textContent = lyricLines.length ? lyricLines.slice(0, 3).join('\n') : '粘贴或导入歌词。不填也行，会自动识别。';
  els.lyricsPreview.classList.toggle('empty', !lyricLines.length);
  els.auto.textContent = subtitle ? '开始识别字幕' : lyricLines.length ? '自动对齐' : '自动识别歌词';
  els.auto.disabled = !d.file || state.busy;
  els.manual.disabled = !d.file || !lyricLines.length || state.busy;

  const has = !!d.file;
  els.songEmpty.hidden = has;
  els.songInfo.hidden = !has;
  if (has) {
    els.songName.textContent = stripExt(d.name);
    els.songMeta.textContent = d.duration ? lrcTime(d.duration).slice(0, 5) : '';
    requestAnimationFrame(() => { sizeCanvas(els.songWave); drawPeaks(els.songWave, d.peaks, { progress: 1 }); });
  }
  syncPickerValues();
}

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

const converters = {};
/** 中文简繁转换（opencc-js，用到时才加载） */
async function convertScript(lines, script) {
  if (script === 'raw') return lines;
  try {
    if (!converters[script]) {
      const file = script === 'hans' ? 't2cn' : 'cn2t';
      const O = await import(`https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/esm/${file}.js`);
      converters[script] = script === 'hans' ? O.Converter({ from: 'tw', to: 'cn' }) : O.Converter({ from: 'cn', to: 'tw' });
    }
    const conv = converters[script];
    for (const line of lines) {
      line.text = conv(line.text);
      for (const w of line.words) w.text = conv(w.text);
    }
  } catch {
    toast('简繁转换没加载成功，先保持原样');
  }
  return lines;
}

/** 用当前草稿新建一个作品（音频一起存进本机） */
async function createProject(lines, kind) {
  const d = state.draft;
  await d.decoding;
  const now = Date.now();
  const project = {
    id: newId(), kind, name: stripExt(d.name), hue: songHue(d.name), lyrics: kind === 'subtitle' ? '' : els.lyrics.value,
    lines, lang: d.lang, model: d.model, duration: d.duration, peaks: d.peaks, createdAt: now, updatedAt: now,
  };
  try {
    await db.putAudio(project.id, d.file);
    await db.putProject(project);
  } catch {
    toast('这台设备不能保存作品，关掉页面后会丢失');
  }
  await openProject(project, d.file);
}

els.auto.addEventListener('click', async () => {
  const d = state.draft;
  if (!d.file || state.busy) return;
  state.busy = true;
  renderCreate();
  let wakeLock = null;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  try {
    showProgress('正在读取音频…', 0);
    const buffer = await decodeFile(d.file);
    d.duration = buffer.duration;
    d.peaks ??= computePeaks(buffer);
    const samples = await to16k(buffer);
    const lang = LANGS.find((l) => l.value === d.lang);
    const words = await transcribe(samples, { model: d.model, language: lang.whisper }, (p) => {
      if (p.stage === 'download') {
        const mb = p.total ? ` ${(p.loaded / 1e6).toFixed(0)}/${(p.total / 1e6).toFixed(0)}MB` : '';
        showProgress(`下载识别模型（仅首次）${mb}`, p.value);
      } else {
        showProgress('正在听歌识词…', p.value);
      }
    });
    const subtitle = d.mode === 'subtitle';
    const lyricLines = subtitle ? [] : cleanLyrics(els.lyrics.value);
    let lines;
    if (lyricLines.length) {
      showProgress('正在逐行对齐…', 1);
      const phonetic = d.lang === 'zh' ? await loadPinyin() : null;
      lines = alignLyrics(lyricLines, words, d.duration, { phonetic });
    } else {
      const cjk = ['zh', 'yue', 'ja', 'ko'].includes(d.lang);
      const maxUnits = MAX_UNITS[cjk ? 'cjk' : 'latin'][subtitle ? d.lineLength : 'normal'];
      lines = segmentLines(words, 0.7, maxUnits);
      if (d.lang === 'zh' || d.lang === 'yue') lines = await convertScript(lines, subtitle ? d.script : 'hans');
    }
    if (!lines.length) {
      showProgress('没有识别到人声。检查一下演唱语言，或者用手动打点。', 0, true);
      return;
    }
    els.progress.hidden = true;
    await createProject(lines, subtitle ? 'subtitle' : 'lyrics');
    switchTab('editor');
    if (subtitle) { toast(`识别出 ${lines.length} 条字幕，点时间可以改字`); return; }
    const low = lines.filter((l) => l.confidence != null && l.confidence < 0.5).length;
    toast(low ? `完成，有 ${low} 句需要检查` : '完成，播放核对一下');
  } catch (e) {
    console.error(e);
    showProgress(`识别失败：${e.message}。可以换“快速”模型重试，或者用手动打点。`, 0, true);
  } finally {
    wakeLock?.release?.().catch(() => {});
    state.busy = false;
    renderCreate();
  }
});

els.manual.addEventListener('click', async () => {
  const lyricLines = cleanLyrics(els.lyrics.value);
  if (!lyricLines.length || !state.draft.file) return;
  els.progress.hidden = true;
  await createProject(lyricLines.map((text) => ({ text, start: null, end: null, words: [], confidence: null })), 'lyrics');
  switchTab('editor');
  toast('播放歌曲，每句开口时点“打点”');
});

// ---------- 作品 ----------

async function openProject(project, audioBlob) {
  els.audio.pause();
  state.project = project;
  state.format = project.kind === 'subtitle' ? 'srt' : 'lrc';
  state.undo = [];
  state.current = -1;
  store.set('lyricsync.last', project.id);
  setHue(project.hue);
  let blob = audioBlob;
  if (!blob) { try { blob = await db.getAudio(project.id); } catch {} }
  if (els.audio.src) URL.revokeObjectURL(els.audio.src);
  els.audio.removeAttribute('src');
  state.hasAudio = !!blob;
  if (blob) els.audio.src = URL.createObjectURL(blob);
  els.audio.load();
  els.audio.playbackRate = els.audio.defaultPlaybackRate = 1;
}

let saveTimer;
function saveProject() {
  const p = state.project;
  if (!p) return;
  p.updatedAt = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.putProject(p).catch(() => {}), 300);
}

async function renderLibrary() {
  let list = [];
  try { list = await db.listProjects(); } catch {}
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  els.libraryEmpty.hidden = list.length > 0;
  els.projects.hidden = list.length === 0;
  els.editLibrary.hidden = list.length === 0;
  els.librarySub.textContent = list.length ? `${list.length} 首` : '';
  if (!list.length) state.libraryEditing = false;
  els.editLibrary.textContent = state.libraryEditing ? '完成' : '编辑';
  els.projects.replaceChildren(...list.map((p) => {
    const li = document.createElement('li');
    li.className = 'card project' + (p.id === state.project?.id ? ' active' : '');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'project-open';
    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.style.background = `linear-gradient(135deg, hsl(${p.hue} 85% 58%), hsl(${p.hue + 38} 75% 42%))`;
    thumb.textContent = [...p.name][0] ?? '♪';
    const text = document.createElement('span');
    text.className = 'project-text';
    const name = document.createElement('span');
    name.className = 'project-name';
    name.textContent = p.name;
    const meta = document.createElement('span');
    meta.className = 'project-meta';
    const unset = p.lines.filter((l) => l.start == null).length;
    const low = p.lines.filter((l) => l.confidence != null && l.confidence < 0.5).length;
    const date = new Date(p.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    meta.append(`${p.lines.length} 句 · ${date}`);
    if (unset || low) {
      const w = document.createElement('span');
      w.className = 'warn';
      w.textContent = unset ? ` · ${unset} 句没打点` : ` · ${low} 句需检查`;
      meta.append(w);
    }
    if (p.kind === 'subtitle') {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '字幕';
      name.append(badge);
    }
    text.append(name, meta);
    open.append(thumb, text);
    open.addEventListener('click', async () => {
      if (state.libraryEditing) return;
      if (state.project?.id !== p.id) await openProject(p);
      switchTab('editor');
    });
    li.append(open);
    if (state.libraryEditing) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '删除';
      del.addEventListener('click', async () => {
        await db.deleteProject(p.id).catch(() => {});
        if (state.project?.id === p.id) {
          els.audio.pause();
          state.project = null;
          store.set('lyricsync.last', null);
        }
        renderLibrary();
      });
      li.append(del);
    }
    return li;
  }));
}

els.editLibrary.addEventListener('click', () => {
  state.libraryEditing = !state.libraryEditing;
  renderLibrary();
});

// ---------- 时间轴 ----------

function renderEditor() {
  const p = state.project;
  els.editorEmpty.hidden = !!p;
  els.lines.hidden = els.dock.hidden = !p;
  els.tools.disabled = els.exportBtn.disabled = !p;
  els.needAudio.hidden = !p || state.hasAudio;
  els.editorTitle.textContent = p ? p.name : '时间轴';
  if (!p) { els.editorSub.textContent = ''; return; }
  renderLines();
  requestAnimationFrame(() => { sizeCanvas(els.wave); drawWave(); });
}

function renderLines() {
  const lines = state.project.lines;
  els.lines.replaceChildren(...lines.map((line, i) => {
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
  const lines = state.project.lines;
  const unset = lines.filter((l) => l.start == null).length;
  const low = lines.filter((l) => l.confidence != null && l.confidence < 0.5).length;
  const unit = state.project.kind === 'subtitle' ? '条字幕' : '句';
  els.editorSub.textContent = unset ? `还有 ${unset} 句没打点` : low ? `${lines.length} ${unit} · ${low} 句需检查` : `${lines.length} ${unit}`;
  els.undo.disabled = state.undo.length === 0;
}

// 作品的音频丢了（比如从旧版迁移过来），重新关联
const relink = Object.assign(document.createElement('input'), { type: 'file', accept: 'audio/*,video/mp4,.m4a,.mp3,.wav,.aac,.flac', hidden: true });
document.body.append(relink);
els.needAudio.addEventListener('click', () => relink.click());
relink.addEventListener('change', async () => {
  const file = relink.files[0];
  relink.value = '';
  if (!file || !state.project) return;
  const p = state.project;
  try { await db.putAudio(p.id, file); } catch {}
  await openProject(p, file);
  try {
    const buffer = await decodeFile(file);
    p.duration = buffer.duration;
    p.peaks = computePeaks(buffer);
    saveProject();
  } catch {}
  renderEditor();
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
  const line = state.project.lines[i];
  if (!state.hasAudio) return toast('先重新选择音频');
  if (line.start == null) return openLineSheet(i);
  els.audio.currentTime = Math.max(0, line.start - 0.05);
  els.audio.play().catch(() => {});
  tick(true);
}

function shiftLine(line, d) {
  const delta = Math.max(d, -line.start);
  line.start = Math.round((line.start + delta) * 100) / 100;
  if (line.end != null) line.end += delta;
  for (const w of line.words) { w.start += delta; w.end += delta; }
}

/** 改一行的开始时间：有逐字时间的整行平移；同时把上一行的结束时间接上 */
function setStart(i, time) {
  const lines = state.project.lines;
  const line = lines[i];
  const t = Math.max(0, Math.round(time * 100) / 100);
  if (line.start != null && line.words.length) {
    shiftLine(line, t - line.start);
  } else {
    line.end = line.end != null && line.end > t ? line.end : t;
    line.start = t;
  }
  const prev = lines[i - 1];
  if (prev && prev.start != null && !prev.words.length && t > prev.start) prev.end = t;
}

function edit(fn, { rebuild = false } = {}) {
  state.undo.push(JSON.stringify(state.project.lines));
  if (state.undo.length > 100) state.undo.shift();
  fn();
  if (rebuild) renderLines(); else refreshRows();
  saveProject();
}

/** 只更新时间标签，不重建列表（保持滚动位置） */
function refreshRows() {
  state.project.lines.forEach((line, i) => {
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
  state.project.lines = JSON.parse(prev);
  renderLines();
  if (els.sheetLine.open) fillLineSheet();
  saveProject();
});

// 打点：没打完时按顺序给下一句设开始时间；都打过了，就给当前句的下一句设时间
function tapTarget() {
  const i = state.project.lines.findIndex((l) => l.start == null);
  return i >= 0 ? i : state.current + 1;
}

els.tap.addEventListener('click', () => {
  if (!state.hasAudio) return toast('先重新选择音频');
  const i = tapTarget();
  if (i >= state.project.lines.length) return toast('已经是最后一句');
  edit(() => setStart(i, els.audio.currentTime));
  if (els.audio.paused) toast(`第 ${i + 1} 句设为 ${lrcTime(els.audio.currentTime)}`);
});

// 单句微调
function openLineSheet(i) {
  state.sheetIndex = i;
  resetDeleteButton();
  fillLineSheet();
  els.sheetLine.showModal();
}

function fillLineSheet() {
  const line = state.project?.lines[state.sheetIndex];
  if (!line) return;
  if (document.activeElement !== els.slText) els.slText.value = line.text;
  els.slTime.textContent = line.start == null ? '--:--.--' : lrcTime(line.start);
  els.slNowTime.textContent = lrcTime(els.audio.currentTime || 0);
  els.slPlay.disabled = line.start == null || !state.hasAudio;
}

els.sheetLine.addEventListener('click', (e) => {
  const nudge = e.target.closest('[data-nudge]');
  if (!nudge) return;
  const line = state.project.lines[state.sheetIndex];
  edit(() => setStart(state.sheetIndex, (line.start ?? els.audio.currentTime ?? 0) + Number(nudge.dataset.nudge)));
});
els.slNow.addEventListener('click', () => edit(() => setStart(state.sheetIndex, els.audio.currentTime || 0)));
els.slPlay.addEventListener('click', () => { els.sheetLine.close(); playFrom(state.sheetIndex); });

// 改字：文字变了就去掉逐字时间（字数可能对不上了），保留整句时间
els.slText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); els.slText.blur(); }
});
els.slText.addEventListener('change', () => {
  const i = state.sheetIndex;
  const line = state.project?.lines[i];
  const text = els.slText.value.replace(/\s*\n\s*/g, ' ').trim();
  if (!line || !text || text === line.text) { if (line) els.slText.value = line.text; return; }
  edit(() => { line.text = text; line.words = []; }, { rebuild: true });
});

let deleteArmed = null;
function resetDeleteButton() {
  clearTimeout(deleteArmed);
  deleteArmed = null;
  els.slDelete.textContent = '删除这一句';
}
els.slDelete.addEventListener('click', () => {
  if (!deleteArmed) {
    els.slDelete.textContent = '再点一次确认删除';
    deleteArmed = setTimeout(resetDeleteButton, 3000);
    return;
  }
  resetDeleteButton();
  const i = state.sheetIndex;
  edit(() => { state.project.lines.splice(i, 1); }, { rebuild: true });
  els.sheetLine.close();
  toast('已删除，可以撤销');
});

// 工具
els.tools.addEventListener('click', () => { syncSpeed(); resetClearButton(); els.sheetTools.showModal(); });

function syncSpeed() {
  for (const b of els.speedSeg.querySelectorAll('button')) {
    b.setAttribute('aria-checked', String(Number(b.dataset.speed) === els.audio.playbackRate));
  }
}
els.speedSeg.addEventListener('click', (e) => {
  const b = e.target.closest('[data-speed]');
  if (!b) return;
  els.audio.playbackRate = els.audio.defaultPlaybackRate = Number(b.dataset.speed);
  syncSpeed();
});
els.sheetTools.addEventListener('click', (e) => {
  const b = e.target.closest('[data-shift]');
  if (!b) return;
  const d = Number(b.dataset.shift);
  edit(() => { for (const l of state.project.lines) if (l.start != null) shiftLine(l, d); });
  toast(`所有句子${d > 0 ? '推后' : '提前'} ${Math.abs(d)} 秒`);
});

let clearArmed = null;
function resetClearButton() {
  clearTimeout(clearArmed);
  clearArmed = null;
  els.clearTimes.textContent = '清空所有时间，重新打点';
}
els.clearTimes.addEventListener('click', () => {
  if (!clearArmed) {
    els.clearTimes.textContent = '再点一次确认清空';
    clearArmed = setTimeout(resetClearButton, 3000);
    return;
  }
  resetClearButton();
  edit(() => {
    for (const l of state.project.lines) Object.assign(l, { start: null, end: null, words: [], confidence: null });
  });
  renderLines();
  els.sheetTools.close();
  els.audio.currentTime = 0;
  toast('已清空，播放后按“打点”');
});

// ---------- 播放 ----------

els.play.addEventListener('click', () => {
  if (!state.hasAudio) return toast('先重新选择音频');
  if (els.audio.paused) els.audio.play().catch(() => {}); else els.audio.pause();
});
els.rew.addEventListener('click', () => seekTo(els.audio.currentTime - 5));
els.fwd.addEventListener('click', () => seekTo(els.audio.currentTime + 5));
els.audio.addEventListener('play', () => { els.play.classList.add('playing'); els.play.setAttribute('aria-label', '暂停'); loop(); });
els.audio.addEventListener('pause', () => { els.play.classList.remove('playing'); els.play.setAttribute('aria-label', '播放'); tick(true); });
els.audio.addEventListener('loadedmetadata', () => {
  if (state.project && !state.project.duration) state.project.duration = els.audio.duration;
  tick(true);
});

const duration = () => state.project?.duration || els.audio.duration || 0;

function seekTo(t) {
  if (!state.hasAudio) return;
  els.audio.currentTime = Math.max(0, Math.min(duration(), t));
  tick(true);
}

function loop() {
  tick();
  if (!els.audio.paused) requestAnimationFrame(loop);
}

let lastUserScroll = 0;
for (const ev of ['touchstart', 'wheel']) els.lines.addEventListener(ev, () => { lastUserScroll = Date.now(); }, { passive: true });

function tick(force = false) {
  if (state.tab !== 'editor' || !state.project) return;
  const lines = state.project.lines;
  const t = els.audio.currentTime || 0;
  els.clock.textContent = lrcTime(t);
  let cur = -1;
  lines.forEach((l, i) => { if (l.start != null && l.start <= t + 0.01) cur = i; });
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
    els.tapHint.textContent = lines[next] ? `下一句：${lines[next].text}` : '';
  }
  const line = lines[cur];
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

/** 画波形；progress 之前的部分用主色，markers 是每句开始位置的小圆点 */
function drawPeaks(canvas, peaks, { progress = 0, markers = [], currentMarker = -1 } = {}) {
  const ctx = canvas.getContext('2d');
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const dpr = window.devicePixelRatio || 1;
  const bar = 3 * dpr, gap = 2 * dpr;
  const n = Math.max(1, Math.floor((W + gap) / (bar + gap)));
  const top = markers.length ? 10 * dpr : 0;
  const mid = top + (H - top) / 2;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  for (let i = 0; i < n; i++) {
    let v = 0.08;
    if (peaks?.length) {
      const a = Math.floor((i / n) * peaks.length), b = Math.max(a + 1, Math.floor(((i + 1) / n) * peaks.length));
      for (let k = a; k < b; k++) v = Math.max(v, peaks[k]);
    }
    const h = Math.max(2 * dpr, v * (H - top) * 0.92);
    ctx.fillStyle = (i + 0.5) / n <= progress ? accent : 'rgba(255,255,255,0.22)';
    const x = i * (bar + gap);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, mid - h / 2, bar, h, bar / 2); else ctx.rect(x, mid - h / 2, bar, h);
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
  const p = state.project;
  if (!p) return;
  const d = duration();
  const timed = p.lines.filter((l) => l.start != null);
  const markers = d ? timed.map((l) => l.start / d) : [];
  const currentMarker = state.current >= 0 ? p.lines.slice(0, state.current + 1).filter((l) => l.start != null).length - 1 : -1;
  drawPeaks(els.wave, p.peaks, { progress: d ? (els.audio.currentTime || 0) / d : 0, markers, currentMarker });
}

function seekFromPointer(e) {
  const r = els.wave.getBoundingClientRect();
  seekTo(((e.clientX - r.left) / r.width) * duration());
}
els.wave.addEventListener('pointerdown', (e) => { els.wave.setPointerCapture(e.pointerId); seekFromPointer(e); });
els.wave.addEventListener('pointermove', (e) => { if (els.wave.hasPointerCapture(e.pointerId)) seekFromPointer(e); });
els.wave.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') seekTo(els.audio.currentTime - 1);
  if (e.key === 'ArrowRight') seekTo(els.audio.currentTime + 1);
});
window.addEventListener('resize', () => {
  if (state.tab === 'editor' && state.project) { sizeCanvas(els.wave); drawWave(); }
  if (state.tab === 'create') renderCreate();
});

// ---------- 导出 ----------

els.exportBtn.addEventListener('click', () => {
  for (const b of els.sheetExport.querySelectorAll('.seg button')) b.setAttribute('aria-checked', String(b.dataset.format === state.format));
  updateExport();
  els.sheetExport.showModal();
});

els.sheetExport.querySelector('.seg').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-format]');
  if (!btn) return;
  state.format = btn.dataset.format;
  for (const b of els.sheetExport.querySelectorAll('.seg button')) b.setAttribute('aria-checked', String(b === btn));
  updateExport();
});

function updateExport() {
  els.exDesc.textContent = FORMAT_DESC[state.format];
  els.exportText.value = exportLyrics(state.project.lines, state.format, state.project.name);
}

els.save.addEventListener('click', async () => {
  const text = els.exportText.value;
  const name = `${state.project.name}.${state.format === 'srt' ? 'srt' : 'lrc'}`;
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

// ---------- 设置 ----------

async function renderSettings() {
  syncPickerValues();
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  els.installCard.hidden = !!standalone;
  try {
    const { usage } = await navigator.storage.estimate();
    els.storageUsed.textContent = usage >= 1e9 ? `${(usage / 1e9).toFixed(1)} GB` : `${Math.round(usage / 1e6)} MB`;
  } catch {
    els.storageUsed.textContent = '—';
  }
}

els.clearModels.addEventListener('click', async () => {
  try {
    const removed = await caches.delete('transformers-cache');
    toast(removed ? '已删除识别模型' : '还没有下载过模型');
  } catch {
    toast('删除失败');
  }
  renderSettings();
});

// ---------- 启动 ----------

async function start() {
  Object.assign(state.settings, store.get('lyricsync.settings', {}));
  const draft = store.get('lyricsync.draft', {});
  els.lyrics.value = draft.lyrics ?? '';
  state.draft.lang = draft.lang ?? state.settings.defaultLang;
  state.draft.model = draft.model ?? state.settings.defaultModel;
  for (const k of ['mode', 'script', 'lineLength']) if (draft[k]) state.draft[k] = draft[k];

  // 旧版（单页）保存的时间轴迁移成一个作品
  const old = store.get('lyricsync.v2', null);
  if (old?.lines?.length) {
    const now = Date.now();
    const name = stripExt(old.audioName || '') || '未命名歌曲';
    try {
      await db.putProject({ id: newId(), name, hue: songHue(old.audioName || name), lyrics: old.lyrics ?? '', lines: old.lines,
        lang: old.options?.lang ?? 'zh', model: old.options?.model ?? MODELS[1].value, duration: 0, peaks: null, createdAt: now, updatedAt: now });
      localStorage.removeItem('lyricsync.v2');
    } catch {}
  }

  const lastId = store.get('lyricsync.last', null);
  if (lastId) {
    try {
      const p = await db.getProject(lastId);
      if (p) await openProject(p);
    } catch {}
  }
  switchTab('create');
  if (state.draft.lang === 'zh') loadPinyin();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
