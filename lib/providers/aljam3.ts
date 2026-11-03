import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';

export interface Aljam3Book {
  id: number;
  title: string;
  author: {
    id: number;
    name: string;
    books_count?: number;
  };
  category: {
    id: number;
    name: string;
    books_count?: number;
  };
  library: {
    id: number;
    name: string;
    books_count?: number;
  };
  pages_count: number;
  files_count: number;
  views_count?: number;
  volumes?: number;
  pdf_url?: string;
  txt_url?: string;
  docx_url?: string;
}

export interface Aljam3File {
  id: number;
  name: string;
  pages_count: number;
  urls: {
    pdf: string;
    docx?: string;
    txt?: string;
  };
}

export interface Aljam3BookDetail extends Aljam3Book {
  files?: Aljam3File[];
}

export interface Aljam3ListResponse {
  pagination: {
    from: number;
    to: number;
    count: number;
    current_page: number;
    total_pages: number;
    limit: number;
  };
  books: Aljam3Book[];
}

const ALJAM3_API_BASE = 'https://aljam3.com/api/v1';

export async function listAljam3Books(options: {
  page?: number;
  limit?: number;
  library?: number; // 3: Shamela Waqfeya, 2: Waqfeya, 1: Prophet's Mosque
  category?: number;
  q?: string;
} = {}): Promise<Aljam3ListResponse> {
  const {page = 1, limit = 20, library, category, q} = options;
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit)
  });
  if (library) params.set('library', String(library));
  if (category) params.set('category', String(category));
  if (q) params.set('q', q);

  const res = await fetch(`${ALJAM3_API_BASE}/books?${params.toString()}`, {
    headers: {'User-Agent': 'KitabsLibrary/2.0'},
    signal: AbortSignal.timeout(20000)
  });

  if (!res.ok) {
    throw new Error(`Failed to list Aljam3 books: HTTP ${res.status}`);
  }

  return res.json() as Promise<Aljam3ListResponse>;
}

export async function getAljam3Book(id: number): Promise<Aljam3BookDetail> {
  const res = await fetch(`${ALJAM3_API_BASE}/books/${id}?expand=files`, {
    headers: {'User-Agent': 'KitabsLibrary/2.0'},
    signal: AbortSignal.timeout(20000)
  });

  if (!res.ok) {
    throw new Error(`Failed to get Aljam3 book ${id}: HTTP ${res.status}`);
  }

  return res.json() as Promise<Aljam3BookDetail>;
}

export async function getBooksDataset(): Promise<Aljam3Book[]> {
  const path1500 = resolve('data/shamela/1500-books.json');
  if (existsSync(path1500)) {
    const text = await readFile(path1500, 'utf8');
    return JSON.parse(text) as Aljam3Book[];
  }
  const path500 = resolve('data/shamela/500-books.json');
  if (existsSync(path500)) {
    const text = await readFile(path500, 'utf8');
    return JSON.parse(text) as Aljam3Book[];
  }
  return [];
}

export const get500Books = getBooksDataset;

export async function getBookPdfUrl(id: number): Promise<string | null> {
  // Check local dataset first
  const books = await getBooksDataset();
  const found = books.find(b => b.id === id);
  if (found?.pdf_url) return found.pdf_url;

  // Otherwise query live Aljam3 API
  try {
    const detail = await getAljam3Book(id);
    const pdf = detail.files?.[0]?.urls?.pdf;
    return pdf || null;
  } catch {
    return null;
  }
}
