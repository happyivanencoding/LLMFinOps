import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createStore} from '../server/db.mjs';import {createSecrets} from '../server/auth.mjs';
const dir=process.env.FINOPS_DATA||path.resolve('.local'),s=createStore(dir),secrets=createSecrets(dir),desktop=path.join(os.homedir(),'Desktop');
const configs=[
{id:'deepseek-onward',name:'DeepSeek · Onward',provider:'deepseek',billing_mode:'prepaid',key:'key_deepseek_analysis.txt'},
{id:'deepseek-tgn',name:'DeepSeek · TGN Live',provider:'deepseek',billing_mode:'prepaid',key:'key_deepseek_tgn.txt'},
{id:'deepseek-personal',name:'DeepSeek · Personal',provider:'deepseek',billing_mode:'prepaid',key:'key_deepseek.txt'},
{id:'openai-main',name:'OpenAI · Shared account',provider:'openai',billing_mode:'api',key:'key_gpt.txt'},
{id:'gemini-main',name:'Gemini · Job Data & Research',provider:'gemini',billing_mode:'api',key:'key_ge;ini.txt'},
{id:'jev-main',name:'Jev · Shared account',provider:'jev',billing_mode:'prepaid',key:'key_jev.txt'},
{id:'mimo-main',name:'MiMo · Research',provider:'mimo',billing_mode:'prepaid',key:'key_xiaomi.txt'},
{id:'codex-main',name:'Codex · Subscription',provider:'codex',billing_mode:'subscription'}];
for(const c of configs){if(!s.one('SELECT id FROM accounts WHERE id=?',c.id))s.saveAccount({...c,currency:'USD',notes:c.provider==='deepseek'?'Project-specific key; billing account sharing is not assumed.':''});if(c.key&&fs.existsSync(path.join(desktop,c.key)))secrets.setAccount(c.id,{keyFile:path.join(desktop,c.key)});}
const cf=path.join(dir,'collectors.json');if(!fs.existsSync(cf))fs.writeFileSync(cf,JSON.stringify([{id:'tgn-history-local',name:'TGN Live · local history',kind:'tgn-sqlite',project:'tgn-live',environment:'local',path:'C:/dev/tgn_live/data/tgn-live.sqlite',accounts:{deepseek:'deepseek-tgn',jev:'jev-main',openai:'openai-main',gemini:'gemini-main',codex:'codex-main'}},{id:'onward-history-local',name:'Onward · local history',kind:'onward-tasks',project:'onward',environment:'local',path:'C:/dev/onward/.career-ops-web/profiles',accounts:{deepseek:'deepseek-onward',jev:'jev-main',openai:'openai-main',gemini:'gemini-main',codex:'codex-main'}}],null,2));
for(const c of [{id:'onward-job-data',name:'Onward Job Data',kind:'sdk'},{id:'onward-control',name:'Onward Control',kind:'sdk'},{id:'mail-jev-cleaner',name:'Mail Jev Cleaner',kind:'sdk'},{id:'project-os',name:'Project OS',kind:'sdk'},{id:'mimo-research',name:'MiMo research',kind:'sdk'}])if(!s.one('SELECT id FROM connectors WHERE id=?',c.id))s.connector(c.id,c.name,c.kind,'waiting',0,null,{reason:'not_instrumented'});
s.close();console.log('Accounts registered; credentials remain local. Initial login: '+path.join(dir,'initial-login.txt'));
