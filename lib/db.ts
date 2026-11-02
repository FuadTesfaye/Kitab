import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import pg from 'pg';
type Row=Record<string,unknown>;
export interface Query {<T=Row>(sql:string,params?:unknown[]):Promise<T[]>}
export interface Database {query:Query;transaction<T>(fn:(query:Query)=>Promise<T>):Promise<T>;close():Promise<void>;dialect:'postgres'|'sqlite'}
export const dataDir=()=>resolve(process.env.DATA_DIR||'./data');
let instance:Database|undefined;let initialization:Promise<Database>|undefined;
export async function database():Promise<Database>{
 if(initialization)return initialization;
 initialization=(async()=>{let db:Database;
 if(process.env.DATABASE_URL){const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:10});const query:Query=async(sql,params=[]) => (await pool.query(sql,params)).rows;db={dialect:'postgres',query,transaction:async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(async(sql,params=[]) =>(await c.query(sql,params)).rows);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},close:()=>pool.end()};
 }else{mkdirSync(dataDir(),{recursive:true});const {DatabaseSync}=await import('node:sqlite');const sqlite=new DatabaseSync(resolve(dataDir(),'library.db'));sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');let tail=Promise.resolve();const exclusive=async<T>(fn:()=>Promise<T>):Promise<T>=>{const before=tail;let release!:()=>void;tail=new Promise(r=>{release=r;});await before;try{return await fn();}finally{release();}};
 const direct:Query=async(sql,params=[])=>{const ordered:unknown[]=[];const text=sql.replace(/\$(\d+)/g,(_,n)=>{ordered.push(params[Number(n)-1]);return '?';});const stmt=sqlite.prepare(text);return stmt.all(...ordered as (string|number|null)[]) as never;};
 db={dialect:'sqlite',query:(sql,params)=>exclusive(()=>direct(sql,params)),transaction:fn=>exclusive(async()=>{sqlite.exec('BEGIN IMMEDIATE');try{const result=await fn(direct);sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}),close:async()=>sqlite.close()};}
 const schema=readFileSync(resolve(process.cwd(),'db/schema.sql'),'utf8');await db.transaction(async q=>{for(const statement of schema.split(';').map(s=>s.trim()).filter(Boolean))await q(statement);await q('INSERT INTO schema_migrations(version,applied_at) VALUES (1,$1) ON CONFLICT(version) DO NOTHING',[new Date().toISOString()]);});instance=db;return db;})();
 try{return await initialization;}catch(e){initialization=undefined;throw e;}
}
export async function closeDatabase(){if(instance)await instance.close();instance=undefined;initialization=undefined;}
