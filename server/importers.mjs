import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {now,json,parse,num,text,normalizeUsage} from './lib.mjs';
export function providerOf(model='',transport=''){
 const s=(model+' '+transport).toLowerCase();if(s.includes('agentdock')||s.includes('codex'))return'codex';if(s.includes('deepseek'))return'deepseek';if(s.includes('jev')||s.includes('typesafe'))return'jev';if(s.includes('gemini'))return'gemini';if(s.includes('mimo'))return'mimo';if(s.includes('gpt')||s.includes('openai'))return'openai';return'other';
}
const terminal=s=>['completed','complete','failed','error','cancelled','interrupted','timeout'].includes(s);
const status=s=>s==='interrupted'?'failed':s;
function accountFor(provider,cfg){return cfg.accounts?.[provider]||`${provider}-unassigned`}
export function tgnRecords(trace,cfg={}){
 const project=cfg.project||'tgn-live',traceId='tgn:'+trace.id,source=cfg.id||'tgn-history';
 let calls=Array.isArray(trace.modelCalls)?trace.modelCalls:[];
 if(!calls.length&&trace.provider)calls=Object.entries(trace.provider).filter(([,v])=>v&&typeof v==='object'&&(v.usage||v.model)).map(([role,v])=>({...v,role,status:trace.status,startedAt:trace.startedAt,elapsedMs:v.elapsedMs,legacy:true}));
 return calls.filter(c=>c.model&&c.status!=='running').map((c,i)=>{const provider=providerOf(c.model,c.audit?.transport||c.transport);const u=normalizeUsage(c.usage);return{id:`${traceId}:call:${i}`,trace_id:traceId,project,environment:cfg.environment||'production',provider,account_id:accountFor(provider,cfg),feature:c.role||trace.kind||'inference',model:c.model,requested_model:c.requestedModel||c.model,started_at:c.startedAt||trace.startedAt,ended_at:c.endedAt||null,status:status(c.status||trace.status),duration_ms:num(c.elapsedMs),usage:u,cost_low:num(c.cost?.lowerUsd??c.cost?.paidEquivalentUsd),cost_high:num(c.cost?.upperUsd??c.cost?.paidEquivalentUsd),cost_source:c.cost?'source-project':'unknown',attempt:c.attempt||1,error_code:c.errorCode||null,source,scope:c.legacy?'operation':'operation',billing_mode:provider==='codex'?'subscription':'api'};});
}
function metricLeaf(m){return m&&typeof m==='object'&&(num(m.inputTokens)!==null||num(m.totalTokens)!==null||num(m.wallMs)!==null||m.requestId)}
export function onwardRecords(task,cfg={}){
 if(!terminal(task.status)||task.reusedResult||task.reused)return[];
 const project=cfg.project||'onward',source=cfg.id||'onward-history',traceId='onward:'+task.id,metrics=task.metrics||{},leaves=[];
 // Prefer named component metrics to their parent aggregate. Never add both.
 const componentKeys=['generationMetrics','languageMetrics','emphasisMetrics','assessmentMetrics'];
 const hasComponents=componentKeys.some(k=>metricLeaf(metrics[k]));
 if(hasComponents){for(const key of componentKeys){if(metricLeaf(metrics[key]))leaves.push({key,m:metrics[key]})}}
 else if(metricLeaf(metrics)&&metrics.model&&metrics.model!=='local-render')leaves.push({key:task.kind,m:metrics});
 // Jev scorer totals are separate from the language model's top-level tokens.
 const addJev=(m,prefix)=>{if(num(m?.jevInputTokens)!==null)leaves.push({key:prefix+'-jev-score',m:{model:m.jevModel||'jev-latest',inputTokens:m.jevInputTokens,outputTokens:m.jevOutputTokens,totalTokens:num(m.jevOutputTokens)!==null?m.jevInputTokens+m.jevOutputTokens:null,estimatedCostUsd:m.jevEstimatedCostUsd,wallMs:m.jevWallMs}})};
 if(hasComponents){for(const{key,m}of[...leaves])addJev(m,key)}else addJev(metrics,task.kind);
 // If only stage metadata survived, retain stages as logical observations, not fabricated raw attempts.
 if(!leaves.length){for(const [i,s]of(metrics.pipelineStages||[]).entries())if(s.model&&s.provider!=='local'&&(num(s.inputTokens)!==null||num(s.outputTokens)!==null))leaves.push({key:s.stage+':'+i,m:{...s,wallMs:s.durationMs}})}
 return leaves.map(({key,m})=>{const provider=providerOf(m.model,m.transport);const u=normalizeUsage(m);const cost=num(m.estimatedCostUsd);return{id:`${traceId}:${key}`,trace_id:traceId,project,environment:cfg.environment||'production',provider,account_id:accountFor(provider,cfg),feature:task.kind+'/'+key,model:m.model||'unknown',requested_model:m.requestedModel||m.model,started_at:task.createdAt,ended_at:task.updatedAt,status:status(task.status),duration_ms:num(m.wallMs??m.agentMs),usage:u,cost_low:cost,cost_high:cost,cost_source:cost===null?'unknown':'source-project',request_id:m.requestId,attempt:m.attempt||1,fallback_from:m.explanationFallbackUsed?'deepseek':m.analysisFallbackUsed?'openai':null,error_code:task.failureCategory,source,scope:'operation',billing_mode:provider==='codex'?'subscription':'api'}});
}
export function createCollector(store,dataDir){
 let running=null;
 async function run(){if(running)return running;running=collect().finally(()=>running=null);return running}
 async function collect(){const file=path.join(dataDir,'collectors.json');if(!fs.existsSync(file))return{sources:[],inserted:0};const configs=parse(fs.readFileSync(file,'utf8'),[]);if(!Array.isArray(configs))throw new Error('Invalid collectors.json');let total=0;const sources=[];
  for(const cfg of configs){if(cfg.enabled===false)continue;let inserted=0,scanned=0,skipped=0;const last=store.one('SELECT records FROM connectors WHERE id=?',cfg.id)?.records||0;
   try{
    if(!fs.existsSync(cfg.path)){store.connector(cfg.id,cfg.name||cfg.id,cfg.kind,'waiting',last,null,{reason:'source_unavailable',project:cfg.project});sources.push({id:cfg.id,status:'waiting'});continue}
    if(cfg.kind==='tgn-sqlite'){
     const db=new DatabaseSync(cfg.path,{readOnly:true});try{db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=2000');// Completion order differs from creation order. Select unseen terminal IDs, not a creation-time watermark.
     const terminalRows=db.prepare("SELECT id,created_at FROM traces WHERE status IN ('completed','complete','failed','error','cancelled','timeout') ORDER BY created_at").all();
     const seen=new Set(store.all("SELECT key FROM settings WHERE key LIKE ?",'tgn-seen:'+cfg.id+':%').map(r=>r.key));
     const rows=terminalRows.filter(r=>!seen.has('tgn-seen:'+cfg.id+':'+r.id)).slice(0,10000);
     const readTrace=db.prepare('SELECT trace_json FROM traces WHERE id=?');
      for(const row of rows){const trace=parse(readTrace.get(row.id)?.trace_json);if(!trace){skipped++;continue}const events=tgnRecords(trace,cfg);if(events.length){const r=store.ingest(events);inserted+=r.inserted;store.run('INSERT OR REPLACE INTO traces VALUES(?,?,?,?,?,?,?)','tgn:'+trace.id,trace.kind||'story-turn',cfg.project||'tgn-live',trace.startedAt,num(trace.totalElapsedMs),status(trace.status),cfg.id)}scanned++;store.setSetting('tgn-seen:'+cfg.id+':'+row.id,true)}
     }finally{db.close()}
    }else if(cfg.kind==='onward-tasks'){
     for(const profile of fs.readdirSync(cfg.path,{withFileTypes:true})){if(!profile.isDirectory())continue;const dir=path.join(cfg.path,profile.name,'mobile','tasks');if(!fs.existsSync(dir))continue;
      for(const name of fs.readdirSync(dir)){if(!/^[a-f0-9-]{36}\.json$/.test(name))continue;const p=path.join(dir,name),mtime=fs.statSync(p).mtimeMs,mark='file:'+cfg.id+':'+name;if(store.setting(mark,0)===mtime)continue;const task=parse(fs.readFileSync(p,'utf8'));if(!task||!terminal(task.status))continue;const rows=onwardRecords(task,cfg);if(rows.length){inserted+=store.ingest(rows).inserted;store.run('INSERT OR REPLACE INTO traces VALUES(?,?,?,?,?,?,?)','onward:'+task.id,task.kind,cfg.project||'onward',task.createdAt,num(task.metrics?.wallMs),status(task.status),cfg.id)}scanned++;store.setSetting(mark,mtime)}
     }
    }else if(cfg.kind==='jsonl'){
     const raw=fs.readFileSync(cfg.path,'utf8').split(/\r?\n/);let cursor=store.setting('line:'+cfg.id,0);if(cursor>raw.length)cursor=0;for(let i=cursor;i<raw.length;i++){if(!raw[i].trim())continue;const v=parse(raw[i]);if(!v){skipped++;continue}inserted+=store.ingest([{...v,source:cfg.id}]).inserted;scanned++}store.setSetting('line:'+cfg.id,raw.length-1);
    }
    total+=inserted;store.connector(cfg.id,cfg.name||cfg.id,cfg.kind,'connected',last+inserted,null,{project:cfg.project,scanned,skipped,scope:cfg.kind==='jsonl'?'call':'operation',note:'Historical component aggregates; provider retries may be included inside a record.'});sources.push({id:cfg.id,status:'connected',inserted,scanned,skipped});
   }catch(e){store.connector(cfg.id,cfg.name||cfg.id,cfg.kind,'error',last,text(e.message,300),{project:cfg.project});sources.push({id:cfg.id,status:'error',detail:text(e.message,300)})}
  }
  return{sources,inserted:total};
 }
 return{run};
}
