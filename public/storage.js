import { validateOrder, newId } from './domain.js';
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const complete = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('A gravação foi interrompida.')); tx.onerror = () => {}; });
export async function openStorage(name = 'casinha-azul-operacao-v1') {
  const opening = indexedDB.open(name, 1);
  opening.onupgradeneeded = () => {
    const db = opening.result;
    db.createObjectStore('orders', { keyPath: 'id' });
    db.createObjectStore('outbox', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  };
  const db = await request(opening);
  db.onversionchange = () => db.close();
  async function getMeta(key) { return (await request(db.transaction('meta').objectStore('meta').get(key)))?.value; }
  async function setMeta(key, value) { const tx = db.transaction('meta', 'readwrite'), done = complete(tx); tx.objectStore('meta').put({ key, value }); await done; }
  const init = db.transaction('meta', 'readwrite'), initDone = complete(init), meta = init.objectStore('meta');
  if (!await request(meta.get('deviceId'))) meta.put({ key: 'deviceId', value: newId() });
  await initDone;
  async function commit(id, expectedVersion, reducer, creating = false) {
    const tx = db.transaction(['orders', 'outbox', 'meta'], 'readwrite');
    const done = complete(tx); done.catch(() => {});
    try {
      const orders = tx.objectStore('orders'), meta = tx.objectStore('meta');
      const previous = creating ? null : await request(orders.get(id));
      if (!creating && (!previous || previous.version !== expectedVersion)) throw new Error('A comanda mudou em outra janela. Abra a comanda novamente antes de continuar.');
      let value;
      if (creating) {
        const sequence = (await request(meta.get('sequence')))?.value || 0;
        const deviceId = (await request(meta.get('deviceId'))).value;
        meta.put({ key: 'sequence', value: sequence + 1 });
        const now = new Date().toISOString();
        value = { id, number: String(sequence + 1).padStart(4, '0'), name: '', deviceId, version: 0, status: 'aberta', items: [], totalCents: 0, createdAt: now, updatedAt: now, simulation: true };
      } else value = previous;
      const next = reducer(structuredClone(value));
      next.version = creating ? 0 : previous.version + 1;
      validateOrder(next);
      const event = { id: newId(), orderId: next.id, deviceId: next.deviceId, baseVersion: creating ? -1 : previous.version, occurredAt: new Date().toISOString(), order: next };
      orders.put(next); tx.objectStore('outbox').put(event);
      await done; return next;
    } catch (error) { try { tx.abort(); } catch {} await done.catch(() => {}); throw error; }
  }
  return {
    getMeta, setMeta,
    async create(name = '') { const clean = String(name).trim(); if (clean.length > 80) throw new Error('Use até 80 caracteres no nome.'); return commit(newId(), -1, order => ({ ...order, name: clean }), true); },
    update: (id, version, reducer) => commit(id, version, reducer),
    get: id => request(db.transaction('orders').objectStore('orders').get(id)),
    all: () => request(db.transaction('orders').objectStore('orders').getAll()),
    pending: async () => (await request(db.transaction('outbox').objectStore('outbox').getAll())).sort((a, b) => a.order.id.localeCompare(b.order.id) || a.order.version - b.order.version),
    async acknowledge(ids, timestamp) {
      const tx = db.transaction(['outbox', 'meta'], 'readwrite'), done = complete(tx);
      for (const id of ids) tx.objectStore('outbox').delete(id);
      tx.objectStore('meta').put({ key: 'lastSync', value: timestamp }); await done;
    },
    close: () => db.close(),
  };
}
