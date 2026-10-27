/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chatSuggestions,
  emptyLibrary,
  type Library,
  mergeLibrary,
  memoryTitle,
  type Moment,
  normalizeLibrary,
  offlineOrganize,
  offlineReply,
  personContext,
  type Person,
  removePerson,
  suggestLook,
  defaultLook,
  upcoming,
  upcomingOf,
  daysLabel,
  toDateString,
} from './model.ts';

const person: Person = { id: 'p', name: '小菠萝', relation: '儿子', about: '喜欢乐高和编程', look: defaultLook(), createdAt: '2026-01-01T00:00:00.000Z' };
const moment = (date: string, kind: Moment['kind'], repeatsYearly: boolean, title = 'x'): Moment => ({
  id: title + date, personId: 'p', title, kind, date, repeatsYearly, remindDaysBefore: 1,
});
const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h);

test('yearly moment later this year', () => {
  const u = upcomingOf(moment('2015-12-10', 'birthday', true), at(2026, 10, 14, 20));
  assert.equal(u.days, 57);
  assert.equal(daysLabel(u), '57 天后');
  assert.equal(u.years, 11);
});

test('yearly moment already passed rolls over', () => {
  const u = upcomingOf(moment('1990-03-01', 'birthday', true), at(2026, 10, 14));
  assert.equal(toDateString(u.date), '2027-03-01');
  assert.equal(u.years, 37);
});

test('today', () => {
  const u = upcomingOf(moment('2020-10-14', 'anniversary', true), at(2026, 10, 14, 23));
  assert.equal(daysLabel(u), '今天');
});

test('leap day in common year', () => {
  assert.equal(toDateString(upcomingOf(moment('2000-02-29', 'birthday', true), at(2026, 1, 1)).date), '2026-02-28');
  assert.equal(toDateString(upcomingOf(moment('2000-02-29', 'birthday', true), at(2028, 1, 1)).date), '2028-02-29');
});

test('one-off past', () => {
  const u = upcomingOf(moment('2026-10-11', 'exam', false), at(2026, 10, 14));
  assert.ok(u.isPast);
  assert.equal(daysLabel(u), '3 天前');
});

test('upcoming order', () => {
  const lib: Library = { ...emptyLibrary(), moments: [moment('2026-10-01', 'exam', false, '过去'), moment('2000-05-01', 'birthday', true, '远'), moment('2026-10-20', 'exam', false, '近')] };
  assert.deepEqual(upcoming(lib, null, at(2026, 10, 14)).map((u) => u.moment.title), ['近', '远', '过去']);
});

test('remove person cascades', () => {
  const lib: Library = {
    ...emptyLibrary(),
    people: [person, { ...person, id: 'q', name: '岳父' }],
    moments: [moment('2026-01-01', 'other', false)],
    memories: [{ id: 'm', personId: 'p', title: '', text: 'y', date: null, createdAt: '' }],
    currentPersonId: 'p',
  };
  const out = removePerson(lib, 'p');
  assert.deepEqual(out.people.map((p) => p.name), ['岳父']);
  assert.equal(out.moments.length, 0);
  assert.equal(out.memories.length, 0);
  assert.equal(out.currentPersonId, 'q');
});

test('normalize fills defaults and merge overrides by id', () => {
  const lib = normalizeLibrary({ people: [{ ...person, look: { age: 'kid' } }] });
  assert.equal(lib.people[0].look.age, 'kid');
  assert.equal(lib.people[0].look.hair, 'short');
  assert.deepEqual(normalizeLibrary(null), emptyLibrary());
  const merged = mergeLibrary(lib, { ...emptyLibrary(), people: [{ ...person, name: '新名字' }] });
  assert.deepEqual(merged.people.map((p) => p.name), ['新名字']);
});

test('memory title', () => {
  assert.equal(memoryTitle({ id: '', personId: '', title: ' ', text: '第一行\n第二行', date: null, createdAt: '' }), '第一行');
});

test('suggested look', () => {
  assert.equal(suggestLook('儿子').age, 'kid');
  assert.equal(suggestLook('岳父').age, 'elder');
  assert.equal(suggestLook('老婆').hair, 'long');
});

test('context and suggestions', () => {
  const lib: Library = {
    ...emptyLibrary(),
    people: [person],
    moments: [moment('2026-12-10', 'exam', false, 'GESP 考试')],
    memories: [{ id: 'm', personId: 'p', title: '看电视超时', text: '看电视超时被批评', date: '2026-10-12', createdAt: '2026-10-12T00:00:00.000Z' }],
  };
  const ctx = personContext(person, lib, at(2026, 10, 14));
  assert.match(ctx, /名字：小菠萝（用户的儿子）/);
  assert.match(ctx, /GESP 考试/);
  assert.match(ctx, /看电视超时被批评/);
  assert.match(chatSuggestions(person, lib, at(2026, 10, 14))[1], /GESP 考试/);
  assert.match(offlineReply('送什么礼物好', person, lib), /乐高/);
});

test('offline organize', () => {
  assert.deepEqual(offlineOrganize('  今天没去上课，在家把作业做了  '), { title: '今天没去上课', text: '今天没去上课，在家把作业做了' });
});
