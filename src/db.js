// Enkelt IndexedDB-lager. Ett uppdrag lagras som ett dokument med nästlade delar.
const DB_NAME = "ovk-webb";
const DB_VERSION = 2;
export const STORES = ["kunder", "fastigheter", "uppdrag", "meta"];

let _db = null;
export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: "id" });
        }
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}
function reqAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const os = await tx(store, "readonly");
  return reqAsPromise(os.getAll());
}
export async function get(store, id) {
  const os = await tx(store, "readonly");
  return reqAsPromise(os.get(id));
}
export async function put(store, obj) {
  if (!obj.id) obj.id = crypto.randomUUID();
  obj.updatedAt = new Date().toISOString();
  if (!obj.createdAt) obj.createdAt = obj.updatedAt;
  const os = await tx(store, "readwrite");
  await reqAsPromise(os.put(obj));
  return obj;
}
export async function del(store, id) {
  const os = await tx(store, "readwrite");
  return reqAsPromise(os.delete(id));
}
export async function clear(store) {
  const os = await tx(store, "readwrite");
  return reqAsPromise(os.clear());
}

export async function getMeta(key, fallback = null) {
  const rec = await get("meta", key);
  return rec ? rec.value : fallback;
}
export async function setMeta(key, value) {
  return put("meta", { id: key, value });
}

export async function exportAll() {
  const data = { app: "ovk-webb", version: 1, exportedAt: new Date().toISOString(), stores: {} };
  for (const s of STORES) data.stores[s] = await getAll(s);
  return data;
}
export async function importAll(data, { merge = true } = {}) {
  if (!data || !data.stores) throw new Error("Ogiltig backup-fil.");
  for (const s of STORES) {
    if (!merge) await clear(s);
    const rows = data.stores[s] || [];
    for (const row of rows) {
      row.id = row.id || crypto.randomUUID();
      const os = await tx(s, "readwrite");
      await reqAsPromise(os.put(row));
    }
  }
}
