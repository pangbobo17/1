import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as Sharing from 'expo-sharing';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultLook,
  emptyLibrary,
  kindInfo,
  type Library,
  type Memory,
  mergeLibrary,
  type Moment,
  newId,
  normalizeLibrary,
  type Person,
  removePerson,
  suggestLook,
  toDateString,
  upcoming,
  chineseMonthDay,
} from './core/model';

const LIBRARY_KEY = 'niannian.library.v1';
const API_KEY = 'niannian.apiKey';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

interface Store {
  ready: boolean;
  library: Library;
  apiKey: string;
  setApiKey: (key: string) => void;
  toast: string | null;
  show: (message: string) => void;
  select: (id: string) => void;
  savePerson: (p: Person) => void;
  deletePerson: (id: string) => void;
  saveMoment: (m: Moment) => void;
  deleteMoment: (id: string) => void;
  saveMemory: (m: Memory) => void;
  deleteMemory: (id: string) => void;
  /** 把相册里选的照片复制到 App 自己的目录，返回新地址 */
  keepPhoto: (uri: string) => Promise<string>;
  exportBackup: () => Promise<void>;
  importBackup: () => Promise<void>;
  loadSample: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

function photosDir(): Directory {
  const dir = new Directory(Paths.document, 'photos');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** 重排提醒：每个时刻只排下一次，App 打开或修改时重排 */
async function reschedule(lib: Library) {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = new Date();
    const requests: { at: Date; title: string; body: string }[] = [];
    for (const u of upcoming(lib, null, now)) {
      const before = u.moment.remindDaysBefore;
      if (u.isPast || before == null) continue;
      const at = new Date(u.date.getFullYear(), u.date.getMonth(), u.date.getDate() - before, 9, 0, 0);
      if (at <= now) continue;
      const name = lib.people.find((p) => p.id === u.moment.personId)?.name ?? '';
      requests.push({
        at,
        title: `${kindInfo(u.moment.kind).emoji} ${name}的${u.moment.title}`,
        body: before === 0 ? '就是今天，别忘了。' : `还有 ${before} 天（${chineseMonthDay(u.date)}），提前准备一下吧。`,
      });
    }
    // iOS 最多保留 64 个待发提醒
    requests.sort((a, b) => a.at.getTime() - b.at.getTime());
    for (const r of requests.slice(0, 60)) {
      await Notifications.scheduleNotificationAsync({
        content: { title: r.title, body: r.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
      });
    }
  } catch {
    // 没有通知权限时什么都不做
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const [apiKey, setApiKeyState] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const momentsRef = useRef<string>('');

  useEffect(() => {
    (async () => {
      const [raw, key] = await Promise.all([AsyncStorage.getItem(LIBRARY_KEY), AsyncStorage.getItem(API_KEY)]);
      if (raw) {
        try {
          setLibrary(normalizeLibrary(JSON.parse(raw)));
        } catch {
          // 文件坏了就从空的开始
        }
      }
      setApiKeyState(key ?? '');
      setReady(true);
    })();
  }, []);

  // 每次改动都存起来；时刻或人名变了就重排提醒
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(library)).catch(() => {});
    const signature = JSON.stringify([library.moments, library.people.map((p) => p.name)]);
    if (signature !== momentsRef.current) {
      momentsRef.current = signature;
      reschedule(library);
    }
  }, [library, ready]);

  const show = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const upsert = <T extends { id: string }>(list: T[], item: T) =>
    list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

  const store = useMemo<Store>(
    () => ({
      ready,
      library,
      apiKey,
      setApiKey: (key) => {
        setApiKeyState(key);
        AsyncStorage.setItem(API_KEY, key).catch(() => {});
      },
      toast,
      show,
      select: (id) => setLibrary((l) => ({ ...l, currentPersonId: id })),
      savePerson: (p) =>
        setLibrary((l) => {
          const isNew = !l.people.some((x) => x.id === p.id);
          return { ...l, people: upsert(l.people, p), currentPersonId: isNew ? p.id : l.currentPersonId };
        }),
      deletePerson: (id) =>
        setLibrary((l) => {
          const photo = l.people.find((p) => p.id === id)?.photoUri;
          if (photo) {
            try {
              new File(photo).delete();
            } catch {}
          }
          return removePerson(l, id);
        }),
      saveMoment: (m) => {
        setLibrary((l) => ({ ...l, moments: upsert(l.moments, m) }));
        if (m.remindDaysBefore != null) Notifications.requestPermissionsAsync().catch(() => {});
      },
      deleteMoment: (id) => setLibrary((l) => ({ ...l, moments: l.moments.filter((m) => m.id !== id) })),
      saveMemory: (m) => setLibrary((l) => ({ ...l, memories: upsert(l.memories, m) })),
      deleteMemory: (id) => setLibrary((l) => ({ ...l, memories: l.memories.filter((m) => m.id !== id) })),
      keepPhoto: async (uri) => {
        const src = new File(uri);
        const dest = new File(photosDir(), `${newId()}.${src.extension.replace('.', '') || 'jpg'}`);
        await src.copy(dest);
        return dest.uri;
      },
      exportBackup: async () => {
        // 照片转成 base64 一起放进备份
        const photos: Record<string, string> = {};
        for (const p of library.people) {
          if (!p.photoUri) continue;
          try {
            photos[p.id] = await new File(p.photoUri).base64();
          } catch {}
        }
        const file = new File(Paths.cache, `念念备份-${toDateString(new Date())}.json`);
        if (file.exists) file.delete();
        file.create();
        await file.write(JSON.stringify({ app: 'niannian', exportedAt: new Date().toISOString(), library, photos }));
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: '保存念念备份' });
      },
      importBackup: async () => {
        const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain', '*/*'] });
        if (picked.canceled) return;
        try {
          const data = JSON.parse(await picked.result.text());
          const incoming = normalizeLibrary(data.library);
          const photos: Record<string, string> = data.photos ?? {};
          for (const p of incoming.people) {
            p.photoUri = undefined;
            const b64 = photos[p.id];
            if (!b64) continue;
            const f = new File(photosDir(), `${newId()}.jpg`);
            f.create();
            await f.write(b64, { encoding: 'base64' });
            p.photoUri = f.uri;
          }
          setLibrary((l) => mergeLibrary(l, incoming));
          show(`已恢复 ${incoming.people.length} 位人物`);
        } catch {
          show('这个文件读不出来');
        }
      },
      loadSample: () => {
        const today = new Date();
        const offset = (days: number, yearsAgo = 0) =>
          toDateString(new Date(today.getFullYear() - yearsAgo, today.getMonth(), today.getDate() + days));
        const kid: Person = { id: newId(), name: '小橙子', relation: '儿子', about: '四年级，喜欢乐高、编程和动手做东西。', look: { ...suggestLook('儿子'), top: '#6C9BD2', bottom: '#7BC8A4' }, createdAt: new Date().toISOString() };
        const wife: Person = { id: newId(), name: '阿静', relation: '老婆', about: '喜欢花、咖啡，周末想去郊外走走。', look: suggestLook('老婆'), createdAt: new Date().toISOString() };
        const elder: Person = { id: newId(), name: '老爸', relation: '爸爸', about: '爱下象棋，血压有点高。', look: { ...defaultLook(), age: 'elder', hairColor: '#C9C3BC', glasses: true, top: '#3E4A61', bottom: '#5A3B2A' }, createdAt: new Date().toISOString() };
        const mem = (personId: string, title: string, text: string, days: number): Memory => ({ id: newId(), personId, title, text, date: offset(-days), createdAt: new Date().toISOString() });
        const mo = (personId: string, title: string, kind: Moment['kind'], date: string, repeatsYearly: boolean): Moment => ({ id: newId(), personId, title, kind, date, repeatsYearly, remindDaysBefore: 1 });
        setLibrary((l) => ({
          ...l,
          people: [...l.people, kid, wife, elder],
          moments: [
            ...l.moments,
            mo(kid.id, '编程等级考试', 'exam', offset(57), false),
            mo(kid.id, '生日', 'birthday', offset(213, 10), true),
            mo(wife.id, '生日', 'birthday', offset(32, 34), true),
            mo(wife.id, '结婚纪念日', 'anniversary', offset(72, 12), true),
            mo(elder.id, '生日', 'birthday', offset(8, 66), true),
          ],
          memories: [
            ...l.memories,
            mem(kid.id, '自己搭了个机器人', '这周在家把作业做完，还自己用乐高搭了一个会走的机器人。', 1),
            mem(kid.id, '看电视超时', '看电视超时被说了，后来自己定了每天 30 分钟的规矩。', 3),
            mem(kid.id, '想要编程套件', '说同学有一套 Arduino 入门套件，能做会动的小车，很羡慕。', 6),
            mem(wife.id, '', '说公司楼下新开的花店很好看，想要一束洋桔梗。', 2),
            mem(elder.id, '', '电话里说最近膝盖有点疼，下楼梯不方便。', 4),
          ],
          currentPersonId: kid.id,
        }));
        show('已添加示例');
      },
    }),
    [ready, library, apiKey, toast, show],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
