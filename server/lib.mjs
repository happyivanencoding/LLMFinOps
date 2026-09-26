import {randomUUID} from 'node:crypto';
export const PROVIDERS=['openai','deepseek','gemini','mimo','jev','codex','other'];
export const ZONE='Europe/Paris';
export const now=()=>new Date().toISOString();
export const uid=(p='')=>p+randomUUID();
export const json=v=>JSON.stringify(v);
export const parse=(s,f=null)=>{try{return JSON.parse(s)}catch{return f}};
export function fail(message,status=400){throw Object.assign(new Error(message),{status})}
export function text(v,max=160){return typeof v==='string'?v.trim().slice(0,max):''}
export function num(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null}
export function required(v,name){let s=text(v);if(!s)fail(`${name}不能为空`);return s}
export function date(v){let d=new Date(v);if(!Number.isFinite(d.getTime()))fail('无效日期');return d.toISOString()}
export function localDay(v=Date.now()){return new Intl.DateTimeFormat('sv-SE',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v))}
export function addDay(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10)}
export function range(q={}){let end=text(q.to,10)||localDay(),start=text(q.from,10)||addDay(end,1-Math.min(366,Math.max(1,Number(q.days)||7)));if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||start>end||new Date(start).toISOString().slice(0,10)!==start||new Date(end).toISOString().slice(0,10)!==end)fail('日期范围无效');return{start,end}}
export function normalizeUsage(u){
 if(!u||typeof u!=='object')return{input_tokens:null,output_tokens:null,cached_tokens:null,reasoning_tokens:null,total_tokens:null};
 const input=num(u.input_tokens??u.prompt_tokens??u.promptTokenCount??u.inputTokens);
 let output=num(u.output_tokens??u.completion_tokens??u.outputTokens);
 if(output===null&&num(u.candidatesTokenCount)!==null)output=num(u.candidatesTokenCount)+(num(u.thoughtsTokenCount)||0);
 const cache=num(u.cached_tokens??u.cachedInputTokens??u.prompt_cache_hit_tokens??u.input_tokens_details?.cached_tokens??u.prompt_tokens_details?.cached_tokens??u.cachedContentTokenCount);
 const reasoning=num(u.reasoning_tokens??u.reasoningTokens??u.output_tokens_details?.reasoning_tokens??u.completion_tokens_details?.reasoning_tokens??u.thoughtsTokenCount);
 return{input_tokens:input,output_tokens:output,cached_tokens:cache===null?null:(input===null?cache:Math.min(cache,input)),reasoning_tokens:reasoning,total_tokens:num(u.total_tokens??u.totalTokens??u.totalTokenCount)??(input!==null&&output!==null?input+output:null)};
}
export function normalizeCall(v){
 if(!v||typeof v!=='object'||Array.isArray(v))fail('调用记录必须是对象');
 const project=required(v.project,'project'),provider=required(v.provider,'provider');if(!PROVIDERS.includes(provider))fail('不支持的 provider');
 const at=date(v.started_at||v.startedAt||now()),usage=normalizeUsage(v.usage||v);
 const statusMap={completed:'success',complete:'success',ok:'success',error:'failed',cancelled:'cancelled',timeout:'timeout'};
 const status=statusMap[v.status]||v.status||'success';if(!['success','failed','cancelled','timeout','running'].includes(status))fail('status 无效');
 const id=required(v.id||v.call_id,'稳定的 call id');
 const low=num(v.cost_low??v.estimated_cost??v.estimatedCostUsd),high=num(v.cost_high??v.estimated_cost??v.estimatedCostUsd);
 if(low!==null&&high!==null&&low>high)fail('模型成本区间无效');
 return{id,trace_id:text(v.trace_id||v.traceId,220)||id,project,environment:text(v.environment)||'production',provider,account_id:text(v.account_id)||`${provider}-unassigned`,feature:text(v.feature||v.role)||'inference',model:text(v.model)||'unknown',requested_model:text(v.requested_model)||text(v.model)||'unknown',started_at:at,ended_at:v.ended_at?date(v.ended_at):null,local_day:localDay(at),status,duration_ms:num(v.duration_ms??v.elapsedMs??v.wallMs),ttft_ms:num(v.ttft_ms??v.firstVisibleMs),...usage,cost_low:low,cost_high:high,actual_cost:num(v.actual_cost),currency:'USD',cost_source:text(v.cost_source)|| (low!==null?'source-project':'unknown'),pricing_id:text(v.pricing_id)||null,attempt:Math.max(1,Math.trunc(num(v.attempt)||1)),retry_of:text(v.retry_of,220)||null,fallback_from:text(v.fallback_from)||null,error_code:text(v.error_code||v.errorCode,120)||null,request_id:text(v.request_id||v.requestId,220)||null,source:text(v.source)||'sdk',scope:['call','operation','aggregate'].includes(v.scope)?v.scope:'call',billing_mode:text(v.billing_mode)||'api',ingested_at:now()};
}
export function priceCall(c,p){
 if(c.billing_mode==='subscription'||c.provider==='codex')return{...c,cost_low:null,cost_high:null,cost_source:'subscription'};
 if(c.cost_low!==null||c.cost_high!==null||!p||c.input_tokens===null||(c.output_tokens===null&&p.output_rate!==0))return c;
 const caches=c.cached_tokens===null?[c.input_tokens,0]:[c.cached_tokens,c.cached_tokens];
 const values=caches.map(cache=>((c.input_tokens-cache)*p.input_rate+cache*p.cached_rate+(c.output_tokens||0)*p.output_rate)/1e6);
 return{...c,cost_low:Math.min(...values),cost_high:Math.max(...values),pricing_id:p.id,cost_source:c.cached_tokens===null&&p.cached_rate!==p.input_rate?'catalog-range':'catalog'};
}
export function sumKnown(rows,key){let a=rows.map(r=>r[key]).filter(x=>x!==null&&x!==undefined);return a.length?a.reduce((s,n)=>s+Number(n),0):null}
export function stats(rows){
 const durations=rows.map(r=>r.duration_ms).filter(v=>v!==null).sort((a,b)=>a-b),inputs=rows.filter(r=>r.input_tokens!==null&&r.cached_tokens!==null);
 const sum=k=>sumKnown(rows,k);
 return{count:rows.length,success:rows.filter(r=>r.status==='success').length,failed:rows.filter(r=>['failed','timeout'].includes(r.status)).length,cancelled:rows.filter(r=>r.status==='cancelled').length,fallbacks:rows.filter(r=>r.fallback_from).length,retries:rows.filter(r=>r.attempt>1||r.retry_of).length,input_tokens:sum('input_tokens'),output_tokens:sum('output_tokens'),cached_tokens:sum('cached_tokens'),reasoning_tokens:sum('reasoning_tokens'),total_tokens:sum('total_tokens'),cost_low:sum('cost_low'),cost_high:sum('cost_high'),known_cost:rows.filter(r=>r.cost_high!==null).length,known_usage:rows.filter(r=>r.total_tokens!==null).length,cache_ratio:inputs.reduce((s,r)=>s+r.input_tokens,0)>0?inputs.reduce((s,r)=>s+r.cached_tokens,0)/inputs.reduce((s,r)=>s+r.input_tokens,0):null,p50:durations.length?durations[Math.floor((durations.length-1)*.5)]:null,p95:durations.length?durations[Math.floor((durations.length-1)*.95)]:null,logical_records:rows.filter(r=>r.scope!=='call').length};
}
export function groupStats(rows,key){const groups=new Map();for(const r of rows){const k=typeof key==='function'?key(r):r[key];if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}return[...groups].map(([name,list])=>({name,...stats(list)})).sort((a,b)=>(b.cost_high||0)-(a.cost_high||0)||b.count-a.count)}
export function csv(rows,columns){const esc=v=>{let s=v===null||v===undefined?'':String(v);if(/^[=+@\-]/.test(s))s="'"+s;return'"'+s.replaceAll('"','""')+'"'};return'\ufeff'+[columns.map(esc).join(','),...rows.map(r=>columns.map(k=>esc(r[k])).join(','))].join('\r\n')}
