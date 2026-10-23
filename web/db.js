// 作品保存在本机 IndexedDB：projects 存歌词和时间轴，audio 存音频文件本身
const DB_NAME = 'lyricsync';
let dbPromise = null;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('projects', { keyPath: 'id' });
      req.result.createObjectStore('audio');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const listProjects = () => run('projects', 'readonly', (s) => s.getAll());
export const getProject = (id) => run('projects', 'readonly', (s) => s.get(id));
export const putProject = (p) => run('projects', 'readwrite', (s) => s.put(p));
export const putAudio = (id, blob) => run('audio', 'readwrite', (s) => s.put(blob, id));
export const getAudio = (id) => run('audio', 'readonly', (s) => s.get(id));
export async function deleteProject(id) {
  await run('projects', 'readwrite', (s) => s.delete(id));
  await run('audio', 'readwrite', (s) => s.delete(id));
}
