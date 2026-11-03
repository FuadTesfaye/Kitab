import {randomUUID} from 'node:crypto';
import {database} from './db';
import {ensureSeed,works,getWork,accessibleEdition,stageBook,now,audit,digest} from './catalogue';
import {currentUser,requireUser,createUser,session,sessionCookie,checkOrigin,verifyPassword,throttleLogin,HttpError} from './auth';
import {provider,sourceNames,configuration} from './providers';
import {enqueue} from './jobs';
import {reviewRights,publishEdition} from './ingestion';
import {searchPages} from './search';
import {getObject} from './storage';
import surahsData from '@/data/seeds/surahs.json';
import type {SourceId,RightsStatus,RemoteBook,Work} from './types';
const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});
const text=(b:Record<string,unknown>,key:string,max=1000)=>{const v=b[key];if(typeof v!=='string'||v.length>max)throw new HttpError(400,`Invalid ${key}`);return v;};
async function body(req:Request){const reader=req.body?.getReader();if(!reader)throw new HttpError(400,'Missing body');const chunks:Uint8Array[]=[];let n=0;while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>5*1024*1024){await reader.cancel();throw new HttpError(413,'Payload is too large');}chunks.push(value);}try{const b=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!b||Array.isArray(b)||typeof b!=='object')throw Error();return b as Record<string,unknown>;}catch{throw new HttpError(400,'Invalid JSON body');}}
export async function api(req:Request,path:string[]):Promise<Response>{try{if(!['GET','HEAD'].includes(req.method))checkOrigin(req);const key=path.join('/');const method=req.method;const isRead=['GET','HEAD'].includes(method);const url=new URL(req.url);
 if(key==='health'&&method==='GET'){try{await ensureSeed();const db=await database();await db.query('SELECT 1 as ok');return json({ok:true,database:db.dialect,search:process.env.OPENSEARCH_URL?'opensearch':'database',storage:process.env.S3_ENDPOINT?'s3':'local'});}catch(err){return json({ok:false,error:err instanceof Error?err.message:String(err),database:process.env.DATABASE_URL?'postgres':'sqlite'},500);}}
 if(key==='surahs'&&method==='GET'){return json({surahs:surahsData});}
 await ensureSeed();const db=await database();
 if(key==='books'&&method==='GET')return json({books:await works()});
 if(path[0]==='books'&&path.length>=2&&isRead){
   const id=path[1];
   const book=await getWork(id);
   if(!book)throw new HttpError(404,'الكتاب غير موجود');
   if(path.length===2)return json({book});
   if(path[2]==='download'){
     const format=(url.searchParams.get('format')||'pdf').toLowerCase();
     const isAljam3=id.startsWith('aljam3-');
     const numId=isAljam3?Number(id.replace('aljam3-','')):null;
     if(isAljam3&&numId){
       if(format==='pdf'){
         const fs=await import('node:fs');
         const pathMod=await import('node:path');
         const booksDir=pathMod.resolve(process.cwd(),'data/books');
         if(fs.existsSync(booksDir)){
           const match=fs.readdirSync(booksDir).find(f=>f.startsWith(`${numId}-`)&&f.endsWith('.pdf'));
           if(match){
             const buffer=fs.readFileSync(pathMod.join(booksDir,match));
             return new Response(method==='HEAD'?null:buffer,{
               status:200,
               headers:{
                 'Content-Type':'application/pdf',
                 'Content-Disposition':`attachment; filename="${encodeURIComponent(book.title)}.pdf"; filename*=UTF-8''${encodeURIComponent(book.title)}.pdf`,
                 'Content-Length':String(buffer.length),
                 'Cache-Control':'public, max-age=86400'
               }
             });
           }
         }
         const {getBookPdfUrl}=await import('./providers/aljam3');
         const pdfUrl=await getBookPdfUrl(numId);
         if(!pdfUrl)throw new HttpError(404,'ملف الـ PDF غير متوفر');
         if(pdfUrl.includes('.pdf')){
           try{
             const upstream=await fetch(pdfUrl,{headers:{'User-Agent':'Kitab/2.0'},redirect:'follow'});
             if(upstream.ok&&upstream.body){
               return new Response(method==='HEAD'?null:upstream.body,{
                 status:200,
                 headers:{
                   'Content-Type':'application/pdf',
                   'Content-Disposition':`attachment; filename="${encodeURIComponent(book.title)}.pdf"; filename*=UTF-8''${encodeURIComponent(book.title)}.pdf`,
                   'Content-Length':upstream.headers.get('content-length')||'',
                   'Cache-Control':'public, max-age=86400'
                 }
               });
             }
           }catch(e){}
         }
         return Response.redirect(pdfUrl,302);
       }
       if(format==='txt'){
         const fs=await import('node:fs');
         const pathMod=await import('node:path');
         const booksDir=pathMod.resolve(process.cwd(),'data/books');
         if(fs.existsSync(booksDir)){
           const match=fs.readdirSync(booksDir).find(f=>f.startsWith(`${numId}-`)&&f.endsWith('.txt'));
           if(match){
             const buffer=fs.readFileSync(pathMod.join(booksDir,match));
             return new Response(method==='HEAD'?null:buffer,{
               status:200,
               headers:{
                 'Content-Type':'text/plain; charset=utf-8',
                 'Content-Disposition':`attachment; filename="${encodeURIComponent(book.title)}.txt"; filename*=UTF-8''${encodeURIComponent(book.title)}.txt`,
                 'Content-Length':String(buffer.length),
                 'Cache-Control':'public, max-age=86400'
               }
             });
           }
         }
         const {getBooksDataset}=await import('./providers/aljam3');
         const all=await getBooksDataset();
         const b=all.find(x=>x.id===numId);
         if(b?.txt_url){
           try{
             const upstream=await fetch(b.txt_url,{headers:{'User-Agent':'Kitab/2.0'},redirect:'follow'});
             if(upstream.ok&&upstream.body){
               return new Response(method==='HEAD'?null:upstream.body,{
                 status:200,
                 headers:{
                   'Content-Type':'text/plain; charset=utf-8',
                   'Content-Disposition':`attachment; filename="${encodeURIComponent(book.title)}.txt"; filename*=UTF-8''${encodeURIComponent(book.title)}.txt`,
                   'Content-Length':upstream.headers.get('content-length')||'',
                   'Cache-Control':'public, max-age=86400'
                 }
               });
             }
           }catch(e){}
           return Response.redirect(b.txt_url,302);
         }
         const {exportShamelaText}=await import('./providers/shamela-direct');
         const text=await exportShamelaText(numId).catch(()=>'');
         return new Response(method==='HEAD'?null:(text||`${b?.title||book.title}\n${b?.author||book.author}`),{
           headers:{
             'Content-Type':'text/plain; charset=utf-8',
             'Content-Disposition':`attachment; filename="${encodeURIComponent(book.title)}.txt"`,
             'Cache-Control':'public, max-age=86400'
           }
         });
       }
       if(format==='json'){
         const fs=await import('node:fs');
         const pathMod=await import('node:path');
         const booksDir=pathMod.resolve(process.cwd(),'data/books');
         if(fs.existsSync(booksDir)){
           const match=fs.readdirSync(booksDir).find(f=>f.startsWith(`${numId}-`)&&f.endsWith('.json'));
           if(match){
             const buffer=fs.readFileSync(pathMod.join(booksDir,match));
             return new Response(method==='HEAD'?null:buffer,{
               status:200,
               headers:{
                 'Content-Type':'application/json; charset=utf-8',
                 'Content-Disposition':`attachment; filename="${id}.json"; filename*=UTF-8''${encodeURIComponent(book.title)}.json`,
                 'Content-Length':String(buffer.length),
                 'Cache-Control':'public, max-age=86400'
               }
             });
           }
         }
       }
       return new Response(method==='HEAD'?null:JSON.stringify(book,null,2),{
         headers:{
           'Content-Type':'application/json; charset=utf-8',
           'Content-Disposition':`attachment; filename="${id}.json"`,
           'Cache-Control':'public, max-age=86400'
         }
       });
     }
     const edition=book.editions?.[0];
     if(format==='json'){
       let pages:{seq:number;body:string;page_no?:string}[]=[];
       if(edition){
         pages=await db.query('SELECT seq,body,page_no FROM book_pages WHERE edition_id=$1 ORDER BY seq',[edition.id]);
       }
       return new Response(method==='HEAD'?null:JSON.stringify({...book,pages},null,2),{
         headers:{
           'Content-Type':'application/json; charset=utf-8',
           'Content-Disposition':`attachment; filename="${id}.json"`,
           'Cache-Control':'public, max-age=86400'
         }
       });
     }
     let content=`« ${book.title} »\nالمؤلف: ${book.author}\n${book.description?book.description+'\n':''}\n${'='.repeat(40)}\n\n`;
     if(edition){
       const pages=await db.query<{seq:number;body:string;page_no?:string}>('SELECT seq,body,page_no FROM book_pages WHERE edition_id=$1 ORDER BY seq',[edition.id]);
       for(const p of pages){
         content+=`\n--- [ صفحة ${p.page_no||p.seq} ] ---\n${p.body}\n`;
       }
     }
     return new Response(method==='HEAD'?null:content,{
       headers:{
         'Content-Type':'text/plain; charset=utf-8',
         'Content-Disposition':`attachment; filename="${encodeURIComponent(book.title)}.txt"`,
         'Cache-Control':'public, max-age=86400'
       }
     });
   }
 }
 if(key==='authors'&&method==='GET')return json({authors:await db.query('SELECT id,name_ar,death_hijri,biography FROM authors ORDER BY name_ar')});
 if(key==='tafsir'&&method==='GET'){
   const surah=Number(url.searchParams.get('surah')||1);
   const ayah=Number(url.searchParams.get('ayah')||1);
   const author=url.searchParams.get('author')||'ar-tafsir-ibn-kathir';
   const {fetchTafsirAyah}=await import('./providers/tafsir');
   const text=await fetchTafsirAyah(author,surah,ayah);
   return json({surah,ayah,author,text});
 }
 if(path[0]==='shamela'){
   const {listShamelaIndex,fetchShamelaInfo,fetchShamelaPage,exportShamelaText,getShamelaLocalBook}=await import('./providers/shamela-direct');
   const isRead=['GET','HEAD'].includes(method);
   if(path[1]==='books'&&isRead){
     if(url.searchParams.get('all')==='true'||path[2]==='all'){
       const fs=await import('node:fs');
       const pathMod=await import('node:path');
       const shamelaAllPath=pathMod.resolve(process.cwd(),'data/shamela/shamela-all-books.json');
       if(fs.existsSync(shamelaAllPath)){
         const allData=JSON.parse(fs.readFileSync(shamelaAllPath,'utf8'));
         return json({books:allData,total:allData.length});
       }
     }
     return json({books:await listShamelaIndex()});
   }
   if(path[1]==='book'&&isRead){
     const id=Number(url.searchParams.get('id')||path[2]);
     if(!Number.isSafeInteger(id)||id<1)throw new HttpError(400,'رقم الكتاب غير صالح');
     const info=await fetchShamelaInfo(id);
     return json({book:info});
   }
   if(path[1]==='page'&&isRead){
     const id=Number(url.searchParams.get('id'));
     const page=Number(url.searchParams.get('page')||1);
     if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(page)||page<1)throw new HttpError(400,'رقم الكتاب أو الصفحة غير صالح');
     const pageData=await fetchShamelaPage(id,page);
     return json({page:pageData});
   }
   if(path[1]==='download'&&isRead){
     const id=Number(url.searchParams.get('id'));
     const format=url.searchParams.get('format')||'json';
     if(!Number.isSafeInteger(id)||id<1)throw new HttpError(400,'رقم الكتاب غير صالح');
     if(format==='pdf'){
       const {getBookPdfUrl}=await import('./providers/aljam3');
       const pdfUrl=await getBookPdfUrl(id);
       if(pdfUrl)return Response.redirect(pdfUrl,302);
       throw new HttpError(404,'ملف الـ PDF غير متوفر لهذا الكتاب حالياً');
     }
     if(format==='txt'){
       const textData=await exportShamelaText(id);
       return new Response(method==='HEAD'?null:textData,{
         headers:{
           'Content-Type':'text/plain; charset=utf-8',
           'Content-Disposition':`attachment; filename="shamela-${id}.txt"`,
           'Cache-Control':'public, max-age=86400'
         }
       });
     }
     const local=await getShamelaLocalBook(id);
     if(local){
       return new Response(method==='HEAD'?null:JSON.stringify(local,null,2),{
         headers:{
           'Content-Type':'application/json; charset=utf-8',
           'Content-Disposition':`attachment; filename="shamela-${id}.json"`,
           'Cache-Control':'public, max-age=86400'
         }
       });
     }
     const info=await fetchShamelaInfo(id);
     const page1=await fetchShamelaPage(id,1);
     const payload={shamela_id:id,title:info.title,author:info.author,category:info.category,page_count:info.pageCount,headings:info.headings,sample_page:page1};
     return new Response(method==='HEAD'?null:JSON.stringify(payload,null,2),{
       headers:{
         'Content-Type':'application/json; charset=utf-8',
         'Content-Disposition':`attachment; filename="shamela-${id}.json"`,
         'Cache-Control':'public, max-age=86400'
       }
     });
   }
 }
 if(path[0]==='aljam3'){
   const {getBooksDataset,getAljam3Book,getBookPdfUrl}=await import('./providers/aljam3');
   const isRead=['GET','HEAD'].includes(method);
   if(path[1]==='books'&&isRead){
     const all=await getBooksDataset();
     const q=(url.searchParams.get('q')||'').trim();
     const library=url.searchParams.get('library');
     const page=Math.max(1,Number(url.searchParams.get('page')||1));
     const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||20)));
     let filtered=all;
     if(library)filtered=filtered.filter(b=>String(b.library?.id)===library||b.library?.name?.includes(library));
     if(q){
       const {normalizeArabic}=await import('./arabic');
       const nq=normalizeArabic(q);
       filtered=filtered.filter(b=>normalizeArabic(`${b.title} ${b.author?.name} ${b.category?.name}`).includes(nq));
     }
     const total=filtered.length;
     const start=(page-1)*limit;
     const paginated=filtered.slice(start,start+limit);
     return json({books:paginated,total,page,limit,pages:Math.ceil(total/limit)});
   }
   if(path[1]==='book'&&isRead){
     const id=Number(url.searchParams.get('id')||path[2]);
     if(!Number.isSafeInteger(id)||id<1)throw new HttpError(400,'رقم الكتاب غير صالح');
     return json({book:await getAljam3Book(id)});
   }
   if((path[1]==='pdf'||path[1]==='download')&&isRead){
     const id=Number(url.searchParams.get('id'));
     if(!Number.isSafeInteger(id)||id<1)throw new HttpError(400,'رقم الكتاب غير صالح');
     const fs=await import('node:fs');
     const pathMod=await import('node:path');
     const booksDir=pathMod.resolve(process.cwd(),'data/books');
     if(fs.existsSync(booksDir)){
       const match=fs.readdirSync(booksDir).find(f=>f.startsWith(`${id}-`)&&f.endsWith('.pdf'));
       if(match){
         const buffer=fs.readFileSync(pathMod.join(booksDir,match));
         return new Response(method==='HEAD'?null:buffer,{
           status:200,
           headers:{
             'Content-Type':'application/pdf',
             'Content-Disposition':`attachment; filename="${encodeURIComponent(match)}"`,
             'Content-Length':String(buffer.length),
             'Cache-Control':'public, max-age=86400'
           }
         });
       }
     }
     const pdfUrl=await getBookPdfUrl(id);
     if(!pdfUrl)throw new HttpError(404,'ملف الـ PDF غير متوفر');
     if(pdfUrl.includes('.pdf')){
       try{
         const upstream=await fetch(pdfUrl,{headers:{'User-Agent':'Kitab/2.0'},redirect:'follow'});
         if(upstream.ok&&upstream.body){
           return new Response(method==='HEAD'?null:upstream.body,{
             status:200,
             headers:{
               'Content-Type':'application/pdf',
               'Content-Disposition':`attachment; filename="book-${id}.pdf"`,
               'Content-Length':upstream.headers.get('content-length')||'',
               'Cache-Control':'public, max-age=86400'
             }
           });
         }
       }catch(e){}
     }
     return Response.redirect(pdfUrl,302);
   }
 }
 if(key==='search'&&method==='GET')return json(await searchPages((url.searchParams.get('q')||'').slice(0,300),url.searchParams.get('exact')==='1',url.searchParams.get('edition')||undefined));
 if(key==='auth/me'&&method==='GET')return json({user:await currentUser(req)});
 if(key==='auth/register'&&method==='POST'){const b=await body(req);await throttleLogin('registration-global');const user=await createUser(text(b,'name',150),text(b,'email',254),text(b,'password',256));const token=await session(user.id);return json({user},201,{'Set-Cookie':sessionCookie(token)});}
 if(key==='auth/login'&&method==='POST'){const b=await body(req);const email=text(b,'email',254).toLowerCase().trim();await throttleLogin(email);const [row]=await db.query<{id:string;password_hash:string}>('SELECT id,password_hash FROM users WHERE email=$1',[email]);const password=text(b,'password',256);if(!row){await verifyPassword(password,'00000000000000000000000000000000:'+ '0'.repeat(128));throw new HttpError(401,'البريد أو كلمة المرور غير صحيحة');}if(!await verifyPassword(password,row.password_hash))throw new HttpError(401,'البريد أو كلمة المرور غير صحيحة');await db.query('DELETE FROM login_attempts WHERE key=$1',[digest(email)]);const token=await session(row.id);return json({ok:true},200,{'Set-Cookie':sessionCookie(token)});}
 if(key==='auth/logout'&&method==='POST'){const token=req.headers.get('cookie')?.match(/kitabs_session=([a-f0-9]{64})/)?.[1];if(token)await db.query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);return json({ok:true},200,{'Set-Cookie':sessionCookie('',true)});}
 if(key==='bookmarks'){const user=await requireUser(req);if(method==='GET')return json({bookmarks:await db.query('SELECT * FROM bookmarks WHERE user_id=$1 ORDER BY created_at DESC',[user.id])});if(method==='POST'){const b=await body(req);const workId=text(b,'workId',100);if(!await getWork(workId))throw new HttpError(404,'الكتاب غير موجود');const seq=Number(b.seq||0);if(!Number.isSafeInteger(seq)||seq<0)throw new HttpError(400,'Invalid page');const editionId=typeof b.editionId==='string'?b.editionId:null;if(editionId){const edition=await accessibleEdition(editionId);if(!edition||edition.work_id!==workId||seq>edition.page_count)throw new HttpError(400,'Invalid edition or page');}else if(seq)throw new HttpError(400,'Edition required for page bookmarks');await db.query('INSERT INTO bookmarks(id,user_id,work_id,edition_id,seq,note,quote,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,work_id,seq) DO UPDATE SET note=excluded.note,quote=excluded.quote,edition_id=excluded.edition_id',[randomUUID(),user.id,workId,editionId,seq,typeof b.note==='string'?b.note.slice(0,5000):'',typeof b.quote==='string'?b.quote.slice(0,5000):'',now()]);return json({ok:true});}}
 if(path[0]==='bookmarks'&&path.length===2&&method==='DELETE'){const u=await requireUser(req);await db.query('DELETE FROM bookmarks WHERE id=$1 AND user_id=$2',[path[1],u.id]);return json({ok:true});}
 if(path[0]==='editions'&&path.length===2&&method==='GET'){const edition=await accessibleEdition(path[1]);if(!edition)throw new HttpError(404,'النسخة غير متاحة');return json({edition,sections:await db.query('SELECT title,seq,parent_seq FROM book_sections WHERE edition_id=$1 ORDER BY seq',[path[1]])});}
 if(path[0]==='editions'&&path[2]==='pages'&&method==='GET'){const edition=await accessibleEdition(path[1]);if(!edition)throw new HttpError(404,'النسخة غير متاحة');const seq=Number(url.searchParams.get('seq')||1);if(!Number.isSafeInteger(seq)||seq<1)throw new HttpError(400,'Invalid page');const [page]=await db.query('SELECT seq,part,page_no,body,footnotes FROM book_pages WHERE edition_id=$1 AND seq=$2',[path[1],seq]);if(!page)throw new HttpError(404,'الصفحة غير موجودة');const sections=await db.query('SELECT title,seq,parent_seq FROM book_sections WHERE edition_id=$1 ORDER BY seq',[path[1]]);return json({edition,page,sections});}
 if(path[0]==='editions'&&path[2]==='files'&&method==='GET'){if(!await accessibleEdition(path[1]))throw new HttpError(404,'النسخة غير متاحة');return json({files:await db.query('SELECT id,format,original_name,size_bytes FROM book_files WHERE edition_id=$1 ORDER BY original_name',[path[1]])});}
 if(path[0]==='files'&&path.length===2&&method==='GET'){const [file]=await db.query<{edition_id:string;format:string;storage_key:string;original_name:string}>('SELECT edition_id,format,storage_key,original_name FROM book_files WHERE id=$1',[path[1]]);const download=url.searchParams.get('download')==='1';if(!file||!await accessibleEdition(file.edition_id,download)||(!download&&file.format!=='pdf'))throw new HttpError(404,'الملف غير متاح');const bytes=await getObject(file.storage_key);const headers:Record<string,string>={'Content-Type':file.format==='pdf'?'application/pdf':'application/octet-stream','Content-Disposition':`${download?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};const range=req.headers.get('range');if(range){const match=range.match(/^bytes=(\d*)-(\d*)$/);if(!match||!match[1]&&!match[2])return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});let start=match[1]?Number(match[1]):Math.max(0,bytes.length-Number(match[2]));let end=match[1]?(match[2]?Number(match[2]):bytes.length-1):bytes.length-1;end=Math.min(end,bytes.length-1);if(start>end||start>=bytes.length)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.length}`}});headers['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;headers['Content-Length']=String(end-start+1);return new Response(new Uint8Array(bytes.subarray(start,end+1)),{status:206,headers});}headers['Content-Length']=String(bytes.length);return new Response(new Uint8Array(bytes),{headers});}
 if(path[0]==='progress'&&path.length===2){const u=await requireUser(req);if(!await accessibleEdition(path[1]))throw new HttpError(404,'النسخة غير متاحة');if(method==='GET'){const [progress]=await db.query('SELECT seq FROM reading_progress WHERE user_id=$1 AND edition_id=$2',[u.id,path[1]]);return json({progress:progress||null});}if(method==='POST'){const b=await body(req);const seq=Number(b.seq);const [p]=await db.query('SELECT seq FROM book_pages WHERE edition_id=$1 AND seq=$2',[path[1],seq]);if(!p)throw new HttpError(400,'Invalid page');await db.query('INSERT INTO reading_progress(user_id,edition_id,seq,updated_at) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,edition_id) DO UPDATE SET seq=excluded.seq,updated_at=excluded.updated_at',[u.id,path[1],seq,now()]);return json({ok:true});}}
 if(key==='collections'&&method==='GET'){const user=await currentUser(req);return json({collections:await db.query('SELECT c.*,u.name as owner_name FROM collections c JOIN users u ON u.id=c.owner_id WHERE c.published=1 OR c.owner_id=$1 ORDER BY c.created_at DESC',[user?.id||''])});}
 if(key==='collections'&&method==='POST'){const user=await requireUser(req,['teacher','admin']);const b=await body(req);const id=randomUUID();await db.query('INSERT INTO collections(id,owner_id,title,description,published,created_at) VALUES($1,$2,$3,$4,$5,$6)',[id,user.id,text(b,'title',200),text(b,'description',3000),b.published===true?1:0,now()]);await audit(user.id,'collection.create',id,{});return json({id},201);}
 if(path[0]==='collections'&&path.length===2){const u=await currentUser(req);const [collection]=await db.query<{owner_id:string;published:number}>('SELECT c.*,u.name as owner_name FROM collections c JOIN users u ON u.id=c.owner_id WHERE c.id=$1',[path[1]]);if(!collection||!collection.published&&collection.owner_id!==u?.id)throw new HttpError(404,'القائمة غير موجودة');if(method==='GET'){const rows=await db.query<{metadata_json:string}>('SELECT w.metadata_json FROM collection_works cw JOIN works w ON w.id=cw.work_id WHERE cw.collection_id=$1 ORDER BY cw.position',[path[1]]);return json({collection,books:rows.map(r=>JSON.parse(r.metadata_json))});}if(!u||collection.owner_id!==u.id&&u.role!=='admin')throw new HttpError(403,'ليست لديك صلاحية');if(method==='DELETE'){await db.query('DELETE FROM collections WHERE id=$1',[path[1]]);return json({ok:true});}if(method==='PUT'){const b=await body(req);const ids=b.workIds;if(!Array.isArray(ids)||ids.length>200||ids.some(x=>typeof x!=='string'))throw new HttpError(400,'Invalid book selection');await db.transaction(async q=>{await q('DELETE FROM collection_works WHERE collection_id=$1',[path[1]]);for(const [i,id]of [...new Set(ids)].entries())await q('INSERT INTO collection_works(collection_id,work_id,position) VALUES($1,$2,$3)',[path[1],id,i]);});return json({ok:true});}}
 if(path[0]==='admin'){const user=await requireUser(req,['admin']);if(key==='admin/dashboard'&&method==='GET'){const editions=await db.query('SELECT e.*,w.title_ar,r.status as rights_status,r.allow_hosting,r.allow_download,r.evidence,r.license_url,r.attribution,r.expires_at FROM editions e JOIN works w ON w.id=e.work_id JOIN rights_records r ON r.edition_id=e.id ORDER BY e.created_at DESC LIMIT 200');const sources=await db.query<{id:string}>('SELECT * FROM sources ORDER BY name');return json({editions,sources:sources.map(s=>({...s,configured:configuration(s.id)})),jobs:await db.query('SELECT id,type,status,attempts,error,created_at FROM jobs ORDER BY created_at DESC LIMIT 50'),runs:await db.query('SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT 30'),audit:await db.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 40'),users:await db.query('SELECT id,name,email,role FROM users ORDER BY created_at DESC LIMIT 100')});}
 if(key==='admin/discover'&&method==='POST'){const b=await body(req);const id=text(b,'source',50);if(!Object.hasOwn(sourceNames,id)||id==='local')throw new HttpError(400,'Invalid source');if(typeof b.externalId==='string'&&b.externalId){const remote=await provider(id).getBook(b.externalId);return json(await stageBook(id as SourceId,remote));}return json({jobId:await enqueue('sync',{source:id},`sync:${id}:${randomUUID()}`)},202);}
 if(key==='admin/import'&&method==='POST'){const b=await body(req);if(!b.book||typeof b.book!=='object')throw new HttpError(400,'Missing book');const remote=b.book as RemoteBook;if(remote.files?.length)throw new HttpError(400,'Local JSON imports cannot request remote downloads');if(!Array.isArray((remote.raw as {pages?:unknown})?.pages))throw new HttpError(400,'Local import must contain raw.pages');const staged=await stageBook('local',remote);await audit(user.id,'edition.import',staged.id,{});return json(staged,201);}
 if(path[1]==='editions'&&path.length===4&&method==='POST'){const id=path[2];if(path[3]==='review'){const b=await body(req);await reviewRights(id,{status:text(b,'status',40) as RightsStatus,allowHosting:b.allowHosting===true,allowDownload:b.allowDownload===true,evidence:text(b,'evidence',10000),licenseUrl:typeof b.licenseUrl==='string'?b.licenseUrl.slice(0,1000):'',attribution:typeof b.attribution==='string'?b.attribution.slice(0,3000):'',expiresAt:typeof b.expiresAt==='string'?b.expiresAt:null},user.id);return json({ok:true});}if(path[3]==='ingest'){return json({jobId:await enqueue('ingest',{editionId:id},`ingest:${id}:${randomUUID()}`)},202);}if(path[3]==='publish'){await publishEdition(id,user.id);return json({ok:true});}if(path[3]==='withdraw'){await db.query("UPDATE editions SET status='withdrawn' WHERE id=$1",[id]);await audit(user.id,'edition.withdraw',id,{});return json({ok:true});}}
 if(path[1]==='sources'&&path.length===3&&method==='PUT'){const b=await body(req);const hours=Number(b.scheduleHours);if(!Number.isInteger(hours)||hours<24||hours>720)throw new HttpError(400,'Schedule must be between 24 and 720 hours');if(!configuration(path[2])||path[2]==='local')throw new HttpError(400,'Source is not configured for synchronization');await db.query('UPDATE sources SET enabled=$1,schedule_hours=$2,next_sync_at=$3 WHERE id=$4',[b.enabled===true?1:0,hours,now(),path[2]]);return json({ok:true});}
 if(path[1]==='jobs'&&path.length===3&&method==='POST'){await db.query("UPDATE jobs SET status='queued',attempts=0,available_at=$1,error=NULL,lease_until=NULL WHERE id=$2 AND status='failed'",[now(),path[2]]);return json({ok:true});}
 if(path[1]==='users'&&path.length===3&&method==='PUT'){const b=await body(req);const role=text(b,'role',20);if(!['student','teacher','admin'].includes(role))throw new HttpError(400,'Invalid role');if(path[2]===user.id&&role!=='admin')throw new HttpError(400,'You cannot remove your own administrator access');await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,path[2]]);await audit(user.id,'user.role',path[2],{role});return json({ok:true});}
 if(path[1]==='works'&&path.length===3&&method==='PUT'){const b=await body(req);const work=await getWork(path[2]);if(!work)throw new HttpError(404,'Work not found');const updated:Work={...work,title:text(b,'title',1000),description:text(b,'description',10000),category:text(b,'category',100),editions:undefined};await db.query('UPDATE works SET title_ar=$1,title_normalized=$2,category=$3,metadata_json=$4 WHERE id=$5',[updated.title,(await import('./arabic')).normalizeArabic(updated.title),updated.category,JSON.stringify(updated),work.id]);await audit(user.id,'work.update',work.id,{});return json({ok:true});}
 }
 throw new HttpError(404,'المسار غير موجود');
 }catch(e){if(e instanceof HttpError)return json({error:e.message},e.status);console.error('API request failed',e instanceof Error?e.stack||e.message:'Unknown error');return json({error:'تعذّر إتمام الطلب. تحقّق من الإعدادات أو سجل الخادم.',detail:e instanceof Error?e.message:'Unknown error'},500);}}
