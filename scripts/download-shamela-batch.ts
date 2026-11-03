import fs from 'node:fs';
import path from 'node:path';

const BOOKS_DIR = path.resolve(process.cwd(), 'data/books');
const SHAMELA_DATA_PATH = path.resolve(process.cwd(), 'data/shamela/shamela-all-books.json');

export interface ShamelaCorpusBook {
  id: number;
  kitab_id: string;
  title: string;
  author: string;
  author_id?: number;
  category: string;
  category_id?: number;
  library: string;
  library_id: number;
  pages_count: number;
  volumes: number;
  views_count?: number;
  pdf_url?: string;
  txt_url?: string;
  docx_url?: string;
  download_routes: {
    pdf: string;
    txt: string;
    json: string;
  };
}

export function loadShamelaBooks(): ShamelaCorpusBook[] {
  if (!fs.existsSync(SHAMELA_DATA_PATH)) {
    throw new Error(`Shamela dataset not found at ${SHAMELA_DATA_PATH}`);
  }
  return JSON.parse(fs.readFileSync(SHAMELA_DATA_PATH, 'utf8'));
}

export function sanitizeTitle(title: string): string {
  return (title || 'book')
    .replace(/[\\/:*?"<>| ]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 45);
}

export async function downloadShamelaBook(
  id: number,
  options: {
    outDir?: string;
    withPdf?: boolean;
    withTxt?: boolean;
  } = {}
) {
  const {outDir = BOOKS_DIR, withPdf = false, withTxt = false} = options;
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, {recursive: true});
  }

  const books = loadShamelaBooks();
  const entry = books.find(b => b.id === id);
  if (!entry) {
    throw new Error(`Book #${id} not found in Shamela dataset`);
  }

  const safeTitle = sanitizeTitle(entry.title);
  const jsonFilename = `${entry.id}-${safeTitle}.json`;
  const jsonPath = path.join(outDir, jsonFilename);

  const bookData = {
    ...entry,
    downloaded_at: new Date().toISOString(),
    local_files: {
      json: jsonFilename,
      pdf: withPdf ? `${entry.id}-${safeTitle}.pdf` : null,
      txt: withTxt ? `${entry.id}-${safeTitle}.txt` : null
    }
  };

  fs.writeFileSync(jsonPath, JSON.stringify(bookData, null, 2), 'utf8');
  console.log(`[Shamela JSON] Saved #${entry.id} (${entry.title}) -> ${jsonFilename}`);

  // Optional TXT fetch
  if (withTxt && entry.txt_url) {
    const txtFilename = `${entry.id}-${safeTitle}.txt`;
    const txtPath = path.join(outDir, txtFilename);
    try {
      console.log(`[Shamela TXT] Fetching #${entry.id} from ${entry.txt_url}...`);
      const res = await fetch(entry.txt_url, {
        headers: {'User-Agent': 'Kitab-Shamela/2.0'},
        redirect: 'follow',
        signal: AbortSignal.timeout(60000)
      });
      if (res.ok) {
        const text = await res.text();
        fs.writeFileSync(txtPath, text, 'utf8');
        console.log(`[Shamela TXT] Saved #${entry.id} -> ${txtFilename} (${(text.length / 1024).toFixed(1)} KB)`);
      }
    } catch (e) {
      console.warn(`[Shamela TXT] Notice: failed to fetch TXT for #${entry.id}:`, e);
    }
  }

  // Optional PDF fetch
  if (withPdf && entry.pdf_url) {
    const pdfFilename = `${entry.id}-${safeTitle}.pdf`;
    const pdfPath = path.join(outDir, pdfFilename);
    try {
      console.log(`[Shamela PDF] Fetching #${entry.id} from ${entry.pdf_url}...`);
      const res = await fetch(entry.pdf_url, {
        headers: {'User-Agent': 'Kitab-Shamela/2.0'},
        redirect: 'follow',
        signal: AbortSignal.timeout(120000)
      });
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        fs.writeFileSync(pdfPath, buffer);
        console.log(`[Shamela PDF] Saved #${entry.id} -> ${pdfFilename} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
      }
    } catch (e) {
      console.warn(`[Shamela PDF] Notice: failed to fetch PDF for #${entry.id}:`, e);
    }
  }

  return jsonPath;
}

export async function downloadShamelaBatch(
  ids: number[],
  options: {outDir?: string; withPdf?: boolean; withTxt?: boolean} = {}
) {
  const results: string[] = [];
  for (const id of ids) {
    try {
      const p = await downloadShamelaBook(id, options);
      results.push(p);
    } catch (err) {
      console.error(`Error downloading #${id}:`, err);
    }
  }
  return results;
}

// CLI
if (process.argv[1]?.endsWith('download-shamela-batch.ts')) {
  const args = process.argv.slice(2);
  const withPdf = args.includes('--pdf');
  const withTxt = args.includes('--txt');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 5;
  const idsArg = args.find(a => a.startsWith('--ids='));

  (async () => {
    let ids: number[] = [];
    if (idsArg) {
      ids = idsArg
        .split('=')[1]
        .split(',')
        .map(Number)
        .filter(n => Number.isSafeInteger(n) && n > 0);
    } else {
      const books = loadShamelaBooks();
      ids = books.slice(0, limit).map(b => b.id);
    }

    console.log(`Starting Shamela batch download for IDs: [${ids.join(', ')}] (pdf=${withPdf}, txt=${withTxt})`);
    await downloadShamelaBatch(ids, {withPdf, withTxt});
    console.log('Batch download completed.');
  })().catch(console.error);
}
