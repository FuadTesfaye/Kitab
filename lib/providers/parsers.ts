import {plainText} from '../arabic';
import type {BookContent,Page} from '../types';
export function textPages(text:string):Page[]{const chunks=text.includes('\f')?text.split('\f'):text.match(/[\s\S]{1,6000}(?:\n|$)/g)||[text];return chunks.filter(x=>x.trim()).map((body,i)=>({seq:i+1,body}));}
export function parseOpenITI(input:string):BookContent{const end=input.indexOf('#META#Header#End#');if(end<0)throw new Error('Missing OpenITI header delimiter');const text=input.slice(end+'#META#Header#End#'.length);const pages:Page[]=[];const sections:BookContent['sections']=[];let body='';let seq=1;for(const line of text.split('\n')){const marker=line.match(/PageV(\d+)P(\d+)/);if(marker){body+=line.replace(/PageV\d+P\d+/g,'');pages.push({seq:seq++,part:marker[1],pageNo:marker[2],body:body.trim()});body='';continue;}const heading=line.match(/^###\s+(\|+)\s*(.*)/);if(heading){sections.push({title:heading[2],seq});body+=heading[2]+'\n';}else body+=line.replace(/^#\s?/, '').replace(/^~~/,'')+'\n';}if(body.trim())pages.push({seq,body:body.trim()});return {pages,sections};}
export function parseTurath(data:unknown):BookContent{const d=data as {pages?:{text?:unknown;vol?:unknown;page?:unknown}[];indexes?:{headings?:{title:string;page:number}[]}};if(!Array.isArray(d.pages))throw new Error('Invalid Turath pages');return {pages:d.pages.map((p,i)=>{if(typeof p.text!=='string')throw new Error('Invalid Turath page text');return {seq:i+1,body:plainText(p.text),part:String(p.vol||''),pageNo:String(p.page||'')};}),sections:(d.indexes?.headings||[]).map(h=>({title:plainText(h.title),seq:h.page+1}))};}
export function parseShamelaJson(data:unknown):BookContent{const d=data as {pages?:Record<string,unknown>[];titles?:Record<string,unknown>[]};if(!Array.isArray(d.pages))throw new Error('Invalid Shamela pages');const seqs=new Map(d.pages.map((p,i)=>[Number(p.id),i+1]));return {pages:d.pages.map((p,i)=>{const body=p.content??p.body;if(typeof body!=='string')throw new Error('Invalid Shamela page');return {seq:i+1,body:plainText(body),footnotes:typeof p.footnotes==='string'?plainText(p.footnotes):'',part:String(p.part||''),pageNo:String(p.page??p.page_number??'')};}),sections:(d.titles||[]).map(t=>({title:plainText(String(t.content||t.title||'')),seq:seqs.get(Number(t.page))||Number(t.page)||1}))};}
/** Parse Tanzil's numbered Uthmani export without altering verse text. */
export function parseTanzil(input:string):BookContent{
 const pages:Page[]=[];const sections:BookContent['sections']=[];let previousSurah=0;let expectedAyah=1;
 for(const line of input.replace(/^\uFEFF/,'').split(/\r?\n/)){
  if(!line.trim()||line.startsWith('#'))continue;
  const match=line.match(/^(\d{1,3})\|(\d{1,3})\|(.+)$/u);if(!match)throw new Error('Unexpected line in Tanzil export');
  const surah=Number(match[1]),ayah=Number(match[2]),body=match[3];
  if(surah<1||surah>114||surah<previousSurah)throw new Error('Tanzil verse sequence is incomplete or out of order');
  if(surah!==previousSurah){if(surah!==previousSurah+1||ayah!==1)throw new Error('Tanzil surah sequence is incomplete');sections.push({title:`سورة ${surah}`,seq:pages.length+1});previousSurah=surah;expectedAyah=1;}
  if(ayah!==expectedAyah)throw new Error('Tanzil verse sequence is incomplete or out of order');
  pages.push({seq:pages.length+1,part:String(surah),pageNo:String(ayah),body});expectedAyah++;
 }
 if(pages.length!==6236||previousSurah!==114||pages.at(-1)?.pageNo!=='6')throw new Error(`Tanzil export validation failed: expected 6,236 verses, got ${pages.length}`);
 return {pages,sections};
}
export function parseTSV(text:string):Record<string,string>[]{const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&(quoted||cell==='')){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c==='\t'&&!quoted){row.push(cell);cell='';}else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell);rows.push(row);}if(quoted)throw new Error('Unterminated quoted TSV field');const headers=rows.shift()||[];return rows.filter(r=>r.length===headers.length).map(r=>Object.fromEntries(headers.map((h,i)=>[h.replace(/^\uFEFF/,''),r[i]])));}
// Dataset paths use Python string lists. Parse strings only; never evaluate Python/JS.
export function parsePaths(value:string):string[]{try{const parsed=JSON.parse(value);if(Array.isArray(parsed))return parsed.filter(x=>typeof x==='string');}catch{}const result:string[]=[];const re=/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g;let m;while((m=re.exec(value)))result.push((m[1]??m[2]).replace(/\\(['"\\])/g,'$1'));return result;}
