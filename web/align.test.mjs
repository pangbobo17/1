// node web/align.test.mjs
import assert from 'node:assert/strict';
import { tokenize, tokenizeRecognized, alignLyrics, segmentLines, exportLyrics, cleanLyrics } from './align.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

assert.deepEqual(tokenize("你好, world! Don't stop").map((t) => t.key), ['你', '好', 'world', 'dont', 'stop']);
assert.equal(tokenize("你好, world! Don't stop").map((t) => t.display).join(''), "你好, world! Don't stop");
assert.deepEqual(tokenizeRecognized([{ text: '你好', start: 1, end: 2 }]),
  [{ text: '你', start: 1, end: 1.5 }, { text: '好', start: 1.5, end: 2 }]);

let lines = alignLyrics(['你好世界', '再见'], [
  { text: '嗯啊', start: 0, end: 1 }, { text: '你好世界', start: 2, end: 4 },
  { text: '再见', start: 6, end: 7 }, { text: '谢谢', start: 9, end: 10 }], 10);
near(lines[0].start, 2); near(lines[0].end, 4); near(lines[1].start, 6); assert.equal(lines[1].confidence, 1);

const py = { 好: 'hao', 号: 'hao' };
lines = alignLyrics(['你好世界', '再见朋友'],
  [{ text: '你号世界', start: 1, end: 3 }, { text: '再朋友', start: 4, end: 5.5 }], 6, { phonetic: (c) => py[c] ?? c });
assert.equal(lines[0].confidence, 1); near(lines[1].start, 4); assert.equal(lines[1].words[1].matched, false);

lines = alignLyrics(['Hello darkness, my old friend'],
  [{ text: ' hello darkness', start: 1, end: 2 }, { text: ' my old friend', start: 2.2, end: 3.5 }], 4);
near(lines[0].start, 1); near(lines[0].end, 3.5);

assert.deepEqual(alignLyrics(['一二', '三四'], [], 8).map((l) => l.start), [0, 4]);

assert.deepEqual(segmentLines([{ text: 'hello', start: 0, end: 0.5 }, { text: 'world', start: 0.6, end: 1 },
  { text: 'again', start: 3, end: 3.5 }]).map((l) => l.text), ['hello world', 'again']);

const line = { text: '你好', start: 65.432, end: 66, words: [
  { text: '你', start: 65.432, end: 65.7 }, { text: '好', start: 65.7, end: 66 }] };
assert.equal(exportLyrics([line], 'lrc'), '[01:05.43]你好\n');
assert.equal(exportLyrics([line], 'klrc'), '[01:05.43]<01:05.43>你<01:05.70>好<01:06.00>\n');
assert.equal(exportLyrics([line], 'srt'), '1\n00:01:05,432 --> 00:01:06,000\n你好\n');
assert.equal(exportLyrics([{ text: 'a', start: 1, end: 1, words: [] }, { text: 'b', start: 4, end: 4, words: [] },
  { text: 'c', start: null, end: null, words: [] }], 'srt'),
  '1\n00:00:01,000 --> 00:00:04,000\na\n\n2\n00:00:04,000 --> 00:00:07,000\nb\n');

assert.deepEqual(cleanLyrics('[ti:歌名]\n[00:01.00]第一句\n\n[Chorus]\n第二句 <00:02.00>\n'), ['第一句', '第二句']);
console.log('all align tests passed');
