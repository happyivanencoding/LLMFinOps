/** Dependency-free side-channel telemetry. Never changes model requests or retries. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {AsyncLocalStorage} from 'node:async_hooks';
const context=new AsyncLocalStorage();
export function createTelemetry({url,token,project,environment='production',source=project,spoolDir,accountIds={}}){
 if(!url||!token||!project||!spoolDir)throw new Error('url, token, project and spoolDir are required');
 let flushing=null,closed=false,lastError=null,pendingWrites=new Set();
 const eventKeys=['id','trace_id','provider','account_id','feature','model','requested_model','started_at','ended_at','status','duration_ms','ttft_ms','estimated_cost','cost_low','cost_high','cost_source','attempt','retry_of','fallback_from','error_code','request_id','scope','billing_mode'];
 const usageKeys=['input_tokens','prompt_tokens','promptTokenCount','inputTokens','output_tokens','completion_tokens','outputTokens','candidatesTokenCount','thoughtsTokenCount','cached_tokens','cachedInputTokens','prompt_cache_hit_tokens','cachedContentTokenCount','reasoning_tokens','reasoningTokens','total_tokens','totalTokens','totalTokenCount'];
 function safeUsage(raw){if(!raw||typeof raw!=='object')return null;const out={};for(const k of usageKeys)if(raw[k]===null||typeof raw[k]==='number')out[k]=raw[k];for(const k of ['input_tokens_details','prompt_tokens_details','output_tokens_details','completion_tokens_details'])if(raw[k]&&typeof raw[k]==='object'){out[k]={};for(const sub of ['cached_tokens','reasoning_tokens'])if(typeof raw[k][sub]==='number')out[k][sub]=raw[k][sub]}return out}
 async function persist(event){
  if(!event||!event.provider||!event.model)throw Object.assign(new Error('provider and model required'),{code:'INVALID_EVENT'});
  const safe=Object.fromEntries(eventKeys.filter(k=>event[k]!==undefined&&['string','number','boolean'].includes(typeof event[k])).map(k=>[k,event[k]]));
  const id=event.id||randomUUID();const record={project,environment,source,...safe,id,trace_id:event.trace_id||context.getStore()?.trace_id||id,started_at:event.started_at||new Date().toISOString(),usage:safeUsage(event.usage)};
  await fs.mkdir(spoolDir,{recursive:true});const name=randomUUID(),tmp=path.join(spoolDir,name+'.tmp'),dest=path.join(spoolDir,name+'.json');await fs.writeFile(tmp,JSON.stringify(record),{mode:0o600});await fs.rename(tmp,dest);
 }
 function record(event){const write=persist(event).catch(e=>{lastError=e.code||'SPOOL_ERROR'}).finally(()=>pendingWrites.delete(write));pendingWrites.add(write);return write}
 async function flush(){if(flushing)return flushing;flushing=(async()=>{await Promise.allSettled([...pendingWrites]);await fs.mkdir(spoolDir,{recursive:true});const names=(await fs.readdir(spoolDir)).filter(n=>n.endsWith('.json')).slice(0,100);if(!names.length)return{sent:0};const calls=[];for(const n of names)calls.push(JSON.parse(await fs.readFile(path.join(spoolDir,n),'utf8')));const response=await fetch(url.replace(/\/$/,'')+'/api/v1/calls',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({source,calls}),signal:AbortSignal.timeout(5000)});if(!response.ok)throw new Error('HTTP_'+response.status);const result=await response.json();for(const n of names)await fs.unlink(path.join(spoolDir,n));lastError=null;return{sent:calls.length,...result}})().catch(e=>{lastError=e.message;return{sent:0,error:lastError}}).finally(()=>flushing=null);return flushing}
 async function track(meta,operation){const id=meta.id||randomUUID(),trace_id=meta.trace_id||context.getStore()?.trace_id||randomUUID(),start=Date.now(),at=new Date(start).toISOString();let result,error;
  try{result=await operation();return result}catch(e){error=e;throw e}finally{let usage=null;try{usage=meta.extractUsage?meta.extractUsage(result,error):result?.usage||result?.usageMetadata||error?.usage||null}catch(e){lastError='USAGE_EXTRACT_ERROR'}const fields=['provider','feature','account_id','attempt','retry_of','fallback_from','request_id','billing_mode'];const safe=Object.fromEntries(fields.filter(k=>meta[k]!==undefined).map(k=>[k,meta[k]]));record({...safe,id,trace_id,account_id:meta.account_id||accountIds[meta.provider]||`${meta.provider}-unassigned`,started_at:at,ended_at:new Date().toISOString(),duration_ms:Date.now()-start,status:error?(error.name==='AbortError'?'cancelled':'failed'):'success',model:result?.model||meta.model,requested_model:meta.model,usage,error_code:error?String(error.code||error.name||'MODEL_ERROR'):null,extractUsage:undefined,scope:'call'});}}
 const timer=setInterval(()=>{if(!closed)void flush()},5000);timer.unref();
 return{record,track,trace:(fn,id=randomUUID())=>context.run({trace_id:id},()=>fn(id)),flush,status:()=>({lastError,pendingWrites:pendingWrites.size}),close:async()=>{closed=true;clearInterval(timer);return flush()}};
}
