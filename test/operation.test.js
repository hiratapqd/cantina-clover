import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStorage } from '../public/storage.js';
import { addItem, changeQuantity, payOrder, parseMoney } from '../public/domain.js';
import { createSync } from '../public/sync.js';
import { createServer, applyEvents, getServerConfig } from '../server.js';

const book = { id:'b:9786589699446:novo', kind:'books', name:'Livro de exemplo', isbn:'9786589699446', condition:'novo', priceCents:3000 };
const setup = () => openStorage(`test-${crypto.randomUUID()}`);
test('Render binds publicly, uses its PORT and requires a configured persistent directory for sync',()=>{
  const local=getServerConfig({});assert.equal(local.port,3001);assert.equal(local.host,'0.0.0.0');assert.equal(local.syncEnabled,true);
  assert.equal(getServerConfig({HOST:'127.0.0.1'}).host,'127.0.0.1');
  const render=getServerConfig({RENDER:'true',PORT:'12345'});
  assert.equal(render.port,12345);assert.equal(render.host,'0.0.0.0');assert.equal(render.syncEnabled,false);assert.equal(render.adminUrl,null);
  const disk=getServerConfig({NODE_ENV:'production',DEMO_DATA_DIR:'.data',ADMIN_URL:'https://admin.example.com'});
  assert.equal(disk.syncEnabled,true);assert.equal(disk.adminUrl,'https://admin.example.com/');
  assert.equal(getServerConfig({NODE_ENV:'production',PORT:'3000'}).port,3000);
  for(const port of ['3000','abc','-1','65536','1.5'])assert.throws(()=>getServerConfig({PORT:port}));
  assert.throws(()=>getServerConfig({ADMIN_URL:'javascript:alert(1)'}));
});
test('cloud without persistent disk preserves the local outbox and exposes only public configuration',async()=>{
  const server=createServer({syncEnabled:false,adminUrl:null});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,db=await setup();
  try {
    await db.create();
    const config=await(await fetch(base+'/api/config')).json();assert.deepEqual(config,{adminUrl:null,syncEnabled:false});
    assert.equal((await fetch(base+'/health')).status,200);
    const sync=createSync(db,()=>{},(url,options)=>fetch(base+url,options),()=>true);
    await sync.run();assert.equal((await db.pending()).length,1);assert.equal((await sync.state()).status,'pending');
    assert.match((await sync.state()).error,/disco persistente/);
  }finally{db.close();await new Promise(resolve=>server.close(resolve));}
});
test('money uses integer cents and rejects ambiguous or invalid input',()=>{
  assert.equal(parseMoney('12,50'),1250);assert.equal(parseMoney('0.10'),10);
  for(const input of ['0','-10','1.234','abc',''])assert.throws(()=>parseMoney(input));
});
test('same ISBN may be new and used, used costs R$10; correction recalculates and paid order cannot change',async()=>{
  const db=await setup();let order=await db.create();
  order=await db.update(order.id,order.version,x=>addItem(x,book,2));
  order=await db.update(order.id,order.version,x=>addItem(x,{...book,id:'b:9786589699446:usado',condition:'usado',priceCents:5000},1));
  assert.equal(order.items.length,2);assert.equal(order.totalCents,7000);assert.equal(order.items[1].unitPriceCents,1000);
  order=await db.update(order.id,order.version,x=>changeQuantity(x,x.items[0].id,0));assert.equal(order.totalCents,1000);
  order=await db.update(order.id,order.version,x=>payOrder(x,'pix'));
  await assert.rejects(db.update(order.id,order.version,x=>addItem(x,book,1)));
  assert.equal((await db.get(order.id)).status,'paga');db.close();
});
test('atomic numbering, reload persistence, stale changes rejected and failed writes roll back',async()=>{
  const name=`test-${crypto.randomUUID()}`,a=await openStorage(name),b=await openStorage(name);
  const [first,second]=await Promise.all([a.create('Voluntário'),b.create()]);
  assert.deepEqual([first.number,second.number].sort(),['0001','0002']);
  const revised=await a.update(first.id,0,x=>addItem(x,book,1));
  await assert.rejects(b.update(first.id,0,x=>addItem(x,book,2)));
  const count=(await a.pending()).length;
  await assert.rejects(a.update(first.id,revised.version,x=>addItem(x,book,0)));
  assert.equal((await a.pending()).length,count);a.close();b.close();
  const restored=await openStorage(name);assert.equal((await restored.get(first.id)).totalCents,3000);
  assert.equal((await restored.pending()).length,3);restored.close();
});
test('retry is idempotent, version conflict rolls back the complete batch',async()=>{
  const db=await setup();const order=await db.create();await db.update(order.id,0,x=>addItem(x,book,1));
  const events=await db.pending(),empty={orders:{},accepted:{}};
  const first=await applyEvents(empty,events);const retry=await applyEvents(first,events);
  assert.deepEqual(retry,first);assert.equal(Object.keys(retry.orders).length,1);
  const invalid=structuredClone(events);invalid[1].baseVersion=55;
  await assert.rejects(applyEvents(empty,invalid));assert.deepEqual(empty,{orders:{},accepted:{}});db.close();
});
test('offline queues changes and lost response is retried without duplicate server orders',async()=>{
  const db=await setup();const order=await db.create('Teste');await db.update(order.id,0,x=>addItem(x,book,1));
  await db.setMeta('offlineSimulation',true);let central={orders:{},accepted:{}},calls=0;
  const sync=createSync(db,()=>{},async(url,options)=>{
    calls++;const events=JSON.parse(options.body).events;central=await applyEvents(central,events);
    if(calls===1)throw Error('Response lost');
    return {ok:true,json:async()=>({accepted:events.map(x=>x.id),savedAt:new Date().toISOString()})};
  });
  await sync.run();assert.equal(calls,0);assert.equal((await db.pending()).length,2);
  await db.setMeta('offlineSimulation',false);await sync.run();assert.equal((await db.pending()).length,2);
  await sync.run();assert.equal((await db.pending()).length,0);assert.equal(Object.keys(central.orders).length,1);db.close();
});
test('server serves complete shell, persists sync and refuses cross-origin changes',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'casinha-operation-test-')),file=path.join(dir,'central.json');
  const server=createServer({file});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const asset of ['/','/app.js','/styles.css','/theme.css','/domain.js','/storage.js','/sync.js','/sw.js','/catalog.json','/images/logo.png','/manifest.webmanifest'])assert.equal((await fetch(base+asset)).status,200,asset);
    assert.equal((await fetch(base+'/.env')).status,404);
    const db=await setup();const order=await db.create();const events=await db.pending();
    const response=await fetch(base+'/api/demo/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({events})});
    assert.equal(response.status,200);assert.equal((await response.json()).accepted.length,1);
    assert.equal(JSON.parse(await readFile(file,'utf8')).orders[order.id].number,'0001');
    assert.equal((await fetch(base+'/api/demo/sync',{method:'POST',headers:{origin:'https://other.invalid','content-type':'application/json'},body:'{}'})).status,403);db.close();
  }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
