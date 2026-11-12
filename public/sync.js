export function createSync(storage, onChange, fetcher = fetch, isOnline = () => navigator.onLine !== false) {
  let running = false, status = 'local', error = '';
  const state = async () => ({ status, error, pending: (await storage.pending()).length, lastSync: await storage.getMeta('lastSync') });
  async function notify() { onChange(await state()); }
  async function run() {
    if (running) return;
    running = true; error = '';
    try {
      const events = await storage.pending();
      if (!isOnline() || await storage.getMeta('offlineSimulation')) { status = 'offline'; return; }
      if (!events.length) { status = 'local'; return; }
      status = 'syncing'; await notify();
      for (let i = 0; i < events.length; i += 30) {
        const batch = events.slice(i, i + 30);
        const response = await fetcher('/api/demo/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: batch }), signal: AbortSignal.timeout(10000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'O servidor de demonstração não respondeu.');
        if (!Array.isArray(result.accepted) || result.accepted.length !== batch.length || !batch.every(event => result.accepted.includes(event.id))) throw new Error('O servidor não confirmou todos os registros enviados.');
        await storage.acknowledge(result.accepted, result.savedAt);
      }
      status = 'synced';
    } catch (e) { status = 'pending'; error = e.message; }
    finally { running = false; await notify(); }
  }
  return { run, state };
}
