import {createHash,randomUUID} from 'node:crypto';
import {database,type Query} from './db';
import {books as samples,categories} from '../src/books.js';
import {normalizeArabic} from './arabic';
import {sourceNames} from './providers';
import {mayHost} from './rights';
import type {RemoteBook,SourceId,Work,Edition} from './types';
export const now=()=>new Date().toISOString();
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export const matchKey=(title:string,authors:string[])=>digest(normalizeArabic(title)+'|'+authors.map(normalizeArabic).sort().join('|'));
let seeded:Promise<void>|undefined;
export function ensureSeed(){if(!seeded)seeded=seed().catch(e=>{seeded=undefined;throw e;});return seeded;}
async function seed(){const db=await database();await db.transaction(async q=>{for(const c of categories)if(c.id!=='all')await q('INSERT INTO categories(id,name_ar) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[c.id,c.name]);for(const [id,name]of Object.entries(sourceNames))await q('INSERT INTO sources(id,name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[id,name]);for(const b of samples){const key=matchKey(b.title,[b.fullAuthor]);const work={...b} as Work;await q('INSERT INTO works(id,title_ar,title_normalized,match_key,category,metadata_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(match_key) DO NOTHING',[b.id,b.title,normalizeArabic(b.title),key,b.category,JSON.stringify(work),now()]);await linkAuthors(q,b.id,[b.fullAuthor],b.death);await q('INSERT INTO work_categories(work_id,category_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[b.id,b.category]);}});}
async function linkAuthors(q:Query,workId:string,names:string[],death:number|null=null){for(const name of names){const normalized=normalizeArabic(name);const id=digest(normalized).slice(0,32);await q('INSERT INTO authors(id,name_ar,name_normalized,death_hijri) VALUES($1,$2,$3,$4) ON CONFLICT(name_normalized) DO NOTHING',[id,name,normalized,death]);await q('INSERT INTO work_authors(work_id,author_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[workId,id]);}}
export function categoryFor(values:string[]){const normalized=normalizeArabic(values.join(' '));return categories.find(c=>c.id!=='all'&&normalizeArabic(c.name).split(' ').some(w=>w.length>3&&normalized.includes(w)))?.id||'other';}
export async function stageBook(source:SourceId,b:RemoteBook){await ensureSeed();if(!b.externalId||!b.title||!b.revision||!Array.isArray(b.authors)||!Array.isArray(b.files))throw new Error('Invalid remote book');if(b.title.length>1000||b.externalId.length>2000||b.files.length>1000)throw new Error('Remote metadata is too large');const db=await database();return db.transaction(async q=>{const exists=await q<{id:string}>('SELECT id FROM editions WHERE source_id=$1 AND external_id=$2 AND revision=$3',[source,b.externalId,b.revision]);if(exists[0])return {id:exists[0].id,created:false};const key=matchKey(b.title,b.authors);let [existing]=await q<{id:string}>('SELECT id FROM works WHERE match_key=$1',[key]);const workId=existing?.id||randomUUID();const category=categoryFor(b.categories);if(!existing){const work:Work={id:workId,title:b.title,author:b.authors.join('، ')||'مؤلف غير محدد',fullAuthor:b.authors.join('، '),death:null,category,color:['forest','sand','burgundy','blue','olive'][parseInt(key.slice(0,2),16)%5],description:b.description||'',topics:b.categories,chapters:[]};await q('INSERT INTO works(id,title_ar,title_normalized,match_key,category,metadata_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(match_key) DO NOTHING',[workId,b.title,normalizeArabic(b.title),key,category,JSON.stringify(work),now()]);[existing]=await q<{id:string}>('SELECT id FROM works WHERE match_key=$1',[key]);await linkAuthors(q,existing.id,b.authors);}
 const editionId=digest(`${source}:${b.externalId}:${b.revision}`);const target=existing?.id||workId;await q('INSERT INTO editions(id,work_id,source_id,external_id,revision,publisher,editor,publication_year,created_at,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING',[editionId,target,source,b.externalId,b.revision,b.publisher||'',b.editor||'',b.year||null,now(),b.sourceUrl]);await q('INSERT INTO source_records(id,source_id,external_id,edition_id,revision,raw_json,discovered_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[editionId,source,b.externalId,editionId,b.revision,JSON.stringify(b),now()]);const attribution=source==='local'&&b.externalId.startsWith('tanzil:')?'Tanzil Quran Text, Copyright © 2007–2021 Tanzil Project. Source: https://tanzil.net/ . Verbatim text; unmodified.': '';await q('INSERT INTO rights_records(id,edition_id,license_url,attribution,evidence) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[randomUUID(),editionId,b.licenseUrl||'',attribution,b.rightsHint||'']);return {id:editionId,created:true};});}
export function mapAljam3Category(catName?: string): string {
  const c = catName || '';
  if (c.includes('قرآن') || c.includes('تفسير') || c.includes('قراءات') || c.includes('تنزيل')) return 'quran';
  if (c.includes('حديث') || c.includes('أثر') || c.includes('مصطلح') || c.includes('أجزاء')) return 'hadith';
  if (c.includes('فقه') || c.includes('أصول') || c.includes('قواعد') || c.includes('قضاء') || c.includes('فرائض') || c.includes('معاملات')) return 'fiqh';
  if (c.includes('عقيدة') || c.includes('توحيد') || c.includes('إيمان') || c.includes('فرق') || c.includes('ملل') || c.includes('ردود')) return 'aqeedah';
  if (c.includes('سيرة') || c.includes('تاريخ') || c.includes('تراجم') || c.includes('أعلام') || c.includes('طبقات') || c.includes('بلدان') || c.includes('رحلات')) return 'seerah';
  if (c.includes('لغة') || c.includes('نحو') || c.includes('صرف') || c.includes('بلاغة') || c.includes('معاجم') || c.includes('أدب') || c.includes('شعر')) return 'arabic';
  if (c.includes('أدب') || c.includes('رقاق') || c.includes('أذكار') || c.includes('زهد') || c.includes('تربية') || c.includes('أخلاق')) return 'adab';
  return 'other';
}

export async function works(): Promise<Work[]>{
  try{
    await ensureSeed();
    const db=await database();
    const records=await db.query<{id:string;metadata_json:string}>('SELECT id,metadata_json FROM works ORDER BY created_at DESC');
    const publishedEditions=await db.query<Edition & {allow_hosting:number;expires_at:string}>("SELECT e.*,r.status as rights_status,r.allow_hosting,r.license_url,r.attribution,r.expires_at FROM editions e JOIN rights_records r ON r.edition_id=e.id WHERE e.status='published' ORDER BY e.created_at DESC");
    const editionMap=new Map<string,Edition[]>();
    for(const e of publishedEditions){
      if(mayHost({status:e.rights_status||'',allow_hosting:e.allow_hosting,expires_at:e.expires_at})){
        const list=editionMap.get(e.work_id)||[];
        list.push({...e});
        editionMap.set(e.work_id,list);
      }
    }
    const dbWorks=records.map(r=>{
      const w=JSON.parse(r.metadata_json) as Work;
      return {...w,id:r.id,editions:editionMap.get(r.id)||[]};
    });

    let extraWorks: Work[] = [];
    try {
      const {getBooksDataset} = await import('./providers/aljam3');
      const aljam3Books = await getBooksDataset();
      const colors = ['forest','sand','burgundy','blue','olive','terracotta','navy','plum'];
      extraWorks = aljam3Books.map((b, idx) => {
        const cat = mapAljam3Category(b.category?.name);
        const source_id: SourceId = (b.library?.name?.includes('النبوي') ? 'prophet-mosque' : (b.library?.name?.includes('الوقفية') ? 'waqfeya' : 'shamela'));
        const edition: Edition = {
          id: `aljam3-${b.id}`,
          work_id: `aljam3-${b.id}`,
          source_id,
          external_id: String(b.id),
          revision: '1',
          publisher: b.library?.name || 'المكتبة الإسلامية',
          editor: '',
          publication_year: null,
          status: 'published',
          created_at: new Date().toISOString(),
          page_count: b.pages_count || 1,
          source_url: b.pdf_url || `/api/aljam3/pdf?id=${b.id}`,
          attribution: b.library?.name || 'مكتبة الجامع والشاملة'
        };
        return {
          id: `aljam3-${b.id}`,
          title: b.title,
          author: b.author?.name || 'من علماء الإسلام',
          fullAuthor: b.author?.name || 'من علماء الإسلام',
          death: null,
          category: cat,
          color: colors[idx % colors.length],
          tag: b.library?.name || 'المكتبة الإسلامية',
          description: `كتاب «${b.title}» تأليف: ${b.author?.name || 'من علماء الإسلام'}. من نفائس ${b.library?.name || 'المكتبة الإسلامية'} (${b.pages_count || 'متعدد'} صفحة). متاح للقراءة والتحميل المباشر بصيغة PDF ونصوص TXT و JSON.`,
          topics: [b.category?.name || 'علوم شرعية', b.library?.name || 'المكتبة الإسلامية'].filter(Boolean),
          chapters: [],
          editions: [edition]
        };
      });
    } catch (e) {
      console.warn('Could not load aljam3 dataset for works:', e);
    }

    const all = [...dbWorks, ...extraWorks];
    if(all.length > 0) return all;
  }catch(e){
    console.error('Failed to load works from database, serving samples:',e);
  }
  return samples.map(s=>({...s,editions:[]}));
}

export async function getWork(id:string){
  if (id.startsWith('aljam3-')) {
    const numId = Number(id.replace('aljam3-', ''));
    try {
      const {getBooksDataset} = await import('./providers/aljam3');
      const all = await getBooksDataset();
      const b = all.find(x => x.id === numId);
      if (b) {
        const cat = mapAljam3Category(b.category?.name);
        const source_id: SourceId = (b.library?.name?.includes('النبوي') ? 'prophet-mosque' : (b.library?.name?.includes('الوقفية') ? 'waqfeya' : 'shamela'));
        const edition: Edition = {
          id: `aljam3-${b.id}`,
          work_id: `aljam3-${b.id}`,
          source_id,
          external_id: String(b.id),
          revision: '1',
          publisher: b.library?.name || 'المكتبة الإسلامية',
          editor: '',
          publication_year: null,
          status: 'published',
          created_at: new Date().toISOString(),
          page_count: b.pages_count || 1,
          source_url: b.pdf_url || `/api/aljam3/pdf?id=${b.id}`,
          attribution: b.library?.name || 'مكتبة الجامع والشاملة'
        };
        return {
          id: `aljam3-${b.id}`,
          title: b.title,
          author: b.author?.name || 'من علماء الإسلام',
          fullAuthor: b.author?.name || 'من علماء الإسلام',
          death: null,
          category: cat,
          color: ['forest','sand','burgundy','blue','olive','terracotta','navy','plum'][b.id % 8],
          tag: b.library?.name || 'المكتبة الإسلامية',
          description: `كتاب «${b.title}» تأليف: ${b.author?.name || 'من علماء الإسلام'}. من نفائس ${b.library?.name || 'المكتبة الإسلامية'} (${b.pages_count || 'متعدد'} صفحة). متاح للقراءة والتحميل المباشر بصيغة PDF.`,
          topics: [b.category?.name || 'علوم شرعية', b.library?.name || 'المكتبة الإسلامية'].filter(Boolean),
          chapters: [],
          editions: [edition]
        } as Work;
      }
    } catch {}
  }
  try{
    await ensureSeed();
    const db=await database();
    const [row]=await db.query<{metadata_json:string}>('SELECT metadata_json FROM works WHERE id=$1',[id]);
    if(row){
      const editions=await db.query<Edition & {allow_hosting:number;expires_at:string}>('SELECT e.*,r.status as rights_status,r.allow_hosting,r.license_url,r.attribution,r.expires_at FROM editions e JOIN rights_records r ON r.edition_id=e.id WHERE e.work_id=$1 ORDER BY e.created_at DESC',[id]);
      return {...JSON.parse(row.metadata_json),id,editions:editions.filter(e=>e.status==='published'&&mayHost({status:e.rights_status||'',allow_hosting:e.allow_hosting,expires_at:e.expires_at}))} as Work;
    }
  }catch(e){
    console.error(`Failed to getWork(${id}):`,e);
  }
  const sample=samples.find(s=>s.id===id);
  return sample?{...sample,editions:[]} as Work:null;
}
export async function audit(userId:string|null,action:string,target:string,details:unknown){const db=await database();await db.query('INSERT INTO audit_log(id,user_id,action,target_id,details,created_at) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),userId,action,target,JSON.stringify(details),now()]);}
export async function accessibleEdition(id:string,download=false){
  if (id.startsWith('aljam3-')) {
    const numId = Number(id.replace('aljam3-', ''));
    return {
      id,
      work_id: id,
      source_id: 'shamela',
      external_id: String(numId),
      revision: '1',
      publisher: 'مكتبة الجامع والشاملة',
      editor: '',
      publication_year: null,
      status: 'published',
      created_at: new Date().toISOString(),
      page_count: 100,
      source_url: `/api/aljam3/pdf?id=${numId}`,
      attribution: 'مكتبة الجامع والشاملة'
    } as Edition;
  }
  const db=await database();
  const [r]=await db.query<Edition & {allow_hosting:number;allow_download:number;expires_at:string}>('SELECT e.*,r.status AS rights_status,r.allow_hosting,r.allow_download,r.expires_at,r.license_url,r.attribution FROM editions e JOIN rights_records r ON r.edition_id=e.id WHERE e.id=$1',[id]);
  return r&&r.status==='published'&&mayHost({status:r.rights_status||'',allow_hosting:r.allow_hosting,expires_at:r.expires_at})&&(!download||Number(r.allow_download)===1)?r:null;
}
