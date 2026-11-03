import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {plainText} from '../arabic';

export interface ShamelaIndexEntry {
  id: number;
  title: string;
  author: string;
  author_id?: number;
  death?: number;
  category: string;
  category_id?: number;
  volumes?: number;
  pages?: number;
  download_url?: string;
  description?: string;
}

export interface ShamelaPage {
  page_num: number;
  vol: string;
  body: string;
  headings?: string[];
}

export interface ShamelaFullBook {
  shamela_id: number;
  title: string;
  author: string;
  death?: number;
  category: string;
  source: string;
  source_url: string;
  headings: {title: string; page: number}[];
  pages: ShamelaPage[];
}

export async function listShamelaIndex(): Promise<ShamelaIndexEntry[]> {
  const path = resolve('data/shamela/index.json');
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as ShamelaIndexEntry[];
}

export async function getShamelaLocalBook(id: number): Promise<ShamelaFullBook | null> {
  const exactPath = resolve(`data/shamela/${id}-al-fawakih-al-adhab.json`);
  if (existsSync(exactPath)) {
    return JSON.parse(await readFile(exactPath, 'utf8'));
  }
  const genericPath = resolve(`data/shamela/${id}.json`);
  if (existsSync(genericPath)) {
    return JSON.parse(await readFile(genericPath, 'utf8'));
  }
  return null;
}

export async function fetchShamelaInfo(id: number) {
  // Check local file first
  const local = await getShamelaLocalBook(id);
  if (local) {
    return {
      id: local.shamela_id,
      title: local.title,
      author: local.author,
      category: local.category,
      pageCount: local.pages.length,
      headings: local.headings
    };
  }

  // Fallback to online Turath metadata
  const res = await fetch(`https://api.turath.io/book?id=${id}&include=indexes&ver=3`, {
    signal: AbortSignal.timeout(15000),
    headers: {'User-Agent': 'KitabsLibrary/2.0'}
  });
  if (!res.ok) throw new Error(`Shamela book ${id} not found`);
  const data = await res.json();
  const authorRes = await fetch(`https://api.turath.io/author?id=${data.meta?.author_id}&ver=3`, {
    signal: AbortSignal.timeout(15000),
    headers: {'User-Agent': 'KitabsLibrary/2.0'}
  }).catch(() => null);
  const authorData = authorRes?.ok ? await authorRes.json() : null;

  return {
    id,
    title: plainText(data.meta?.name || `كتاب ${id}`),
    author: plainText(authorData?.name || 'مؤلف من الشاملة'),
    authorBio: authorData?.biography || '',
    category: 'المكتبة الشاملة',
    pageCount: data.meta?.pages_count || 100,
    headings: (data.indexes?.headings || []).map((h: any) => ({
      title: plainText(h.title),
      page: h.page + 1
    }))
  };
}

export async function fetchShamelaPage(id: number, page: number): Promise<ShamelaPage> {
  // Check local file first
  const local = await getShamelaLocalBook(id);
  if (local) {
    const found = local.pages.find(p => p.page_num === page) || local.pages[page - 1] || local.pages[0];
    return found;
  }

  // Fallback to Turath page
  const res = await fetch(`https://api.turath.io/page?book_id=${id}&pg=${page}&ver=3`, {
    signal: AbortSignal.timeout(15000),
    headers: {'User-Agent': 'KitabsLibrary/2.0'}
  });
  if (!res.ok) throw new Error(`Shamela page ${page} not found`);
  const data = await res.json();
  const meta = typeof data.meta === 'string' ? JSON.parse(data.meta) : (data.meta || {});
  return {
    page_num: page,
    vol: String(meta.vol || '1'),
    body: plainText(data.text || ''),
    headings: meta.headings || []
  };
}

export async function exportShamelaText(id: number): Promise<string> {
  const local = await getShamelaLocalBook(id);
  if (local) {
    const header = `====================================\n${local.title}\nالمؤلف: ${local.author}\nالمصدر: ${local.source}\n====================================\n\n`;
    const pages = local.pages.map(p => `--- [الجزء ${p.vol} | الصفحة ${p.page_num}] ---\n\n${p.body}\n`).join('\n\n');
    return header + pages;
  }
  const info = await fetchShamelaInfo(id);
  const page1 = await fetchShamelaPage(id, 1);
  return `====================================\n${info.title}\nالمؤلف: ${info.author}\nالمصدر: المكتبة الشاملة v4\n====================================\n\n--- [الصفحة 1] ---\n\n${page1.body}\n`;
}
