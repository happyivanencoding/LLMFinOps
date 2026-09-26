import {now,uid,json,localDay,num,text,fail} from './lib.mjs';
export const capabilities={
 openai:{name:'OpenAI',balance:false,billing:true,usage:true,credential:'Organization Admin API key 用于账单；推理 Key 不能替代',dashboard:'https://platform.openai.com/usage',docs:'https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage'},
 deepseek:{name:'DeepSeek',balance:true,billing:false,usage:false,credential:'普通 API key 可读取账户余额',dashboard:'https://platform.deepseek.com/usage',docs:'https://api-docs.deepseek.com/api/get-user-balance/'},
 gemini:{name:'Gemini',balance:false,billing:false,usage:false,credential:'调用用量经 SDK 采集；账单通过 JSON/CSV 导入，余额支持手动快照',dashboard:'https://aistudio.google.com/usage',docs:'https://ai.google.dev/gemini-api/docs/billing'},
 mimo:{name:'MiMo',balance:false,billing:false,usage:false,credential:'调用用量经 SDK 采集；公开余额接口尚未确认，支持手动快照',dashboard:'https://platform.xiaomimimo.com/',docs:'https://platform.xiaomimimo.com/'},
 jev:{name:'Jev',balance:false,billing:false,usage:false,credential:'SystemOne usage 由调用返回；公开 OpenAPI 没有账户余额接口',dashboard:'https://platform.typesafe.ai/',docs:'https://docs.typesafe.ai/models'},
 codex:{name:'Codex / 订阅',balance:false,billing:false,usage:false,credential:'订阅 Token 单列，不伪装成免费 API；支持已报告用量导入',dashboard:'https://chatgpt.com/',docs:'https://developers.openai.com/codex/'},
 other:{name:'自定义',balance:false,billing:false,usage:false,credential:'使用标准采集 API / JSON 导入',dashboard:'',docs:''}
};
export function createProviderSync(store,secrets,fetchImpl=fetch){
 const active=new Map();
 async function request(url,key){const r=await fetchImpl(url,{headers:{Authorization:`Bearer ${key}`,Accept:'application/json'},signal:AbortSignal.timeout(25000)});if(!r.ok){const e=new Error(r.status===401||r.status===403?`HTTP ${r.status}：凭据无效或缺少账户读取权限`:`提供方返回 HTTP ${r.status}`);e.status=502;throw e}return r.json()}
 async function pages(base,key){let rows=[],next=null;do{const u=new URL(base);if(next)u.searchParams.set('page',next);const v=await request(u,key);rows.push(...(v.data||[]));next=v.has_more?v.next_page:null;if(v.has_more&&!next)throw new Error('提供方分页缺少游标');if(rows.length>20000)throw new Error('账户记录超过本次同步范围')}while(next);return rows}
 async function sync(id){if(active.has(id))return active.get(id);const pending=run(id).finally(()=>active.delete(id));active.set(id,pending);return pending}
 async function run(id){const a=store.one('SELECT * FROM accounts WHERE id=?',id);if(!a)fail('账户不存在',404);if(!a.enabled)return{status:'disabled'};const runId=uid('sync-');store.run('INSERT INTO sync_runs VALUES (?,?,?,?,?,?,?)',runId,id,'account','running','',now(),null);
  let result;
  try{
   if(a.provider==='deepseek'){
    const key=secrets.resolve(id);if(!key)fail('请先配置 DeepSeek API key',422);const v=await request('https://api.deepseek.com/user/balance',key);if(!Array.isArray(v.balance_infos))throw new Error('提供方未返回余额结构');
    for(const s of v.balance_infos)store.snapshot({account_id:id,currency:s.currency,balance:s.total_balance,granted:s.granted_balance,topped_up:s.topped_up_balance,source:'provider-api',note:v.is_available?'账户可用':'提供方报告余额不足'});
    result={status:'synced',detail:`已读取 ${v.balance_infos.length} 个币种余额`};
   }else if(a.provider==='openai'){
    const key=secrets.resolve(id,'adminKey');if(!key)fail('需配置 OpenAI Organization Admin API key 才能读取账单；普通推理 Key 的调用记录仍可正常采集',422);
    const start=Math.floor(Date.parse(localDay().slice(0,7)+'-01T00:00:00Z')/1000),end=Math.floor(Date.now()/1000);
    const buckets=await pages(`https://api.openai.com/v1/organization/costs?start_time=${start}&end_time=${end}&bucket_width=1d&group_by=project_id&group_by=line_item&limit=31`,key);
    const bills=[];for(const b of buckets){const day=new Date(b.start_time*1000).toISOString().slice(0,10);for(const r of b.results||[]){const amount=r.amount?.value==null?NaN:Number(r.amount.value);if(!Number.isFinite(amount))continue;bills.push([json([id,day,r.project_id||'',r.line_item||'',r.amount.currency||'usd']),id,day,r.project_id||'',r.line_item||'',String(r.amount.currency||'usd').toUpperCase(),amount,'openai-costs',now()])}}
    store.db.exec('BEGIN');try{store.run("DELETE FROM billing_daily WHERE account_id=? AND source='openai-costs' AND day>=?",id,localDay().slice(0,7)+'-01');for(const b of bills)store.run('INSERT OR REPLACE INTO billing_daily VALUES (?,?,?,?,?,?,?,?,?)',...b);store.db.exec('COMMIT')}catch(e){store.db.exec('ROLLBACK');throw e}
    let usageWarning='';try{const usage=await pages(`https://api.openai.com/v1/organization/usage/completions?start_time=${start}&end_time=${end}&bucket_width=1d&group_by=model&group_by=api_key_id&group_by=project_id&limit=31`,key);for(const b of usage){const day=new Date(b.start_time*1000).toISOString().slice(0,10);for(const r of b.results||[])store.run('INSERT OR REPLACE INTO provider_usage VALUES (?,?,?,?,?,?,?,?)',json([id,day,r.model,r.api_key_id,r.project_id]),id,day,r.model||null,r.api_key_id||null,r.project_id||null,json(r),now())}}catch(e){usageWarning='；用量明细未取得：'+e.message}
    result={status:usageWarning?'partial':'synced',detail:`已同步 ${bills.length} 条本月官方账单（UTC 日桶）${usageWarning}`};
   }else{result={status:'usage_only',detail:capabilities[a.provider]?.credential||'账户余额需手动录入'}}
   store.run('UPDATE accounts SET sync_status=?,last_sync=?,last_error=? WHERE id=?',result.status,now(),null,id);store.run('UPDATE sync_runs SET status=?,detail=?,ended_at=? WHERE id=?',result.status,result.detail,now(),runId);store.evaluateAlerts();return result;
  }catch(e){const detail=text(e.message,400);store.run('UPDATE accounts SET sync_status=?,last_error=? WHERE id=?',e.status===422?'not_configured':'error',detail,id);store.run('UPDATE sync_runs SET status=?,detail=?,ended_at=? WHERE id=?','error',detail,now(),runId);return{status:e.status===422?'not_configured':'error',detail}}
 }
 async function syncAll(){const list=store.all("SELECT id FROM accounts WHERE enabled=1 AND provider IN ('openai','deepseek')");const results=[];for(const a of list)results.push({account_id:a.id,...await sync(a.id)});return results}
 return{sync,syncAll};
}
