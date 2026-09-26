// Apply an operator-supplied, private configuration without overwriting existing accounts.
import fs from 'node:fs';
import path from 'node:path';
import {createStore} from '../server/db.mjs';
import {createSecrets} from '../server/auth.mjs';
const file=process.argv[2];
if(!file)throw new Error('Usage: node scripts/configure.mjs <private-config.json>');
const config=JSON.parse(fs.readFileSync(file,'utf8'));
const dir=process.env.FINOPS_DATA||path.resolve('.local'),store=createStore(dir),secrets=createSecrets(dir);
try{
 for(const account of config.accounts||[]){
  if(!store.one('SELECT id FROM accounts WHERE id=?',account.id))store.saveAccount(account);
  if(account.keyFile&&!secrets.account(account.id).key&&!secrets.account(account.id).keyFile)secrets.setAccount(account.id,{keyFile:account.keyFile});
 }
 if(config.collectors&&!fs.existsSync(path.join(dir,'collectors.json')))fs.writeFileSync(path.join(dir,'collectors.json'),JSON.stringify(config.collectors,null,2),{mode:0o600});
 for(const c of config.pending||[])if(!store.one('SELECT id FROM connectors WHERE id=?',c.id))store.connector(c.id,c.name,c.kind||'sdk','waiting',0,null,{reason:'not_instrumented',project:c.project||c.id});
 for(const p of config.pricing||[])if(!store.one('SELECT id FROM pricing WHERE provider=? AND model=? AND effective_from=?',p.provider,p.model,new Date(p.effective_from).toISOString()))store.savePrice(p);
 console.log(JSON.stringify({accounts:store.one('SELECT COUNT(*) n FROM accounts').n,prices:store.one('SELECT COUNT(*) n FROM pricing').n,configured:true}));
}finally{store.close()}
