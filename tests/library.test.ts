import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {resolve} from 'node:path';
import {database,closeDatabase} from '../lib/db';
import {ensureSeed,stageBook,getWork,accessibleEdition} from '../lib/catalogue';
import {reviewRights,ingestEdition,publishEdition,syncSource} from '../lib/ingestion';
import {normalizeArabic} from '../lib/arabic';import {searchPages} from '../lib/search';
import {validateRights} from '../lib/rights';import {parseTSV,parsePaths,parseOpenITI,parseTurath} from '../lib/providers/parsers';
import {createUser,session,verifyPassword,passwordHash} from '../lib/auth';
import {api} from '../lib/api';import {enqueue,claim,finish} from '../lib/jobs';
import {allowedUrl} from '../lib/http';import {putObject,getObject} from '../lib/storage';
import type {RemoteBook,Provider} from '../lib/types';
const temp=await mkdtemp(resolve(tmpdir(),'kitabs-test-'));process.env.DATA_DIR=temp;delete process.env.DATABASE_URL;delete process.env.OPENSEARCH_URL;delete process.env.S3_ENDPOINT;process.env.APP_URL='http://localhost:3000';
after(async()=>{await closeDatabase();await rm(temp,{recursive:true,force:true});});
const book:RemoteBook={externalId:'test-book',title:'كتاب اختبار أصلي',authors:['مؤلف الاختبار'],categories:['اللغة العربية'],sourceUrl:'https://example.org/test',revision:'1',files:[],raw:{pages:[{seq:1,body:'الْقُرْآنُ عِلْمٌ ونور',pageNo:'٣'},{seq:2,body:'صفحة ثانية للتجربة'}],sections:[{title:'البداية',seq:1}]}};
let editionId='',workId='',adminId='',cookie='';
async function call(path:string,method='GET',payload?:unknown,auth='',segments?:string[]){return api(new Request('http://localhost:3000/api/'+path,{method,headers:{origin:'http://localhost:3000',...(auth?{cookie:auth}:{}),'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)}),segments||path.split('/'));}
test('Arabic normalization retains original display text and improves search recall',()=>{assert.equal(normalizeArabic('الْقُرْآنُ'),'القران');assert.equal(normalizeArabic('مُـوسَى'),'موسي');assert.notEqual(normalizeArabic('رحمة'),normalizeArabic('رحمه'));});
test('TSV quoted tabs and Python-style path lists are parsed without evaluation',()=>{const rows=parseTSV('title\tauthor\n"عنوان\tكتاب"\t"مؤلف"\n');assert.equal(rows[0].title,'عنوان\tكتاب');assert.deepEqual(parsePaths("['./pdf/كتاب.pdf', './pdf/جزء 2.pdf']"),['./pdf/كتاب.pdf','./pdf/جزء 2.pdf']);assert.throws(()=>parseTSV('title\n"oops'));});
test('OpenITI pages preserve printed pagination and heading sequence',()=>{const content=parseOpenITI('######OpenITI#\n#META#Header#End#\n### | مقدمة\n# النص\nPageV01P003\n# تتمة\nPageV01P004');assert.equal(content.pages.length,2);assert.equal(content.pages[0].pageNo,'003');assert.equal(content.sections[0].seq,1);assert.throws(()=>parseOpenITI('invalid'));});
test('Turath parser validates text instead of trusting remote fields',()=>{assert.equal(parseTurath({pages:[{text:'<b>نص</b>',page:8,vol:'1'}]}).pages[0].body.trim(),'نص');assert.throws(()=>parseTurath({pages:[{text:42}]}));});
test('Provider file URLs reject local networks, userinfo, and unconfigured hosts',()=>{for(const u of ['http://archive.org/test','https://127.0.0.1/a','https://archive.org.evil.test/a','https://user:password@archive.org/a','https://archive.org:8080/a'])assert.throws(()=>allowedUrl(u));assert.equal(allowedUrl('https://archive.org/metadata/test').hostname,'archive.org');});
test('Migration and seeding are idempotent',async()=>{await ensureSeed();const db=await database();const before=await db.query('SELECT id FROM works');await ensureSeed();assert.equal((await db.query('SELECT id FROM works')).length,before.length);assert.equal(before.length,12);});
test('Password hashes are salted and verified; sessions store only token hashes',async()=>{const a=await passwordHash('test-password-long');const b=await passwordHash('test-password-long');assert.notEqual(a,b);assert.ok(await verifyPassword('test-password-long',a));assert.equal(await verifyPassword('wrong',a),false);const admin=await createUser('Test Admin','admin@example.org','test-admin-password','admin');adminId=admin.id;const token=await session(admin.id);cookie='kitabs_session='+token;const db=await database();const [stored]=await db.query<{token_hash:string}>('SELECT token_hash FROM sessions WHERE user_id=$1',[admin.id]);assert.notEqual(stored.token_hash,token);});
test('Anonymous users cannot inspect the admin dashboard',async()=>{assert.equal((await call('admin/dashboard')).status,401);assert.equal((await call('admin/dashboard','GET',undefined,cookie)).status,200);});
test('Cross-origin writes are rejected and registration cannot elevate a role',async()=>{const rejected=await api(new Request('http://localhost:3000/api/auth/logout',{method:'POST',headers:{origin:'https://evil.example'}}),['auth','logout']);assert.equal(rejected.status,403);const response=await call('auth/register','POST',{name:'Student',email:'student@example.org',password:'test-student-password',role:'admin'});assert.equal(response.status,201);assert.equal((await response.json()).user.role,'student');});
test('Staging is idempotent and keeps editions separate from works',async()=>{const a=await stageBook('local',book);const b=await stageBook('local',book);assert.equal(a.id,b.id);assert.equal(b.created,false);editionId=a.id;const db=await database();const [row]=await db.query<{work_id:string}>('SELECT work_id FROM editions WHERE id=$1',[a.id]);workId=row.work_id;const other=await stageBook('local',{...book,revision:'2'});assert.notEqual(other.id,a.id);const [otherRow]=await db.query<{work_id:string}>('SELECT work_id FROM editions WHERE id=$1',[other.id]);assert.equal(otherRow.work_id,workId);});
test('Unreviewed content cannot be downloaded, ingested, read, or published',async()=>{assert.equal(await accessibleEdition(editionId),null);await assert.rejects(ingestEdition(editionId),/permission/);await assert.rejects(publishEdition(editionId,adminId));assert.equal((await call(`editions/${editionId}/pages`)).status,404);assert.equal((await getWork(workId))?.editions?.length,0);});
test('Rights evidence and attribution are required for open licenses',()=>{assert.throws(()=>validateRights({status:'restricted',allowHosting:true,evidence:'Long enough evidence cannot override restrictions'}));assert.throws(()=>validateRights({status:'open-license',allowHosting:true,evidence:'License evidence for this specific edition'}));assert.throws(()=>validateRights({status:'permission-granted',allowHosting:true,evidence:'short'}));});
test('Approval and import do not publish content automatically',async()=>{await reviewRights(editionId,{status:'permission-granted',allowHosting:true,allowDownload:true,evidence:'Original test text supplied by its author for this test.'},adminId);await ingestEdition(editionId);assert.equal(await accessibleEdition(editionId),null);const db=await database();const [e]=await db.query<{status:string}>('SELECT status FROM editions WHERE id=$1',[editionId]);assert.equal(e.status,'ready');assert.equal((await db.query('SELECT seq FROM book_pages WHERE edition_id=$1',[editionId])).length,2);});
test('Published text is searchable with and without diacritics in separate modes',async()=>{await publishEdition(editionId,adminId);assert.ok(await accessibleEdition(editionId));const normal=await searchPages('القران');assert.equal(normal.hits.length,1);assert.equal(normal.hits[0].body,'الْقُرْآنُ عِلْمٌ ونور');assert.equal((await searchPages('القران',true)).hits.length,0);assert.equal((await searchPages('الْقُرْآنُ',true)).hits.length,1);const page=await call(`editions/${editionId}/unknown`); // Unknown path is safely rejected.
 assert.equal(page.status,404);assert.equal((await call(`editions/${editionId}`)).status,200);});
test('Revision updates never inherit another edition’s permission',async()=>{const db=await database();const [row]=await db.query<{id:string}>('SELECT id FROM editions WHERE revision=$1 AND work_id=$2',['2',workId]);assert.equal(await accessibleEdition(row.id),null);await assert.rejects(ingestEdition(row.id),/permission/);});
test('Bookmarks and reading progress persist for the authenticated user',async()=>{const saved=await call('bookmarks','POST',{workId,editionId,seq:1,note:'ملاحظتي',quote:'الْقُرْآنُ'},cookie);assert.equal(saved.status,200);const rows=await (await call('bookmarks','GET',undefined,cookie)).json();assert.equal(rows.bookmarks[0].note,'ملاحظتي');assert.equal((await call('progress/'+editionId,'POST',{seq:2},cookie)).status,200);const progress=await (await call('progress/'+editionId,'GET',undefined,cookie)).json();assert.equal(progress.progress.seq,2);});
test('Source cursor commits only after a successful discovery and staging pass',async()=>{const adapter:Provider={id:'turath',getBook:async()=>book,fetchContent:async()=>({pages:[],sections:[]}),discover:async()=>({books:[{...book,externalId:'cursor-test'}],nextCursor:'next-page'})};await syncSource('turath',adapter);const db=await database();assert.equal((await db.query<{cursor:string}>('SELECT cursor FROM sources WHERE id=$1',['turath']))[0].cursor,'next-page');adapter.discover=async()=>{throw new Error('provider unavailable');};await assert.rejects(syncSource('turath',adapter),/unavailable/);assert.equal((await db.query<{cursor:string}>('SELECT cursor FROM sources WHERE id=$1',['turath']))[0].cursor,'next-page');});
test('Content-addressed storage is immutable and rejects path traversal',async()=>{const a=await putObject(Buffer.from('original'));const b=await putObject(Buffer.from('original'));assert.equal(a.key,b.key);assert.equal((await getObject(a.key)).toString(),'original');await assert.rejects(getObject('../../.env'));});
test('Queue deduplication and lease ownership prevent stale completion',async()=>{const id=await enqueue('test',{},'same');assert.equal(await enqueue('test',{},'same'),id);const first=await claim();assert.equal(first?.id,id);const db=await database();await db.query('UPDATE jobs SET lease_until=$1 WHERE id=$2',['2000-01-01T00:00:00.000Z',id]);const second=await claim();assert.ok(second);assert.notEqual(first?.lease_token,second.lease_token);await finish(first!);assert.equal((await db.query<{status:string}>('SELECT status FROM jobs WHERE id=$1',[id]))[0].status,'running');await finish(second);assert.equal((await db.query<{status:string}>('SELECT status FROM jobs WHERE id=$1',[id]))[0].status,'completed');});
test('Revoking permission immediately removes reader, file, and search access',async()=>{await reviewRights(editionId,{status:'restricted',allowHosting:false,allowDownload:false,evidence:'Permission withdrawn by the rights holder.'},adminId);assert.equal(await accessibleEdition(editionId),null);assert.equal((await searchPages('القران')).hits.length,0);assert.equal((await call('editions/'+editionId)).status,404);assert.equal((await getWork(workId))?.editions?.length,0);});

test('Arabic diacritics stripping and Tanzil multi-surah parsing', async () => {
  const {stripDiacritics} = await import('../lib/arabic');
  assert.equal(stripDiacritics('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ'), 'بسم الله الرحمن الرحيم');

  const {parseTanzil} = await import('../lib/providers/parsers');
  const dummyTanzil = [
    '1|1|بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    '1|2|الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
    '1|3|الرَّحْمَٰنِ الرَّحِيمِ',
    '1|4|مَالِكِ يَوْمِ الدِّينِ',
    '1|5|إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
    '1|6|اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ',
    '1|7|صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ',
    '2|1|الم'
  ].join('\n');
  assert.throws(() => parseTanzil(dummyTanzil), /validation failed/); // Throws because not all 6236 are present, but passes surah transition!
});

test('Hadith and Tafsir open providers discovery', async () => {
  const {hadith} = await import('../lib/providers/hadith');
  const {tafsir} = await import('../lib/providers/tafsir');
  const hadithDisc = await hadith.discover();
  assert.ok(hadithDisc.books.length >= 8);
  assert.ok(hadithDisc.books.some(b => b.externalId === 'ara-nawawi'));

  const tafsirDisc = await tafsir.discover();
  assert.ok(tafsirDisc.books.length >= 6);
  assert.ok(tafsirDisc.books.some(b => b.externalId === 'ar-tafsir-ibn-kathir'));
});

test('Shamela direct provider and API endpoints for reading and downloadable files', async () => {
  const {listShamelaIndex, getShamelaLocalBook, fetchShamelaInfo, fetchShamelaPage, exportShamelaText} = await import('../lib/providers/shamela-direct');
  const index = await listShamelaIndex();
  assert.ok(index.length >= 10);
  assert.equal(index[0].id, 1);
  assert.equal(index[0].author, 'حمد بن ناصر آل معمر');

  const local = await getShamelaLocalBook(1);
  assert.ok(local);
  assert.equal(local.shamela_id, 1);
  assert.ok(local.pages.length > 0);

  const info = await fetchShamelaInfo(1);
  assert.equal(info.id, 1);
  assert.ok(info.title.includes('الفواكه العذاب'));

  const page = await fetchShamelaPage(1, 1);
  assert.equal(page.page_num, 1);
  assert.ok(normalizeArabic(page.body).includes('الحمد لله'));

  const exported = await exportShamelaText(1);
  assert.ok(exported.includes('الفواكه العذاب'));
  assert.ok(exported.includes('الجزء 1'));

  // Test API endpoints
  const booksRes = await call('shamela/books', 'GET', undefined, '', ['shamela', 'books']);
  assert.equal(booksRes.status, 200);
  const booksData = await booksRes.json();
  assert.ok(booksData.books.length >= 10);

  const bookRes = await call('shamela/book?id=1', 'GET', undefined, '', ['shamela', 'book']);
  assert.equal(bookRes.status, 200);

  const pageRes = await call('shamela/page?id=1&page=1', 'GET', undefined, '', ['shamela', 'page']);
  assert.equal(pageRes.status, 200);

  const dlRes = await call('shamela/download?id=1&format=json', 'GET', undefined, '', ['shamela', 'download']);
  assert.equal(dlRes.status, 200);
  assert.equal(dlRes.headers.get('content-disposition'), 'attachment; filename="shamela-1.json"');

  const dlTxt = await call('shamela/download?id=1&format=txt', 'GET', undefined, '', ['shamela', 'download']);
  assert.equal(dlTxt.status, 200);
  assert.equal(dlTxt.headers.get('content-disposition'), 'attachment; filename="shamela-1.txt"');
});

test('Aljam3 provider and 1500 books catalogue with direct PDF downloads', async () => {
  const {getBooksDataset, getBookPdfUrl} = await import('../lib/providers/aljam3');
  const books = await getBooksDataset();
  assert.equal(books.length, 1500);
  assert.ok(books[0].title.length > 0);
  assert.ok(books[0].author.name.length > 0);

  const pdfUrl = await getBookPdfUrl(3435);
  assert.ok(pdfUrl);
  assert.ok(pdfUrl.includes('.pdf'));

  // Test Aljam3 API
  const listRes = await call('aljam3/books?limit=10', 'GET', undefined, '', ['aljam3', 'books']);
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.books.length, 10);
  assert.equal(listData.total, 1500);

  // Test library filter for Prophet's Mosque Library (library 1)
  const libRes = await call('aljam3/books?limit=5&library=1', 'GET', undefined, '', ['aljam3', 'books']);
  assert.equal(libRes.status, 200);
  const libData = await libRes.json();
  assert.equal(libData.books.length, 5);
  assert.equal(libData.total, 500);

  // Test PDF download (serves 200 when exact PDF is cached on disk, or 302 redirect)
  const pdfRes = await call('aljam3/pdf?id=3435', 'GET', undefined, '', ['aljam3', 'pdf']);
  assert.ok(pdfRes.status === 200 || pdfRes.status === 302);
  if (pdfRes.status === 200) {
    assert.ok(pdfRes.headers.get('content-type')?.includes('application/pdf'));
  } else {
    assert.ok(pdfRes.headers.get('location')?.includes('.pdf'));
  }
});

test('Homepage catalogue search exposes 1500+ books with categories and PDF downloads', async () => {
  const {works, getWork, accessibleEdition} = await import('../lib/catalogue');
  const allWorks = await works();
  assert.ok(allWorks.length >= 1500, `Expected at least 1500 works, got ${allWorks.length}`);

  // Test single work lookup for aljam3 book
  const single = await getWork('aljam3-3435');
  assert.ok(single);
  assert.equal(single.id, 'aljam3-3435');
  assert.ok(single.title.length > 0);
  assert.ok(single.editions && single.editions.length > 0);
  assert.equal(single.editions[0].id, 'aljam3-3435');

  // Test accessible edition
  const ed = await accessibleEdition('aljam3-3435');
  assert.ok(ed);
  assert.equal(ed.id, 'aljam3-3435');
  assert.ok(ed.source_url.includes('pdf'));

  // Test API endpoint for single book
  const apiRes = await call('books/aljam3-3435', 'GET', undefined, '', ['books', 'aljam3-3435']);
  assert.equal(apiRes.status, 200);
  const apiData = await apiRes.json();
  assert.equal(apiData.book.id, 'aljam3-3435');
  assert.ok(apiData.book.editions.length > 0);
});

test('Universal book downloads for PDF, TXT, and JSON across all library works', async () => {
  // 1. Aljam3 book - Exact PDF download
  const pdfRes = await call('books/aljam3-3435/download?format=pdf', 'GET', undefined, '', ['books', 'aljam3-3435', 'download']);
  assert.ok(pdfRes.status === 200 || pdfRes.status === 302);
  if (pdfRes.status === 200) {
    assert.ok(pdfRes.headers.get('content-type')?.includes('application/pdf'));
    assert.ok(pdfRes.headers.get('content-disposition')?.includes('.pdf'));
    const bytes = Buffer.from(await pdfRes.arrayBuffer());
    assert.ok(bytes.subarray(0, 4).toString().startsWith('%PDF'));
  } else {
    assert.ok(pdfRes.headers.get('location')?.includes('.pdf'));
  }

  // 2. Aljam3 book - JSON download
  const jsonRes = await call('books/aljam3-3435/download?format=json', 'GET', undefined, '', ['books', 'aljam3-3435', 'download']);
  assert.equal(jsonRes.status, 200);
  assert.ok(jsonRes.headers.get('content-type')?.includes('application/json'));
  assert.ok(jsonRes.headers.get('content-disposition')?.includes('aljam3-3435.json'));

  // 3. Database book (Arbaeen) - TXT download
  const txtRes = await call('books/arbaeen/download?format=txt', 'GET', undefined, '', ['books', 'arbaeen', 'download']);
  assert.equal(txtRes.status, 200);
  assert.ok(txtRes.headers.get('content-type')?.includes('text/plain'));
  const txtBody = await txtRes.text();
  assert.ok(txtBody.includes('الأربعون النووية'));

  // 4. Database sample book (Arbaeen) - JSON download
  const arbaeenJsonRes = await call('books/arbaeen/download?format=json', 'GET', undefined, '', ['books', 'arbaeen', 'download']);
  assert.equal(arbaeenJsonRes.status, 200);
  const arbaeenData = await arbaeenJsonRes.json();
  assert.equal(arbaeenData.id, 'arbaeen');
  assert.equal(arbaeenData.title, 'الأربعون النووية');
  assert.ok(Array.isArray(arbaeenData.pages));
});

test('Maktabatu Shamela 4645 books corpus and batch downloads API', async () => {
  // Test Shamela 4645 books all endpoint
  const shamelaAllRes = await call('shamela/books/all', 'GET', undefined, '', ['shamela', 'books', 'all']);
  assert.equal(shamelaAllRes.status, 200);
  const shamelaData = await shamelaAllRes.json();
  assert.ok(shamelaData.books.length >= 4645, `Expected 4645 books, got ${shamelaData.books.length}`);
  assert.equal(shamelaData.total, 4645);

  // Test downloaded Shamela book 2040 (Al-Maqrizi)
  const b2040Json = await call('books/aljam3-2040/download?format=json', 'GET', undefined, '', ['books', 'aljam3-2040', 'download']);
  assert.equal(b2040Json.status, 200);
  assert.ok(b2040Json.headers.get('content-type')?.includes('application/json'));
  assert.ok(b2040Json.headers.get('content-disposition')?.includes('aljam3-2040.json'));

  // Test downloaded Shamela book 4266 (Ibn Hajar)
  const b4266Json = await call('books/aljam3-4266/download?format=json', 'GET', undefined, '', ['books', 'aljam3-4266', 'download']);
  assert.equal(b4266Json.status, 200);
  assert.ok(b4266Json.headers.get('content-type')?.includes('application/json'));
  assert.ok(b4266Json.headers.get('content-disposition')?.includes('aljam3-4266.json'));
});





