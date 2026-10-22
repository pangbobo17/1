// 歌词强制对齐核心（与 Packages/LyricsAlignCore 的 Swift 实现同一算法）

const WORD_CHAR = /[\p{L}\p{N}]/u;

export function isCJK(ch) {
  const v = ch.codePointAt(0);
  return (v >= 0x4e00 && v <= 0x9fff) || (v >= 0x3400 && v <= 0x4dbf) || (v >= 0x20000 && v <= 0x2a6df) ||
    (v >= 0xf900 && v <= 0xfaff) || (v >= 0x3040 && v <= 0x30ff) || (v >= 0xac00 && v <= 0xd7af);
}

export function normalize(s) {
  return [...s.toLowerCase()].filter((c) => WORD_CHAR.test(c)).join('');
}

/** 中日韩按单字、拉丁文字按单词切分；display 保留紧随其后的标点和空格 */
export function tokenize(text) {
  const tokens = [];
  let prefix = '';
  let word = '';
  const push = (display) => {
    tokens.push({ display: prefix + display, key: normalize(display) });
    prefix = '';
  };
  const flush = () => {
    if (word) { push(word); word = ''; }
  };
  for (const ch of text) {
    if (isCJK(ch)) {
      flush();
      push(ch);
    } else if (WORD_CHAR.test(ch) || ((ch === "'" || ch === '’') && word)) {
      word += ch;
    } else {
      flush();
      if (tokens.length) tokens[tokens.length - 1].display += ch;
      else prefix += ch;
    }
  }
  flush();
  return tokens;
}

/** 把识别片段拆成与歌词同粒度的 token，片段时间按字符数均分 */
export function tokenizeRecognized(segments) {
  const out = [];
  for (const seg of segments) {
    const keys = tokenize(seg.text).map((t) => t.key).filter(Boolean);
    if (!keys.length) continue;
    const total = keys.reduce((n, k) => n + [...k].length, 0);
    const dur = Math.max(seg.end - seg.start, 0);
    let t = seg.start;
    for (const key of keys) {
      const d = (dur * [...key].length) / total;
      out.push({ text: key, start: t, end: t + d });
      t += d;
    }
  }
  return out;
}

const DEFAULTS = { match: 2, similar: 1.5, mismatch: -1, gap: -1, tokenDuration: 0.3, phonetic: null };

/** Needleman–Wunsch；识别结果首尾多余的内容不扣分。返回与 a 等长的 [{j, kind}|null] */
export function globalAlign(a, b, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  const n = a.length, m = b.length;
  const result = new Array(n).fill(null);
  if (!n || !m) return result;
  const aP = o.phonetic ? a.map(o.phonetic) : null;
  const bP = o.phonetic ? b.map(o.phonetic) : null;
  const kind = (i, j) => (a[i] === b[j] ? 'match' : aP && aP[i] && aP[i] === bP[j] ? 'similar' : 'mismatch');
  const w = m + 1;
  const score = new Float64Array((n + 1) * w);
  const trace = new Uint8Array((n + 1) * w); // 0 配对，1 歌词无对应，2 跳过识别 token
  for (let i = 1; i <= n; i++) { score[i * w] = i * o.gap; trace[i * w] = 1; }
  for (let j = 1; j <= m; j++) trace[j] = 2;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const k = kind(i - 1, j - 1);
      const diag = score[(i - 1) * w + j - 1] + (k === 'match' ? o.match : k === 'similar' ? o.similar : o.mismatch);
      const up = score[(i - 1) * w + j] + o.gap;
      const left = score[i * w + j - 1] + (i === n ? 0 : o.gap);
      let best = diag, t = 0;
      if (up > best) { best = up; t = 1; }
      if (left > best) { best = left; t = 2; }
      score[i * w + j] = best;
      trace[i * w + j] = t;
    }
  }
  let i = n, j = m;
  while (i > 0) {
    if (j === 0) { i--; continue; }
    const t = trace[i * w + j];
    if (t === 0) { result[i - 1] = { j: j - 1, kind: kind(i - 1, j - 1) }; i--; j--; }
    else if (t === 1) i--;
    else j--;
  }
  return result;
}

function estimateTimes(pairs, asr, duration, o) {
  const n = pairs.length;
  if (!n) return [];
  const total = duration > 0 ? duration : asr.length ? asr[asr.length - 1].end : n * o.tokenDuration;
  const anchors = [];
  pairs.forEach((p, i) => { if (p) anchors.push(i); });
  if (!anchors.length) {
    const step = total / n;
    return pairs.map((_, i) => ({ start: i * step, end: (i + 1) * step }));
  }
  const out = pairs.map((p) => (p ? { start: asr[p.j].start, end: asr[p.j].end } : { start: 0, end: 0 }));
  const first = anchors[0], last = anchors[anchors.length - 1];
  for (let i = first - 1; i >= 0; i--) {
    const end = out[i + 1].start;
    out[i] = { start: Math.max(0, end - o.tokenDuration), end };
  }
  for (let i = last + 1; i < n; i++) {
    const start = out[i - 1].end;
    out[i] = { start, end: Math.max(start, Math.min(total, start + o.tokenDuration)) };
  }
  for (let k = 1; k < anchors.length; k++) {
    const a = anchors[k - 1], b = anchors[k];
    if (b - a <= 1) continue;
    const gs = out[a].end, ge = Math.max(out[b].start, gs), count = b - a - 1, step = (ge - gs) / count;
    for (let x = 0; x < count; x++) out[a + 1 + x] = { start: gs + x * step, end: gs + (x + 1) * step };
  }
  for (let i = 1; i < n; i++) {
    if (out[i].start < out[i - 1].start) out[i].start = out[i - 1].start;
    if (out[i].end < out[i].start) out[i].end = out[i].start;
  }
  return out;
}

/** 歌词逐行对齐。recognized: [{text, start, end}]（秒） */
export function alignLyrics(lines, recognized, duration, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const lineTokens = lines.map(tokenize);
  const lyric = lineTokens.flat();
  const asr = tokenizeRecognized(recognized);
  const pairs = globalAlign(lyric.map((t) => t.key), asr.map((t) => t.text), o);
  const times = estimateTimes(pairs, asr, duration, o);
  let k = 0, lastEnd = 0;
  return lineTokens.map((tokens, li) => {
    let matched = 0;
    const words = tokens.map((tok) => {
      const p = pairs[k];
      if (p && p.kind !== 'mismatch') matched++;
      const w = { text: tok.display, start: times[k].start, end: times[k].end, matched: !!p && p.kind !== 'mismatch' };
      k++;
      return w;
    });
    const start = words.length ? words[0].start : lastEnd;
    const end = words.length ? words[words.length - 1].end : start;
    lastEnd = end;
    return { text: lines[li].trim(), start, end, words, confidence: tokens.length ? matched / tokens.length : 0 };
  });
}

/** 没有歌词时，把识别结果按停顿和长度切成行 */
export function segmentLines(segments, pause = 0.7, maxUnits = 16) {
  const lines = [];
  let words = [], units = 0;
  const flush = () => {
    if (!words.length) return;
    let text = words.map((w) => w.text).join('').trim();
    text = text.replace(/[，。、,.；;：:\s]+$/u, '');
    if (text) lines.push({ text, start: words[0].start, end: words[words.length - 1].end, words, confidence: 1 });
    words = [];
    units = 0;
  };
  for (const seg of segments) {
    const t = seg.text.trim();
    if (!t) continue;
    const prev = words[words.length - 1];
    if (prev && (seg.start - prev.end >= pause || units >= maxUnits)) flush();
    const last = words[words.length - 1];
    if (last && needsSpace(last.text.slice(-1), t[0])) last.text += ' ';
    words.push({ text: t, start: seg.start, end: seg.end, matched: true });
    units += tokenize(t).length;
    if (/[。！？!?.]$/u.test(t)) flush();
  }
  flush();
  return lines;
}

function needsSpace(a, b) {
  const aw = (WORD_CHAR.test(a) || ',.!?;:'.includes(a)) && !isCJK(a);
  const bw = WORD_CHAR.test(b) && !isCJK(b);
  return aw && bw;
}

/** 去掉 LRC 时间标签、[ti:] 元信息、[Chorus] 等段落标记和空行 */
export function cleanLyrics(raw) {
  return raw.split(/\r?\n/)
    .map((l) => l.replace(/\[[^\]]*\]|<\d+:\d+(\.\d+)?>/g, '').trim())
    .filter(Boolean);
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function lrcTime(t) {
  const cs = Math.round(Math.max(t, 0) * 100);
  return `${pad(Math.floor(cs / 6000))}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

export function srtTime(t) {
  const ms = Math.round(Math.max(t, 0) * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

/** format: 'lrc' | 'klrc'（逐字）| 'srt'。start 为 null 的行（还没打点）会被跳过 */
export function exportLyrics(lines, format, title = '') {
  const timed = lines.filter((l) => l.start != null);
  if (format === 'srt') {
    return timed.map((l, i) => {
      const next = timed[i + 1];
      const end = l.end > l.start + 0.05 ? l.end : next ? next.start : l.start + 3;
      return `${i + 1}\n${srtTime(l.start)} --> ${srtTime(end)}\n${l.text}\n`;
    }).join('\n');
  }
  const out = title ? [`[ti:${title}]`] : [];
  for (const l of timed) {
    if (format === 'klrc' && l.words.length) {
      out.push(`[${lrcTime(l.start)}]` + l.words.map((w) => `<${lrcTime(w.start)}>${w.text}`).join('') + `<${lrcTime(l.end)}>`);
    } else {
      out.push(`[${lrcTime(l.start)}]${l.text}`);
    }
  }
  return out.join('\n') + '\n';
}
