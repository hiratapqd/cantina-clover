import { money, normalize, addItem, changeQuantity, payOrder, payments, parseMoney, quantity } from './domain.js';
import { openStorage } from './storage.js';
import { createSync } from './sync.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const button = (label, action, value = '', secondary = false) => `<button class="action ${secondary ? 'secondary' : ''}" data-action="${action}" data-value="${esc(value)}">${label}</button>`;
const heading = (title, subtitle = '') => `<h2 tabindex="-1">${title}</h2>${subtitle ? `<p class="hint">${subtitle}</p>` : ''}`;
let db, sync, catalog = [], order, screen = 'home', selection, condition, group, method, busy = false;
let listMode = 'aberta';
function message(text) { $('message').textContent = text; $('message').hidden = !text; }
async function save(reducer) { order = await db.update(order.id, order.version, reducer); void sync.run(); }
function go(next) { screen = next; message(''); render(); $('screen').scrollTop = 0; $('screen').querySelector('h2')?.focus(); }
function rows(items, action = 'select') {
  return items.length ? items.map(item => `<button class="product-row" data-action="${action}" data-value="${esc(item.id)}"><span><strong>${esc(item.name)}</strong><small>${item.kind === 'books' ? `${item.condition === 'usado' ? 'Usado · doado' : 'Novo'} · ISBN ${esc(item.isbn)}` : `Código ${esc(item.code || 'livre')}`}</small></span><b>${money(item.priceCents)}</b></button>`).join('') : '<p class="empty">Nenhum item encontrado.</p>';
}
function available() {
  if (group === 'livros') return catalog.filter(x => x.kind === 'books' && x.condition === condition);
  if (group === 'bebidas') return catalog.filter(x => ['bebidas','cafes'].includes(x.category));
  if (group === 'alimentos') return catalog.filter(x => ['salgados','doces','lanches'].includes(x.category));
  return catalog.filter(x => x.kind !== 'books' && !['bebidas','cafes','salgados','doces','lanches'].includes(x.category));
}
function render() {
  const active = order && !['home','new','orders'].includes(screen);
  $('order-header').hidden = !active; $('order-total').hidden = !active;
  $('order-header').innerHTML = active ? `<span>COMANDA <strong>#${esc(order.number)}</strong></span><small>${esc(order.name || 'Somente número')} · ${order.status === 'paga' ? 'Paga (simulação)' : 'Aberta'}</small>` : '';
  $('order-total').innerHTML = active ? `<span>Total da comanda</span><strong>${money(order.totalCents)}</strong>` : '';
  let html = '';
  if (screen === 'home') html = `<div class="welcome-symbol">${icon('cup')}</div><p class="eyebrow">BEM-VINDO À CASINHA</p>${heading('Vamos atender?', 'Escolha uma opção para começar.')}${button(icon('plus')+'Nova comanda','new')}${button(icon('receipt')+'Comandas abertas','orders','aberta',true)}${button('Pagamentos simulados','orders','paga',true)}<p class="bottom-note">Sem login · demonstração para os voluntários</p>`;
  if (screen === 'new') html = `${heading('Nova comanda','O número será gerado ao abrir. O nome é opcional.')}<form id="new-form"><label for="customer-name">Nome (opcional)</label><input id="customer-name" name="name" maxlength="80" autocomplete="off" placeholder="Pode deixar em branco"><p class="hint">Para assistidos, use somente o número. Para voluntários, o nome ajuda a encontrar.</p><button class="action" type="submit">Abrir comanda ${icon('arrow')}</button></form>${button('Voltar','home','',true)}`;
  if (screen === 'categories') html = `${heading('O que vamos adicionar?')}<div class="category-grid">${[['food','Salgados, lanches e doces','alimentos'],['cup','Bebidas','bebidas'],['book','Livros','livros'],['box','Diversos','diversos']].map(([i,label,value])=>button(icon(i)+label,'group',value,true)).join('')}</div>${button(icon('drop')+'Água para fluidificar','water','',true)}${button('Conferir comanda','review')}${button('Deixar aberta e sair','leave','',true)}`;
  if (screen === 'condition') html = `${heading('Livros','Escolha a condição do exemplar.')}${button('Livros novos','condition','novo')}${button('Livros usados · R$ 10,00','condition','usado',true)}${button('Voltar','categories','',true)}`;
  if (screen === 'products') html = `${heading(group === 'livros' ? `Livros ${condition === 'novo' ? 'novos' : 'usados'}` : ({alimentos:'Salgados, lanches e doces',bebidas:'Bebidas',diversos:'Diversos'})[group])}<label class="search-label" for="product-search">${group === 'livros' ? 'Buscar por título ou ISBN' : 'Buscar produto'}</label><input type="search" id="product-search" placeholder="Digite para encontrar" autocomplete="off"><div id="product-results">${rows(available())}</div>${group === 'diversos' ? `<p class="section-label">VALOR INFORMADO NO ATENDIMENTO</p>${button('Bazar','free','bazar',true)}${button('Mensalidade / doação','free','doacao',true)}${button('Rifa','free','rifa',true)}` : ''}${button('Voltar','categories','',true)}`;
  if (screen === 'add') html = `${heading(esc(selection.name),selection.isbn ? `ISBN ${esc(selection.isbn)} · ${selection.condition}` : selection.free ? 'Informe o valor combinado no atendimento.' : `${selection.fluidifying ? 'Água para fluidificar · ' : ''}Unidade: ${money(selection.priceCents)}`)}<form id="add-form">${selection.free ? '<label for="unit-price">Valor unitário (R$)</label><input id="unit-price" name="price" inputmode="decimal" placeholder="0,00" required>' : ''}<label for="quantity">Quantidade</label><div class="quantity-control"><button type="button" data-action="step" data-value="-1" aria-label="Diminuir quantidade">−</button><input id="quantity" name="quantity" type="number" min="1" max="999" value="1" required><button type="button" data-action="step" data-value="1" aria-label="Aumentar quantidade">+</button></div><p class="subtotal">Subtotal <strong id="subtotal">${selection.free ? 'Informe o valor' : money(selection.priceCents)}</strong></p>${selection.fluidifying ? '<button class="action" type="submit" name="destination" value="review">Fechar comanda</button>' : '<button class="action" type="submit" name="destination" value="categories">Adicionar e continuar</button><button class="action secondary" type="submit" name="destination" value="review">Adicionar e conferir</button>'}</form>${button('Voltar sem adicionar',selection.fluidifying ? 'categories' : 'products','',true)}`;
  if (screen === 'review') html = `${heading('Confira a comanda',order.status === 'paga' ? 'Consulta de pagamento simulado.' : 'Confira os itens antes de receber.')}<div class="review-items">${order.items.length ? order.items.map(item=>`<article class="review-row"><div><strong>${esc(item.name)}</strong><small>${item.condition ? esc(item.condition)+' · ' : ''}${item.quantity} × ${money(item.unitPriceCents)}</small></div><b>${money(item.quantity*item.unitPriceCents)}</b>${order.status === 'aberta' ? `<button class="edit-button" data-action="edit" data-value="${item.id}">Corrigir</button>` : ''}</article>`).join('') : '<p class="empty">Esta comanda ainda não tem itens.</p>'}</div>${order.status === 'aberta' ? `${order.items.length ? button('Receber pagamento','payment') : ''}${button('Adicionar produtos','categories','',true)}${button('Deixar aberta e sair','leave','',true)}` : `${button('Voltar ao início','home')}`}`;
  if (screen === 'edit') { const item=order.items.find(x=>x.id===selection.id); html=`${heading('Corrigir quantidade',esc(item.name))}<form id="edit-form"><label for="edit-quantity">Quantidade (zero remove o item)</label><input id="edit-quantity" name="quantity" type="number" min="0" max="999" value="${item.quantity}" required><button type="submit" class="action">Salvar correção</button></form>${button('Voltar sem alterar','review','',true)}`; }
  if (screen === 'payment') html = `${heading('Como será o pagamento?','Esta demonstração não faz cobranças reais.')}${Object.entries(payments).map(([key,label])=>button(icon(key==='dinheiro'?'money':key==='pix'?'pix':'card')+label,'method',key,true)).join('')}${button('Voltar à conferência','review','',true)}`;
  if (screen === 'confirm') html = `${heading('Confirmar recebimento?')}<div class="payment-summary"><span>${esc(payments[method])}</span><strong>${money(order.totalCents)}</strong><small>PAGAMENTO SIMULADO</small></div><p class="hint">Confirme somente depois de conferir os itens e a forma de pagamento.</p>${button('Confirmar pagamento simulado','pay')}${button('Voltar e corrigir','payment','',true)}`;
  if (screen === 'success') html = `<div class="success-symbol">${icon('check')}</div>${heading('Comanda finalizada!','Pagamento simulado salvo neste navegador.')}<div class="payment-summary"><span>${esc(payments[order.payment])}</span><strong>${money(order.totalCents)}</strong></div>${button('Novo atendimento','home')}`;
  if (screen === 'orders') html = `${heading(listMode === 'aberta' ? 'Comandas abertas' : 'Pagamentos simulados')}<label for="order-search">Buscar por número ou nome</label><input type="search" id="order-search" placeholder="Número ou nome"><div id="order-results">Carregando…</div>${button('Voltar ao início','home','',true)}`;
  $('screen').innerHTML = html;
  if (screen === 'orders') void renderOrders('');
  if (order && active) history.replaceState(null,'',`/#/comanda/${order.id}`); else history.replaceState(null,'','/');
}
async function renderOrders(query) {
  const items=(await db.all()).filter(x=>x.status===listMode && normalize(`${x.number} ${x.name}`).includes(normalize(query))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  if(screen !== 'orders' || !$('order-results')) return;
  $('order-results').innerHTML=items.length ? items.map(x=>`<button class="product-row" data-action="resume" data-value="${x.id}"><span><strong>#${esc(x.number)} ${esc(x.name)}</strong><small>${x.items.reduce((s,i)=>s+i.quantity,0)} itens · ${listMode==='aberta'?'Aberta':'Paga (simulação)'}</small></span><b>${money(x.totalCents)}</b></button>`).join('') : '<p class="empty">Nenhuma comanda encontrada.</p>';
}
async function action(name,value) {
  if (['home','new','categories','review','payment','products'].includes(name)) { if(name==='home') order=null; go(name); return; }
  if(name==='water') {
    const water=catalog.find(item=>item.kind==='products' && item.code==='100194' && item.active!==false);
    if(!water)throw new Error('Água grande 1,5 L não está disponível no catálogo.');
    selection={...water,fluidifying:true};go('add');return;
  }
  if(name==='leave') { order=null; go('home'); return; }
  if(name==='orders') { listMode=value; go('orders'); }
  if(name==='resume') { order=await db.get(value); go(order.status==='aberta'?'categories':'review'); }
  if(name==='group') { group=value; go(group==='livros'?'condition':'products'); }
  if(name==='condition') { condition=value; go('products'); }
  if(name==='select') { selection=catalog.find(x=>x.id===value); go('add'); }
  if(name==='free') { selection={id:`free:${value}`,kind:'products',name:({bazar:'Bazar',doacao:'Mensalidade / doação',rifa:'Rifa'})[value],free:true,category:'diversos'}; go('add'); }
  if(name==='step') { $('quantity').value=Math.max(1,Math.min(999,Number($('quantity').value)+Number(value))); subtotal(); }
  if(name==='edit') { selection=order.items.find(x=>x.id===value); go('edit'); }
  if(name==='method') { method=value; go('confirm'); }
  if(name==='pay') { await save(x=>payOrder(x,method)); go('success'); }
}
function subtotal() { if(screen!=='add')return; try { $('subtotal').textContent=money(quantity($('quantity').value)*(selection.free?parseMoney($('unit-price').value):selection.priceCents)); } catch { $('subtotal').textContent='Confira o valor e a quantidade'; } }
async function guarded(task) { if(busy)return; busy=true; document.body.classList.add('busy'); try {message('');await task();}catch(e){message(e.message || 'Não foi possível salvar. Tente novamente.');}finally{busy=false;document.body.classList.remove('busy');} }
$('screen').addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(target) void guarded(()=>action(target.dataset.action,target.dataset.value));});
$('screen').addEventListener('input',event=>{if(event.target.id==='product-search')$('product-results').innerHTML=rows(available().filter(x=>normalize(`${x.name} ${x.isbn||x.code}`).includes(normalize(event.target.value))));if(event.target.id==='order-search')void renderOrders(event.target.value);subtotal();});
$('screen').addEventListener('submit',event=>{event.preventDefault();const id=event.target.id;const data=new FormData(event.target);const destination=event.submitter?.value||'categories';void guarded(async()=>{if(id==='new-form'){order=await db.create(data.get('name'));void sync.run();go('categories');}if(id==='add-form'){const item={...selection,priceCents:selection.free?parseMoney(data.get('price')):selection.priceCents};await save(x=>addItem(x,item,data.get('quantity')));go(destination);}if(id==='edit-form'){await save(x=>changeQuantity(x,selection.id,data.get('quantity')));go('review');}});});
$('home-button').addEventListener('click',()=>guarded(()=>action('home')));
$('font-button').addEventListener('click',async()=>{const large=document.documentElement.classList.toggle('large-type');$('font-button').setAttribute('aria-pressed',String(large));$('font-button').setAttribute('aria-label',large?'Usar tamanho padrão das letras':'Aumentar letras');await db?.setMeta('largeType',large);});
function syncStatus(state) { const label=state.status==='offline'?'Sem conexão · salvo neste navegador':state.status==='syncing'?'Sincronizando demonstração…':state.pending?`${state.pending} registros aguardando envio`:'Salvo neste navegador';$('device-status').textContent=label;$('sync-info').textContent=`${label}. ${state.lastSync?'Último envio de demonstração: '+new Date(state.lastSync).toLocaleTimeString('pt-BR')+'. ':''}${state.error||''}`; }
$('sync-button').addEventListener('click',()=>sync?.run());
$('offline-toggle').addEventListener('change',()=>guarded(async()=>{await db.setMeta('offlineSimulation',$('offline-toggle').checked);await sync.run();}));
$('export-button').addEventListener('click',event=>{event.preventDefault();void guarded(async()=>{const blob=new Blob([JSON.stringify({simulation:true,exportedAt:new Date().toISOString(),orders:await db.all(),pending:await db.pending()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`casinha-comandas-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});});
async function boot() {
  const adminLink=document.querySelector('.admin-link');
  if(!['localhost','127.0.0.1','[::1]'].includes(location.hostname))adminLink.hidden=true;
  // Runtime configuration stays outside the offline shell cache.
  void fetch('/api/config',{signal:AbortSignal.timeout(10000)}).then(response=>response.ok?response.json():null).then(config=>{if(!config)return;adminLink.hidden=!config.adminUrl;if(config.adminUrl)adminLink.href=config.adminUrl;}).catch(()=>{});
  db=await openStorage();
  try { const response=await fetch('/catalog.json');if(!response.ok)throw Error();catalog=(await response.json()).items;await db.setMeta('catalog',catalog); } catch {catalog=await db.getMeta('catalog');if(!catalog)throw new Error('Abra a demonstração com conexão uma primeira vez para carregar o catálogo.');}
  if(await db.getMeta('largeType')){document.documentElement.classList.add('large-type');$('font-button').setAttribute('aria-pressed','true');}
  $('offline-toggle').checked=!!await db.getMeta('offlineSimulation');sync=createSync(db,syncStatus);
  const id=location.hash.match(/^#\/comanda\/([a-f\d-]{36})$/)?.[1];if(id)order=await db.get(id);
  go(order?'review':'home');void sync.run();
  if(!window.isSecureContext){const note=document.createElement('p');note.className='support-footnote';note.textContent='Acesso HTTP pela rede: as comandas são salvas neste navegador. Para reabrir a interface sem conexão, use um endereço HTTPS, como o da demonstração no Render.';document.querySelector('.support').append(note);}
  window.addEventListener('online',()=>sync.run());window.addEventListener('offline',()=>sync.run());
  setInterval(()=>sync.run(),30000);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>message('O modo offline de reabertura não pôde ser preparado. As comandas continuam salvas neste navegador.'));
}
boot().catch(error=>{$('screen').innerHTML=heading('Não foi possível preparar o atendimento');message(`${error.message} Verifique se o navegador permite armazenamento local.`);});
