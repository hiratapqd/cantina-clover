export const payments = { dinheiro: 'Dinheiro', debito: 'Cartão de débito', pix: 'Pix' };
export const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function requireThat(condition, message) { if (!condition) throw new Error(message); }
export function parseMoney(value) {
  const raw = String(value ?? '').trim().replace(',', '.');
  requireThat(/^\d+(?:\.\d{1,2})?$/.test(raw), 'Informe o valor, por exemplo 12,50.');
  const [whole, decimal = ''] = raw.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  requireThat(Number.isSafeInteger(cents) && cents > 0 && cents <= 100_000_000, 'Informe um valor maior que zero, dentro do limite permitido.');
  return cents;
}
export function quantity(value, allowZero = false) {
  const n = Number(value);
  requireThat(String(value).trim() !== '' && Number.isInteger(n) && n >= (allowZero ? 0 : 1) && n <= 999, 'Use uma quantidade inteira entre ' + (allowZero ? '0' : '1') + ' e 999.');
  return n;
}
export function total(items) {
  const result = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  requireThat(Number.isSafeInteger(result) && result >= 0 && result <= 100_000_000, 'O total da comanda ultrapassa o limite permitido.');
  return result;
}
function open(order) { requireThat(order.status === 'aberta', 'Esta comanda já está paga e não pode ser alterada.'); }
export function addItem(order, item, amount, now = new Date().toISOString()) {
  open(order);
  const qty = quantity(amount);
  requireThat(Number.isSafeInteger(item.priceCents) && item.priceCents > 0, 'Este item está sem preço definido.');
  const price = item.condition === 'usado' ? 1000 : item.priceCents;
  const items = structuredClone(order.items);
  const existing = items.find(row => row.catalogId === item.id && row.unitPriceCents === price && row.condition === (item.condition || ''));
  if (existing) existing.quantity = quantity(existing.quantity + qty);
  else items.push({ id: crypto.randomUUID(), catalogId: item.id, name: item.name, code: item.code || item.isbn || '', kind: item.kind, category: item.category || 'livros', condition: item.condition || '', quantity: qty, unitPriceCents: price, occurredAt: now });
  requireThat(items.length <= 500, 'Esta comanda já contém o limite de itens.');
  return { ...order, items, totalCents: total(items), updatedAt: now };
}
export function changeQuantity(order, itemId, amount, now = new Date().toISOString()) {
  open(order); const qty = quantity(amount, true);
  requireThat(order.items.some(item => item.id === itemId), 'Item não encontrado.');
  const items = order.items.flatMap(item => item.id === itemId ? (qty ? [{ ...item, quantity: qty }] : []) : [item]);
  return { ...order, items, totalCents: total(items), updatedAt: now };
}
export function payOrder(order, method, now = new Date().toISOString()) {
  open(order); requireThat(payments[method], 'Selecione uma forma de pagamento.');
  requireThat(order.items.length > 0 && order.totalCents > 0, 'Adicione itens antes de receber o pagamento.');
  return { ...order, status: 'paga', payment: method, paidAt: now, updatedAt: now, simulation: true };
}
export function validateOrder(order) {
  requireThat(order && /^[a-f\d-]{36}$/.test(order.id) && /^[a-f\d-]{36}$/.test(order.deviceId), 'Identificação da comanda inválida.');
  requireThat(/^\d{1,12}$/.test(order.number) && typeof order.name === 'string' && order.name.length <= 80, 'Número ou nome inválido.');
  requireThat(Number.isInteger(order.version) && order.version >= 0 && ['aberta', 'paga'].includes(order.status), 'Versão ou situação inválida.');
  requireThat(Array.isArray(order.items) && order.items.length <= 500, 'Lista de itens inválida.');
  for (const item of order.items) {
    quantity(item.quantity);
    requireThat(typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 180, 'Nome de item inválido.');
    requireThat(Number.isSafeInteger(item.unitPriceCents) && item.unitPriceCents > 0 && item.unitPriceCents <= 100_000_000, 'Preço de item inválido.');
    requireThat(item.condition !== 'usado' || item.unitPriceCents === 1000, 'Livro usado deve custar R$ 10,00.');
  }
  requireThat(total(order.items) === order.totalCents, 'O total não corresponde aos itens da comanda.');
  requireThat(!Number.isNaN(Date.parse(order.createdAt)) && !Number.isNaN(Date.parse(order.updatedAt)), 'Datas inválidas.');
  if (order.status === 'paga') requireThat(payments[order.payment] && order.items.length > 0 && order.simulation === true && !Number.isNaN(Date.parse(order.paidAt)), 'Recebimento simulado inválido.');
  return order;
}
