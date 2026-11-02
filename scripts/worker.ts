import './env';
import {setTimeout as pause} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {database,closeDatabase} from '../lib/db';import {ensureSeed,now} from '../lib/catalogue';
import {claim,finish,heartbeat,enqueue} from '../lib/jobs';
import {syncSource,ingestEdition} from '../lib/ingestion';import {indexEdition} from '../lib/search';
import type {SourceId} from '../lib/types';
let stopped=false;process.on('SIGTERM',()=>stopped=true);process.on('SIGINT',()=>stopped=true);
await ensureSeed();console.log('Kitabs worker started');
while(!stopped){try{const db=await database();await db.transaction(async q=>{const sources=await q<{id:SourceId;schedule_hours:number}>(`SELECT id,schedule_hours FROM sources WHERE enabled=1 AND (next_sync_at IS NULL OR next_sync_at<=$1) ${db.dialect==='postgres'?'FOR UPDATE SKIP LOCKED':''}`,[now()]);for(const s of sources){const time=now();await q("INSERT INTO jobs(id,dedup_key,type,payload,available_at,created_at,updated_at) VALUES($1,$2,'sync',$3,$4,$4,$4) ON CONFLICT(dedup_key) DO NOTHING",[randomUUID(),`scheduled:${s.id}:${time.slice(0,13)}`,JSON.stringify({source:s.id}),time]);await q('UPDATE sources SET next_sync_at=$1 WHERE id=$2',[new Date(Date.now()+s.schedule_hours*3600000).toISOString(),s.id]);}});
 const job=await claim();if(!job){await pause(2000);continue;}const timer=setInterval(()=>{heartbeat(job).catch(e=>console.error('Heartbeat failed',e.message));},30000);try{const payload=JSON.parse(job.payload);if(job.type==='sync')await syncSource(payload.source);else if(job.type==='ingest')await ingestEdition(payload.editionId);else if(job.type==='reindex')await indexEdition(payload.editionId);else throw new Error('Unknown job type');await finish(job);console.log('Completed',job.type,job.id);}catch(e){await finish(job,e);console.error('Job failed',job.id,e instanceof Error?e.message:e);}finally{clearInterval(timer);}
 }catch(e){console.error('Worker error',e instanceof Error?e.message:e);await pause(5000);}}
await closeDatabase();
