// 数据模型和纯逻辑：不依赖 React Native，可以直接用 Node 测试

export type HairStyle = 'short' | 'long' | 'bun' | 'curly' | 'none';
export type AgeGroup = 'kid' | 'adult' | 'elder';

/** 用 SVG 画出来的小人形象 */
export interface Look {
  age: AgeGroup;
  skin: string;
  hair: HairStyle;
  hairColor: string;
  top: string;
  bottom: string;
  glasses: boolean;
}

export interface Person {
  id: string;
  name: string;
  /** 关系，比如“老婆”“岳父” */
  relation: string;
  /** 喜好、性格之类 */
  about: string;
  look: Look;
  /** 用照片当形象时的本地文件地址 */
  photoUri?: string;
  createdAt: string;
}

export type MomentKind = 'birthday' | 'anniversary' | 'exam' | 'festival' | 'other';

export const MOMENT_KINDS: { kind: MomentKind; title: string; emoji: string; repeats: boolean }[] = [
  { kind: 'birthday', title: '生日', emoji: '🎂', repeats: true },
  { kind: 'anniversary', title: '纪念日', emoji: '💐', repeats: true },
  { kind: 'exam', title: '考试', emoji: '📝', repeats: false },
  { kind: 'festival', title: '节日', emoji: '🏮', repeats: true },
  { kind: 'other', title: '其他', emoji: '📌', repeats: false },
];

export function kindInfo(kind: MomentKind) {
  return MOMENT_KINDS.find((k) => k.kind === kind) ?? MOMENT_KINDS[4];
}

/** 重要时刻 */
export interface Moment {
  id: string;
  personId: string;
  title: string;
  kind: MomentKind;
  /** 本地日期 YYYY-MM-DD */
  date: string;
  repeatsYearly: boolean;
  /** 提前几天提醒，null 表示不提醒 */
  remindDaysBefore: number | null;
}

/** 小事记录 */
export interface Memory {
  id: string;
  personId: string;
  title: string;
  text: string;
  /** 事情发生的日期 YYYY-MM-DD，可以不填 */
  date: string | null;
  createdAt: string;
}

export interface Library {
  version: 1;
  people: Person[];
  moments: Moment[];
  memories: Memory[];
  currentPersonId: string | null;
}

export const emptyLibrary = (): Library => ({
  version: 1,
  people: [],
  moments: [],
  memories: [],
  currentPersonId: null,
});

/** 读入的 JSON 可能来自旧版本或备份文件，缺的字段补上默认值 */
export function normalizeLibrary(raw: unknown): Library {
  const r = (raw ?? {}) as Partial<Library>;
  return {
    version: 1,
    people: Array.isArray(r.people) ? r.people.map((p) => ({ ...p, look: { ...defaultLook(), ...p.look } })) : [],
    moments: Array.isArray(r.moments) ? r.moments : [],
    memories: Array.isArray(r.memories) ? r.memories : [],
    currentPersonId: typeof r.currentPersonId === 'string' ? r.currentPersonId : null,
  };
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------- 日期 ----------

export function toDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 按本地时区解析 YYYY-MM-DD，得到当天 0 点 */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const DAY = 24 * 60 * 60 * 1000;

/** 两个日期相差的天数（按日历日算，不受夏令时影响） */
export function dayDiff(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY);
}

/** 某年的周年日；2 月 29 日在平年记为 2 月 28 日 */
function anniversary(month: number, day: number, year: number): Date {
  const d = new Date(year, month, day);
  return d.getMonth() === month ? d : new Date(year, month, day - 1);
}

export interface Upcoming {
  moment: Moment;
  /** 下一次的日期；不重复且已过去时就是原日期 */
  date: Date;
  /** 未来是还有几天，过去是已经过了几天 */
  days: number;
  isPast: boolean;
  /** 每年重复的是第几年（生日就是几岁） */
  years: number | null;
}

export function upcomingOf(moment: Moment, now: Date = new Date()): Upcoming {
  const today = startOfDay(now);
  const original = parseDate(moment.date);
  if (moment.repeatsYearly) {
    let next = anniversary(original.getMonth(), original.getDate(), today.getFullYear());
    if (next < today) next = anniversary(original.getMonth(), original.getDate(), today.getFullYear() + 1);
    const years = next.getFullYear() - original.getFullYear();
    return { moment, date: next, days: dayDiff(today, next), isPast: false, years: years > 0 ? years : null };
  }
  const d = dayDiff(today, original);
  return { moment, date: original, days: Math.abs(d), isPast: d < 0, years: null };
}

/** 接下来的时刻，近的在前；已经过去的排最后 */
export function upcoming(lib: Library, personId?: string | null, now: Date = new Date()): Upcoming[] {
  return lib.moments
    .filter((m) => !personId || m.personId === personId)
    .map((m) => upcomingOf(m, now))
    .sort((a, b) => {
      if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
      return a.isPast ? a.days - b.days : a.days - b.days;
    });
}

export function daysLabel(u: Upcoming): string {
  if (u.days === 0) return '今天';
  if (u.isPast) return `${u.days} 天前`;
  if (u.days === 1) return '明天';
  return `${u.days} 天后`;
}

export function chineseDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function chineseMonthDay(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ---------- 人物和小事 ----------

export function memoriesOf(lib: Library, personId: string): Memory[] {
  return lib.memories
    .filter((m) => m.personId === personId)
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

function sortKey(m: Memory): string {
  return (m.date ?? m.createdAt.slice(0, 10)) + m.createdAt;
}

export function memoryTitle(m: Memory): string {
  const t = m.title.trim();
  if (t) return t;
  const first = m.text.split('\n')[0] ?? '';
  return first.length > 20 ? first.slice(0, 20) + '…' : first;
}

export function currentPerson(lib: Library): Person | undefined {
  return lib.people.find((p) => p.id === lib.currentPersonId) ?? lib.people[0];
}

/** 删掉一个人以及 TA 的时刻和小事 */
export function removePerson(lib: Library, id: string): Library {
  const people = lib.people.filter((p) => p.id !== id);
  return {
    ...lib,
    people,
    moments: lib.moments.filter((m) => m.personId !== id),
    memories: lib.memories.filter((m) => m.personId !== id),
    currentPersonId: lib.currentPersonId === id ? people[0]?.id ?? null : lib.currentPersonId,
  };
}

/** 合并备份：同一 id 用备份里的覆盖，其余保留 */
export function mergeLibrary(mine: Library, theirs: Library): Library {
  const merge = <T extends { id: string }>(a: T[], b: T[]) => {
    const ids = new Set(b.map((x) => x.id));
    return [...a.filter((x) => !ids.has(x.id)), ...b];
  };
  return {
    version: 1,
    people: merge(mine.people, theirs.people),
    moments: merge(mine.moments, theirs.moments),
    memories: merge(mine.memories, theirs.memories),
    currentPersonId: mine.currentPersonId ?? theirs.currentPersonId,
  };
}

// ---------- 形象 ----------

export const SKINS = ['#FBE3CF', '#F2CBA8', '#DDA97E', '#B97F57'];
export const HAIR_COLORS = ['#2B2230', '#5A3B2A', '#A0663B', '#C9C3BC'];
export const CLOTH_COLORS = ['#FF8A5B', '#6C9BD2', '#7BC8A4', '#F2C14E', '#C58BD8', '#3E4A61', '#E86A7A', '#F5F0E6'];

export function defaultLook(): Look {
  return { age: 'adult', skin: SKINS[0], hair: 'short', hairColor: HAIR_COLORS[0], top: CLOTH_COLORS[0], bottom: CLOTH_COLORS[5], glasses: false };
}

/** 根据关系猜一个默认形象，后面还能改 */
export function suggestLook(relation: string): Look {
  const look = defaultLook();
  if (/儿子|女儿|侄|外甥|孙|宝/.test(relation)) look.age = 'kid';
  if (/爷|奶|姥|外公|外婆|岳|公公|婆婆/.test(relation)) {
    look.age = 'elder';
    look.hairColor = HAIR_COLORS[3];
    look.glasses = true;
  }
  if (/妻|老婆|女儿|妈|母|奶|姥|外婆|婆婆|姐|妹|侄女/.test(relation)) {
    look.hair = look.age === 'elder' ? 'bun' : 'long';
    look.top = CLOTH_COLORS[6];
  }
  return look;
}

// ---------- 给 AI 的资料 ----------

export const MASCOT = '团团';

export const CHAT_SYSTEM = `你是“${MASCOT}”，住在“念念”App 里的小助手，一个圆滚滚、热心又靠谱的杏子团子。用户在这里记录 TA 在意的人：重要日子和生活里的小事。
你会收到关于某一个人的资料。只根据这些资料和常识回答，用简体中文，语气自然亲切，不要编造资料里没有的经历。
回答简洁：一般不超过 200 字；给建议时列 2 到 4 条，每条一句话说明理由。不要使用 Markdown 标题或表格。`;

export const ORGANIZE_SYSTEM = `你帮用户整理一段关于家人或朋友的随手记录。保留原意和细节，不要添加没有提到的事实。
标题不超过 12 个字；正文把口语整理成通顺的一两句话。用简体中文。`;

/** 某个人的资料摘要 */
export function personContext(person: Person, lib: Library, now: Date = new Date(), maxChars = 3000): string {
  const lines: string[] = [];
  lines.push(`名字：${person.name}${person.relation ? `（用户的${person.relation}）` : ''}`);
  if (person.about) lines.push(`关于 TA：${person.about}`);
  lines.push(`今天是 ${chineseDate(now)}。`);
  const ups = upcoming(lib, person.id, now).filter((u) => !u.isPast).slice(0, 6);
  if (ups.length) {
    lines.push('重要时刻：');
    for (const u of ups) {
      let s = `- ${u.moment.title}（${kindInfo(u.moment.kind).title}），${chineseDate(u.date)}，${daysLabel(u)}`;
      if (u.moment.kind === 'birthday' && u.years) s += `，满 ${u.years} 岁`;
      lines.push(s);
    }
  }
  const mems = memoriesOf(lib, person.id).slice(0, 30);
  if (mems.length) {
    lines.push('最近的小事（新的在前）：');
    for (const m of mems) {
      const d = m.date ? chineseDate(parseDate(m.date)) : chineseDate(new Date(m.createdAt));
      lines.push(`- ${d} ${m.title ? m.title + '：' : ''}${m.text.replace(/\n/g, ' ')}`);
    }
  }
  const text = lines.join('\n');
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/** 聊天里的快捷问题 */
export function chatSuggestions(person: Person, lib: Library, now: Date = new Date()): string[] {
  const s = ['TA 最近在忙什么？'];
  const next = upcoming(lib, person.id, now).find((u) => !u.isPast && u.days <= 60);
  s.push(next ? `${next.moment.title}快到了，可以送什么？` : '想给 TA 一个小惊喜，有什么主意？');
  s.push('这周可以和 TA 一起做点什么？');
  return s;
}

// ---------- 没有联网 AI 时的本地小建议 ----------

const GIFT_HINTS: [RegExp, string][] = [
  [/乐高|积木|拼装/, '一套新的乐高或拼装模型，能一起动手搭'],
  [/编程|Arduino|机器人|电子/, '一套 Arduino 或编程机器人入门套件'],
  [/画|彩笔|美术/, '一盒好用的彩笔或水彩颜料，再配个画本'],
  [/花|洋桔梗|玫瑰/, '一束 TA 喜欢的花，附一张手写卡片'],
  [/咖啡/, '一包精品咖啡豆或一只好看的杯子'],
  [/象棋|围棋|下棋/, '一副手感好的棋具，再约 TA 下一盘'],
  [/膝盖|腰|颈椎|血压|身体/, '实用的健康礼物，比如护膝、按摩仪或血压计'],
  [/书|阅读|看书/, '一本 TA 最近感兴趣主题的书'],
  [/跑步|运动|球|骑行|骑车/, '运动装备，比如速干衣、护具或一双好鞋'],
  [/旅行|郊外|走走|爬山/, '安排一次周末短途出游'],
  [/游戏|switch|Switch/, '一款能全家一起玩的游戏'],
  [/音乐|唱歌|钢琴|吉他/, '音乐会门票或一副好耳机'],
];

/** 从资料里找关键词给出礼物方向；找不到时返回通用建议 */
export function offlineGiftIdeas(person: Person, lib: Library): string[] {
  const text = [person.about, ...memoriesOf(lib, person.id).map((m) => m.title + ' ' + m.text)].join(' ');
  const ideas = GIFT_HINTS.filter(([re]) => re.test(text)).map(([, idea]) => idea);
  if (ideas.length === 0) {
    ideas.push('一起吃顿 TA 喜欢的饭，比礼物更重要的是陪伴', '一张写满具体小事的手写卡片', '翻翻最近的小事记录，挑一件 TA 提过想要的东西');
  }
  return ideas.slice(0, 4);
}

export function offlineReply(question: string, person: Person, lib: Library, now: Date = new Date()): string {
  const name = person.name;
  if (/送|礼|惊喜/.test(question)) {
    const ideas = offlineGiftIdeas(person, lib);
    return `根据你记下的关于${name}的事，可以考虑：\n${ideas.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
  }
  if (/忙|最近|近况/.test(question)) {
    const mems = memoriesOf(lib, person.id).slice(0, 3);
    if (mems.length === 0) return `还没有关于${name}的小事记录，记几件之后我就能帮你回顾啦。`;
    return `最近关于${name}，你记下了：\n${mems.map((m) => `· ${memoryTitle(m)}`).join('\n')}`;
  }
  const next = upcoming(lib, person.id, now).find((u) => !u.isPast);
  if (/一起|做点|周末|陪/.test(question)) {
    return `可以约${name}做一件 TA 喜欢的事${person.about ? `（比如和“${person.about.slice(0, 20)}”有关的）` : ''}，不用复杂，一起吃饭散步也很好。${next ? `\n另外，${next.moment.title}${daysLabel(next)}，可以提前安排一下。` : ''}`;
  }
  return `我现在是离线模式，只能做简单的回顾和送礼建议。在“我的 → AI 设置”里填上 API Key，就能和我好好聊天啦。`;
}

/** 离线整理：去掉多余空白，取第一句话当标题 */
export function offlineOrganize(text: string): { title: string; text: string } {
  const clean = text.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  const first = clean.split(/[，。！？,.!?\n]/)[0] ?? clean;
  return { title: first.length > 12 ? first.slice(0, 12) : first, text: clean };
}
