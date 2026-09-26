import path from 'node:path';import {createStore} from '../server/db.mjs';import{createCollector}from'../server/importers.mjs';
const dir=process.env.FINOPS_DATA||path.resolve('.local'),s=createStore(dir);try{console.log(JSON.stringify(await createCollector(s,dir).run(),null,2))}finally{s.close()}
