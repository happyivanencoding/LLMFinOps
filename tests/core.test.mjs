import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {normalizeUsage,normalizeCall,priceCall,stats,localDay,range,now} from '../server/lib.mjs';
import {createStore} from '../server/db.mjs';
import {createApp} from '../server/index.mjs';
import {onwardRecords,tgnRecords,createCollector} from '../server/importers.mjs';
import {createTelemetry} from '../sdk/telemetry.mjs';
const fixture=(overrides={})=>({id:'call-1',project:'test-app',provider:'deepseek',account_id:'ds',model:'ds-model',status:'success',started_at:now(),usage:{prompt_tokens:1000,completion_tokens:100,prompt_cache_hit_tokens:600},...overrides});
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'llmfinops-test-'));
function withStore(fn){const dir=temporary(),s=createStore(dir);try{return fn(s)}finally{s.close();fs.rmSync(dir,{recursive:true,force:true})}}
test('OpenAI cached/reasoning tokens are subsets, never added to total',()=>{assert.deepEqual(normalizeUsage({prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:70},completion_tokens_details:{reasoning_tokens:8}}),{input_tokens:100,output_tokens:20,cached_tokens:70,reasoning_tokens:8,total_tokens:120})});
test('Gemini output includes thinking once; missing metadata is unknown',()=>{assert.equal(normalizeUsage({promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:8}).output_tokens,28);assert.equal(normalizeUsage({}).total_tokens,null);assert.equal(normalizeUsage(null).input_tokens,null)});
test('cache pricing uses reported hit/miss, with honest bounds when unknown',()=>{const p={id:'p',input_rate:1,cached_rate:.1,output_rate:2};const c=normalizeCall(fixture());assert.equal(priceCall(c,p).cost_high,.00066);const missing=priceCall({...c,cached_tokens:null},p);assert.equal(missing.cost_low,.0003);assert.equal(missing.cost_high,.0012)});
test('subscription cost and unpriced models remain unknown',()=>{const c=normalizeCall(fixture({billing_mode:'subscription',estimated_cost:2}));assert.equal(priceCall(c,{id:'p'}).cost_high,null);assert.equal(priceCall(normalizeCall(fixture()),null).cost_high,null)});
test('metadata normalization excludes prompts, body, API keys and arbitrary fields',()=>{const c=normalizeCall(fixture({prompt:'private text',api_key:'do-not-persist',response:{text:'private'}}));assert.ok(!JSON.stringify(c).includes('private'));assert.ok(!('api_key' in c));assert.throws(()=>normalizeCall(fixture({cost_low:3,cost_high:2})),/区间/)});
test('Paris midnight groups independently of UTC',()=>{assert.equal(localDay('2026-09-25T22:15:00Z'),'2026-09-26');assert.throws(()=>range({from:'2026-09-27',to:'2026-09-26'}))});
test('stable observation id makes reimport idempotent',()=>withStore(s=>{assert.equal(s.ingest([fixture()]).inserted,1);assert.equal(s.ingest([fixture()]).duplicates,1);assert.equal(s.one('SELECT COUNT(*) n FROM calls').n,1)}));
test('batch validation is atomic before insertion',()=>withStore(s=>{assert.throws(()=>s.ingest([fixture(),{id:'bad'}]));assert.equal(s.one('SELECT COUNT(*) n FROM calls').n,0)}));
test('price version selection and immutable source estimates',()=>withStore(s=>{s.savePrice({provider:'deepseek',model:'ds-model',input_rate:1,cached_rate:.1,output_rate:2,effective_from:'2026-01-01',source_url:'https://example.test/rates'});s.ingest([fixture({estimated_cost:.123})]);assert.equal(s.one('SELECT cost_high FROM calls').cost_high,.123);s.savePrice({provider:'deepseek',model:'ds-model',input_rate:2,cached_rate:.2,output_rate:4,effective_from:'2026-09-01',source_url:'https://example.test/rates'});s.ingest([fixture({id:'new'})]);assert.equal(s.one("SELECT cost_high FROM calls WHERE id='new'").cost_high,.00132)}));
test('budget alerts retain acknowledgement without duplicating alerts',()=>withStore(s=>{s.ingest([fixture({estimated_cost:9})]);s.saveBudget({id:'b',name:'Monthly',scope:'all',period:'monthly',amount:10,threshold:.8});s.evaluateAlerts();s.evaluateAlerts();assert.equal(s.one('SELECT COUNT(*) n FROM alerts').n,1);s.run("UPDATE alerts SET status='acknowledged'");s.evaluateAlerts();assert.equal(s.one('SELECT status FROM alerts').status,'acknowledged')}));
test('Onward named metrics do not double-count their parent aggregate',()=>{const rows=onwardRecords({id:'task',kind:'cv',status:'completed',createdAt:now(),updatedAt:now(),metrics:{model:'gpt-test',inputTokens:99999,generationMetrics:{model:'gpt-test',inputTokens:100,outputTokens:10},languageMetrics:{model:'gpt-test',inputTokens:50,outputTokens:5}}});assert.equal(rows.length,2);assert.equal(rows.reduce((n,r)=>n+r.usage.input_tokens,0),150);assert.ok(rows.every(r=>r.scope==='operation'));assert.equal(onwardRecords({id:'reuse',status:'completed',reusedResult:true}).length,0)});
test('TGN imported observations keep attempt, source estimates and no prose',()=>{const rows=tgnRecords({id:'a',startedAt:now(),status:'complete',prose:'private prose',modelCalls:[{role:'narrator',model:'deepseek-flash',status:'complete',attempt:2,usage:{prompt_tokens:100,completion_tokens:10},cost:{lowerUsd:.001,upperUsd:.002}}]});assert.equal(rows.length,1);assert.equal(rows[0].attempt,2);assert.equal(rows[0].cost_high,.002);assert.ok(!JSON.stringify(rows).includes('private prose'))});
test('cost totals disclose incomplete coverage',()=>{const result=stats([normalizeCall(fixture({estimated_cost:.1})),normalizeCall(fixture({id:'unknown',usage:{}}))]);assert.equal(result.cost_high,.1);assert.equal(result.known_cost,1);assert.equal(result.count,2)});
test('private API auth, English errors, credentials write-only, ingestion and CSV',async()=>{const dir=temporary(),sys=createApp({dataDir:dir,scheduler:false});const server=sys.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;const req=(p,opts={})=>fetch(base+p,{...opts,headers:{'Content-Type':'application/json','Accept-Language':'en',...opts.headers}});try{let r=await req('/api/overview');assert.equal(r.status,401);assert.equal((await r.json()).error,'Please sign in.');const password=fs.readFileSync(path.join(dir,'initial-login.txt'),'utf8').match(/初始密码: (.+)/)[1];r=await req('/api/login',{method:'POST',body:JSON.stringify({username:'admin',password})});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];const auth={Cookie:cookie};r=await req('/api/accounts',{method:'POST',headers:auth,body:JSON.stringify({id:'ds',name:'DS',provider:'deepseek',api_key:'never-return-this-secret'})});assert.equal(r.status,200);r=await req('/api/accounts',{headers:auth});assert.ok(!(await r.text()).includes('never-return-this-secret'));r=await req('/api/v1/calls',{method:'POST',headers:{Authorization:'Bearer '+sys.secrets.token()},body:JSON.stringify(fixture())});assert.equal(r.status,202);r=await req('/api/calls/export',{headers:auth});assert.equal(r.status,200);assert.match(await r.text(),/ds-model/);r=await req('/api/budgets',{method:'POST',headers:{...auth,Origin:'https://evil.invalid'},body:'{}'});assert.equal(r.status,403);r=await req('/api/settings',{headers:{Authorization:'Bearer '+sys.secrets.token()}});assert.equal(r.status,401)}finally{server.closeAllConnections();await new Promise(r=>server.close(r));sys.close();fs.rmSync(dir,{recursive:true,force:true})}});
test('provider sync reads balance without inference, supports negative billing credits',async()=>{const dir=temporary();const fake=async url=>new Response(JSON.stringify(String(url).includes('/user/balance')?{is_available:true,balance_infos:[{currency:'USD',total_balance:'8.40',granted_balance:'1',topped_up_balance:'7.40'}]}:{data:[{start_time:Math.floor(Date.now()/1000),results:String(url).includes('/costs')?[{amount:{value:-.5,currency:'usd'},line_item:'credit',project_id:'p'}]:[]}],has_more:false}),{status:200});const sys=createApp({dataDir:dir,scheduler:false,fetchImpl:fake});try{sys.store.saveAccount({id:'ds',provider:'deepseek',name:'DS'});sys.secrets.setAccount('ds',{key:'synthetic'});assert.equal((await sys.sync.sync('ds')).status,'synced');assert.equal(sys.store.accounts()[0].balances[0].balance,8.4);sys.store.saveAccount({id:'oa',provider:'openai',name:'OA'});sys.secrets.setAccount('oa',{adminKey:'synthetic'});assert.equal((await sys.sync.sync('oa')).status,'synced');assert.equal(sys.store.one('SELECT amount FROM billing_daily').amount,-.5)}finally{sys.close();fs.rmSync(dir,{recursive:true,force:true})}});
test('telemetry persists when offline and extractor errors never alter model results',async()=>{const dir=temporary();const tel=createTelemetry({url:'http://127.0.0.1:1',token:'synthetic',project:'test',spoolDir:dir});try{const result=await tel.track({provider:'openai',model:'test',prompt:'secret',extractUsage:()=>{throw new Error('extract')}},async()=>({answer:'kept'}));assert.equal(result.answer,'kept');await tel.close();const files=fs.readdirSync(dir).filter(n=>n.endsWith('.json'));assert.equal(files.length,1);const record=JSON.parse(fs.readFileSync(path.join(dir,files[0]),'utf8'));assert.equal(record.status,'success');assert.ok(!('prompt'in record))}finally{fs.rmSync(dir,{recursive:true,force:true})}});


test('input-only Jev pricing does not invent output usage',()=>{
 const c=normalizeCall(fixture({provider:'jev',usage:{input_tokens:1000}}));
 const v=priceCall(c,{id:'jev-price',input_rate:.042,cached_rate:.042,output_rate:0});
 assert.equal(v.cost_high,.000042);assert.equal(v.output_tokens,null);
});
test('non-global budgets require a target and invalid calendar days are rejected',()=>withStore(s=>{
 assert.throws(()=>s.saveBudget({name:'No target',scope:'project',scope_id:'',amount:10}),/对象/);
 assert.throws(()=>range({from:'2026-02-30',to:'2026-03-10'}));
}));
test('late finishing TGN trace is collected after a newer trace, exactly once',async()=>{
 const dir=temporary(),sourcePath=path.join(dir,'source.sqlite'),db=new DatabaseSync(sourcePath),store=createStore(path.join(dir,'monitor'));
 db.exec('CREATE TABLE traces (id TEXT PRIMARY KEY,status TEXT,trace_json TEXT,created_at TEXT)');
 const write=(id,state,at)=>{const trace={id,status:state,startedAt:at,modelCalls:[{role:'narrator',model:'deepseek-flash',status:'complete',elapsedMs:900,usage:{input_tokens:20,output_tokens:5}}]};db.prepare('INSERT OR REPLACE INTO traces VALUES (?,?,?,?)').run(id,state,JSON.stringify(trace),at)};
 write('slow','running','2026-09-26T10:00:00Z');write('fast','completed','2026-09-26T11:00:00Z');
 fs.writeFileSync(path.join(store.dir,'collectors.json'),JSON.stringify([{id:'tgn-test',kind:'tgn-sqlite',path:sourcePath,project:'tgn'}]));
 try{const collector=createCollector(store,store.dir);assert.equal((await collector.run()).inserted,1);write('slow','completed','2026-09-26T10:00:00Z');assert.equal((await collector.run()).inserted,1);assert.equal((await collector.run()).inserted,0);assert.equal(store.one('SELECT COUNT(*) n FROM calls').n,2)}finally{db.close();store.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('SDK record generates a persisted id and excludes prompt content from its spool',async()=>{
 const dir=temporary(),telemetry=createTelemetry({url:'http://127.0.0.1:1',token:'synthetic',project:'test',spoolDir:dir});
 try{await telemetry.record({provider:'jev',model:'jev-latest',prompt:'private-body',usage:{input_tokens:50,unexpected:'private-body'}});const names=fs.readdirSync(dir).filter(n=>n.endsWith('.json'));assert.equal(names.length,1);const raw=fs.readFileSync(path.join(dir,names[0]),'utf8'),v=JSON.parse(raw);assert.ok(v.id);assert.equal(v.trace_id,v.id);assert.ok(!raw.includes('private-body'));assert.equal(v.usage.input_tokens,50)}finally{await telemetry.close();fs.rmSync(dir,{recursive:true,force:true})}
});


test('account deletion removes connection state and credentials but preserves request ledger',()=>{
 const dir=temporary(),sys=createApp({dataDir:dir,scheduler:false});try{
  sys.store.saveAccount({id:'delete-me',name:'Delete me',provider:'mimo',billing_mode:'prepaid'});sys.secrets.setAccount('delete-me',{key:'synthetic-secret'});
  sys.store.snapshot({account_id:'delete-me',currency:'USD',balance:3,source:'manual'});sys.store.ingest([fixture({id:'kept-call',account_id:'delete-me',provider:'mimo'})]);
  sys.store.run('INSERT INTO billing_daily VALUES (?,?,?,?,?,?,?,?,?)','bill','delete-me','2026-09-26','','usage','USD',1,'statement-import',now());
  const result=sys.store.deleteAccount('delete-me');sys.secrets.removeAccount('delete-me');
  assert.equal(result.preserved_calls,1);assert.equal(sys.store.accounts().length,0);assert.equal(sys.store.one('SELECT COUNT(*) n FROM calls WHERE account_id=?','delete-me').n,1);assert.equal(sys.store.one('SELECT COUNT(*) n FROM snapshots WHERE account_id=?','delete-me').n,0);assert.equal(sys.store.one('SELECT COUNT(*) n FROM billing_daily WHERE account_id=?','delete-me').n,0);assert.equal(sys.store.one('SELECT sync_status FROM accounts WHERE id=?','delete-me').sync_status,'deleted');assert.equal(sys.secrets.resolve('delete-me'),'');
 }finally{sys.close();fs.rmSync(dir,{recursive:true,force:true})}
});

test('positive CNY with zero USD does not trigger a false empty-account runway alert',()=>withStore(s=>{
 s.saveAccount({id:'ds',name:'DeepSeek',provider:'deepseek',currency:'USD',billing_mode:'prepaid'});
 s.ingest([fixture({id:'cost',account_id:'ds',provider:'deepseek',started_at:new Date().toISOString(),estimated_cost:7})]);
 s.snapshot({account_id:'ds',currency:'USD',balance:0,source:'provider-api'});
 s.snapshot({account_id:'ds',currency:'CNY',balance:100,source:'provider-api'});
 s.alert('runway:ds:old','runway','Old incorrect alert','old');
 const account=s.accounts()[0];assert.equal(account.runway_days_estimate,null);assert.equal(account.runway_unavailable_reason,'currency-mismatch');
 assert.equal(s.evaluateAlerts().filter(a=>a.type==='runway').length,0);
 assert.equal(s.one('SELECT status FROM alerts WHERE id=?','runway:ds:old').status,'resolved');
}));
