import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { validateOrder } from './public/domain.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataFile = path.join(root, '.data', 'demo-central.json');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
async function loadState(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return { orders: {}, accepted: {} }; throw error; } }
export async function applyEvents(state, events) {
  if (!Array.isArray(events) || events.length > 30) throw new Error('Lote de sincronização inválido.');
  const next = structuredClone(state);
  for (const event of events) {
    if (!event || !/^[a-f\d-]{36}$/.test(event.id)) throw new Error('Identificador da operação inválido.');
    if (Object.hasOwn(next.accepted, event.id)) continue;
    validateOrder(event.order);
    if (event.order.id !== event.orderId || event.deviceId !== event.order.deviceId) throw new Error('Identificação divergente.');
    const previous = next.orders[event.orderId];
    if ((previous?.version ?? -1) !== event.baseVersion || event.order.version !== event.baseVersion + 1) throw new Error('Conflito de versões: os dados locais foram preservados para conferência.');
    if (previous?.status === 'paga') throw new Error('Comanda paga não pode ser alterada.');
    next.orders[event.orderId] = event.order;
    next.accepted[event.id] = true;
  }
  return next;
}
export function createServer({ file = dataFile } = {}) {
  let queue = Promise.resolve();
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health') return json(200, { status: 'ok', mode: 'demonstracao-operacao' });
      if (url.pathname === '/api/demo/sync' && req.method === 'POST') {
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return json(403, { error: 'Origem não permitida.' });
        if (!String(req.headers['content-type']).startsWith('application/json')) return json(415, { error: 'Use JSON.' });
        let body = '';
        for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 2_000_000) return json(413, { error: 'Envie um lote menor.' }); }
        let events; try { events = JSON.parse(body).events; } catch { return json(400, { error: 'JSON inválido.' }); }
        const operation = queue.then(async () => {
          const next = await applyEvents(await loadState(file), events);
          await mkdir(path.dirname(file), { recursive: true });
          const temp = `${file}.${randomUUID()}.tmp`;
          await writeFile(temp, JSON.stringify(next), { encoding: 'utf8', flush: true });
          await rename(temp, file);
          return { accepted: events.map(event => event.id), savedAt: new Date().toISOString(), simulation: true };
        });
        queue = operation.catch(() => {});
        try { return json(200, await operation); } catch (error) { return json(409, { error: error.message }); }
      }
      if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: 'Método não permitido.' });
      const publicRoot = path.join(root, 'public');
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const target = path.resolve(publicRoot, '.' + relative);
      if (!target.startsWith(publicRoot + path.sep) || !types[path.extname(target)]) return json(404, { error: 'Arquivo não encontrado.' });
      const content = await readFile(target);
      res.writeHead(200, { 'Content-Type': types[path.extname(target)], 'Cache-Control': 'no-cache', ...(relative === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}) });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error.code === 'ENOENT') return json(404, { error: 'Arquivo não encontrado.' });
      json(500, { error: 'Não foi possível concluir a operação.' });
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3001);
  if (port === 3000) throw new Error('A porta 3000 está reservada à administração. Use 3001 ou outra porta.');
  const server = createServer();
  server.listen(port, '127.0.0.1', () => console.log(`Operação Casinha Azul: http://127.0.0.1:${port}\nDemonstração: pagamentos simulados. Administração permanece na porta 3000.`));
  server.on('error', error => { console.error(`Não foi possível abrir a porta ${port}: ${error.code}.`); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeIdleConnections(); });
}
