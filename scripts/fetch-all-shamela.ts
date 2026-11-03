import fs from 'node:fs';
import path from 'node:path';

const OUT_PATH = path.resolve(process.cwd(), 'data/shamela/shamela-all-books.json');
const BASE_URL = 'https://aljam3.com/api/v1';

async function fetchPage(page: number, limit = 100) {
  const url = `${BASE_URL}/books?library=3&limit=${limit}&page=${page}`;
  const res = await fetch(url, {
    headers: {'User-Agent': 'Kitabs/2.0'},
    signal: AbortSignal.timeout(30000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
  return res.json();
}

export async function fetchAllShamelaBooks() {
  console.log('[Shamela] Fetching full catalogue of Al-Maktaba Al-Shamela (Library 3)...');
  const first = await fetchPage(1, 100);
  const totalBooks = first.pagination.count;
  const totalPages = first.pagination.total_pages;
  console.log(`[Shamela] Found ${totalBooks} books across ${totalPages} pages.`);

  const allRawBooks = [...first.books];

  // Fetch remaining pages in concurrent chunks
  const concurrency = 4;
  for (let i = 2; i <= totalPages; i += concurrency) {
    const chunk = [];
    for (let j = i; j < i + concurrency && j <= totalPages; j++) {
      chunk.push(j);
    }
    const promises = chunk.map(p =>
      fetchPage(p, 100)
        .then(data => {
          console.log(`[Shamela] Fetched page ${p}/${totalPages} (${data.books.length} books)`);
          return data.books;
        })
        .catch(err => {
          console.warn(`[Shamela] Failed to fetch page ${p}:`, err);
          return [];
        })
    );
    const results = await Promise.all(promises);
    for (const r of results) {
      allRawBooks.push(...r);
    }
  }

  console.log(`[Shamela] Total raw books fetched: ${allRawBooks.length}`);

  // Existing enriched 500 books map for pre-populated PDF/TXT URLs
  const existingMap = new Map<number, any>();
  if (fs.existsSync(OUT_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
      if (Array.isArray(existing)) {
        for (const b of existing) {
          if (b.id) existingMap.set(b.id, b);
        }
      }
    } catch {}
  }

  // Also check 1500-books.json
  const path1500 = path.resolve(process.cwd(), 'data/shamela/1500-books.json');
  if (fs.existsSync(path1500)) {
    try {
      const b1500 = JSON.parse(fs.readFileSync(path1500, 'utf8'));
      for (const b of b1500) {
        if (b.id && (b.pdf_url?.startsWith('http') || b.txt_url?.startsWith('http'))) {
          existingMap.set(b.id, {...(existingMap.get(b.id) || {}), ...b});
        }
      }
    } catch {}
  }

  const enriched = allRawBooks.map(b => {
    const prev = existingMap.get(b.id);
    return {
      id: b.id,
      kitab_id: `aljam3-${b.id}`,
      title: b.title,
      author: b.author?.name || 'من علماء الإسلام',
      author_id: b.author?.id,
      category: b.category?.name || 'علوم شرعية',
      category_id: b.category?.id,
      library: 'المكتبة الشاملة الوقفية',
      library_id: 3,
      pages_count: b.pages_count || 1,
      volumes: b.volumes || 1,
      views_count: b.views_count || 0,
      pdf_url: prev?.pdf_url || null,
      txt_url: prev?.txt_url || null,
      docx_url: prev?.docx_url || null,
      download_routes: {
        pdf: `/api/books/aljam3-${b.id}/download?format=pdf`,
        txt: `/api/books/aljam3-${b.id}/download?format=txt`,
        json: `/api/books/aljam3-${b.id}/download?format=json`
      }
    };
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(enriched, null, 2), 'utf8');
  console.log(`[Shamela] Successfully saved ${enriched.length} books to ${OUT_PATH}`);
  return enriched;
}

if (process.argv[1]?.endsWith('fetch-all-shamela.ts')) {
  fetchAllShamelaBooks().catch(console.error);
}
