import './env';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {randomUUID} from 'node:crypto';
import {database,closeDatabase,dataDir} from '../lib/db';
import {ensureSeed,stageBook,digest,now} from '../lib/catalogue';
import {createUser} from '../lib/auth';
import {syncSource,importPath} from '../lib/ingestion';
import {shamelaFolder,jsonLines} from '../lib/local-import';
import {enqueue} from '../lib/jobs';
import type {RemoteBook,SourceId} from '../lib/types';
const [command,mode,path,...args]=process.argv.slice(2);
try{
 if(command==='migrate'){await database();console.log('Database schema is ready.');}
 else if(command==='seed'){await ensureSeed();console.log('Sample metadata seeded; no external book content downloaded.');}
 else if(command==='admin'){const rl=createInterface({input:stdin,output:stdout});try{const name=await rl.question('Administrator name: ');const email=await rl.question('Administrator email: ');rl.close();stdout.write('Password (12+ characters; hidden): ');if(!stdin.isTTY)throw new Error('Run admin:create in an interactive terminal');stdin.setRawMode(true);stdin.resume();const password=await new Promise<string>((resolve,reject)=>{let value='';const onData=(chunk:Buffer)=>{for(const char of chunk.toString()){if(char==='\u0003'){cleanup();reject(new Error('Cancelled'));return;}if(char==='\r'||char==='\n'){cleanup();stdout.write('\n');resolve(value);return;}if(char==='\u007f'||char==='\b')value=value.slice(0,-1);else value+=char;}};function cleanup(){stdin.setRawMode(false);stdin.pause();stdin.off('data',onData);}stdin.on('data',onData);});const user=await createUser(name,email,password,'admin');console.log(`Administrator created: ${user.email}`);}finally{rl.close();}}
 else if(command==='import'){
  if(mode==='manifest'){const manifest=JSON.parse(await readFile(resolve(path),'utf8'));const remote=(manifest.book||manifest) as RemoteBook;if(remote.files?.length)throw new Error('Local manifests must not request remote file downloads');console.log(await stageBook('local',remote));}
  else if(mode==='jsonl'){let count=0;for await(const row of jsonLines(resolve(path))){const remote=(row.book||row) as RemoteBook;if(remote.files?.length)throw new Error('Local manifests must not request remote downloads');await stageBook('local',remote);count++;}console.log(`Staged ${count} records for review.`);}
  else if(mode==='shamela-folder'){const folder=relative(resolve('imports'),resolve(path));console.log(await stageBook('local',await shamelaFolder(folder)));}
  else if(mode==='openiti'){const file=resolve(path);const title=args[0];const author=args[1];if(!title||!author)throw new Error('Usage: npm run import -- openiti imports/path "Arabic title" "Arabic author"');const relativePath=relative(resolve('imports'),file);const bytes=await readFile(importPath(relativePath));const header=bytes.toString('utf8');if(!header.includes('#META#Header#End#'))throw new Error('Not an OpenITI text');const book:RemoteBook={externalId:relativePath,title,authors:[author],categories:[],sourceUrl:'https://github.com/OpenITI/RELEASE',revision:digest(header),licenseUrl:'https://creativecommons.org/licenses/by-nc-sa/4.0/',rightsHint:'Review the individual text, corpus license, and editorial additions.',files:[],raw:{path:relativePath,format:'openiti'}};console.log(await stageBook('local',book));}
  else throw new Error('Import mode: manifest | jsonl | shamela-folder | openiti');
 }
 else if(command==='sync'){if(!mode)throw new Error('Specify a provider ID');console.log(await syncSource(mode as SourceId));}
 else if(command==='reindex'){await ensureSeed();const db=await database();const editions=await db.query<{id:string}>("SELECT id FROM editions WHERE status IN ('ready','published')");for(const e of editions)await enqueue('reindex',{editionId:e.id},`reindex:${e.id}:${randomUUID()}`);console.log(`Queued ${editions.length} editions; run npm run worker.`);}
 else if(command==='backup'){const db=await database();await mkdir('backups',{recursive:true});if(db.dialect==='sqlite'){const target=resolve('backups',`library-${Date.now()}.db`);await db.query(`VACUUM INTO '${target.replace(/'/g,"''")}'`);console.log('Database snapshot saved:',target,'; also back up data/objects and imports/.');}else console.log('Use pg_dump "$DATABASE_URL" > backups/library.sql and back up the object-store bucket separately. Never commit backups.');}
 else throw new Error('Command: migrate | seed | admin | import | sync | reindex | backup');
}catch(e){console.error(e instanceof Error?e.message:e);process.exitCode=1;}finally{await closeDatabase();}
