import fs from 'node:fs';
import path from 'node:path';
import {getBooksDataset, getAljam3Book, getBookPdfUrl} from '../lib/providers/aljam3';
import {fetchShamelaInfo, fetchShamelaPage, exportShamelaText} from '../lib/providers/shamela-direct';

const BOOKS_DIR = path.resolve(process.cwd(), 'data/books');

export async function downloadBook(id: number | string, outDir = BOOKS_DIR) {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, {recursive: true});
  }

  const numId = typeof id === 'string' && id.startsWith('aljam3-') ? Number(id.replace('aljam3-', '')) : Number(id);
  const all = await getBooksDataset();
  const entry = all.find(b => b.id === numId);

  let bookData: Record<string, unknown> = {};

  if (entry) {
    const pdfUrl = await getBookPdfUrl(numId);
    let sampleText = '';
    try {
      sampleText = await exportShamelaText(numId);
    } catch {}

    bookData = {
      id: entry.id,
      kitab_id: `aljam3-${entry.id}`,
      title: entry.title,
      author: entry.author?.name || 'من علماء الإسلام',
      category: entry.category?.name || 'علوم شرعية',
      library: entry.library?.name || 'المكتبة الإسلامية',
      pages_count: entry.pages_count || 1,
      volumes: entry.volumes || 1,
      pdf_url: pdfUrl || entry.pdf_url,
      txt_url: entry.txt_url,
      downloaded_at: new Date().toISOString(),
      sample_text: sampleText ? sampleText.slice(0, 5000) : null
    };
  } else {
    // Try Shamela direct
    const info = await fetchShamelaInfo(numId);
    const page1 = await fetchShamelaPage(numId, 1);
    bookData = {
      id: numId,
      kitab_id: `shamela-${numId}`,
      title: info.title,
      author: info.author,
      category: info.category,
      pages_count: info.pageCount,
      headings: info.headings,
      first_page: page1,
      downloaded_at: new Date().toISOString()
    };
  }

  const safeTitle = (bookData.title as string || 'book').replace(/[\\/:*?"<>| ]+/g, '-').slice(0, 40);
  const filename = `${numId}-${safeTitle}.json`;
  const filePath = path.join(outDir, filename);

  fs.writeFileSync(filePath, JSON.stringify(bookData, null, 2), 'utf8');
  console.log(`[Downloaded] Book #${numId} -> ${filePath}`);
  return filePath;
}

export async function downloadBulk(ids: number[], outDir = BOOKS_DIR) {
  console.log(`Starting bulk download for ${ids.length} books...`);
  const downloaded: string[] = [];
  for (const id of ids) {
    try {
      const file = await downloadBook(id, outDir);
      downloaded.push(file);
    } catch (err) {
      console.error(`Failed to download book #${id}:`, err);
    }
  }
  console.log(`Successfully downloaded ${downloaded.length}/${ids.length} books to ${outDir}`);
  return downloaded;
}

// CLI invocation
if (process.argv[1]?.endsWith('download-all-books.ts')) {
  const args = process.argv.slice(2);
  const ids = args.filter(a => !a.startsWith('--')).map(Number).filter(n => Number.isSafeInteger(n) && n > 0);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 10;

  (async () => {
    if (ids.length > 0) {
      await downloadBulk(ids);
    } else {
      const all = await getBooksDataset();
      const targetIds = all.slice(0, limit).map(b => b.id);
      await downloadBulk(targetIds);
    }
  })().catch(console.error);
}
