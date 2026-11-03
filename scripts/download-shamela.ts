import './env';
import {writeFile, readFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {plainText} from '../lib/arabic';

interface ShamelaHeading {
  title: string;
  page: number;
}

interface ShamelaPageRecord {
  page_num: number;
  vol: string;
  body: string;
  headings?: string[];
}

interface ShamelaDownloadResult {
  shamela_id: number;
  title: string;
  author: string;
  death?: number;
  category: string;
  source: string;
  source_url: string;
  headings: ShamelaHeading[];
  pages: ShamelaPageRecord[];
}

async function downloadShamelaBook(id: number, maxPages = 50): Promise<ShamelaDownloadResult> {
  console.log(`[Shamela] جلب بيانات الكتاب رقم: ${id}...`);
  const metaRes = await fetch(`https://api.turath.io/book?id=${id}&include=indexes&ver=3`, {
    headers: {'User-Agent': 'KitabsLibrary/2.0'},
    signal: AbortSignal.timeout(20000)
  });

  if (!metaRes.ok) {
    throw new Error(`Failed to fetch metadata for book ${id}: status ${metaRes.status}`);
  }

  const metaData = await metaRes.json();
  const bookName = plainText(metaData.meta?.name || `كتاب ${id}`);

  // Fetch author
  let authorName = 'مؤلف من الشاملة';
  let authorDeath: number | undefined;
  if (metaData.meta?.author_id) {
    try {
      const aRes = await fetch(`https://api.turath.io/author?id=${metaData.meta.author_id}&ver=3`, {
        headers: {'User-Agent': 'KitabsLibrary/2.0'},
        signal: AbortSignal.timeout(15000)
      });
      if (aRes.ok) {
        const aData = await aRes.json();
        authorName = plainText(aData.name || authorName);
        if (aData.death) authorDeath = Number(aData.death);
      }
    } catch {
      // ignore author fetch error
    }
  }

  const headings: ShamelaHeading[] = (metaData.indexes?.headings || []).map((h: any) => ({
    title: plainText(h.title),
    page: h.page + 1
  }));

  const totalPages = Math.min(metaData.meta?.pages_count || 10, maxPages);
  console.log(`[Shamela] تنزيل ${totalPages} صفحة من «${bookName}»...`);

  const pages: ShamelaPageRecord[] = [];
  for (let p = 1; p <= totalPages; p++) {
    try {
      const pRes = await fetch(`https://api.turath.io/page?book_id=${id}&pg=${p}&ver=3`, {
        headers: {'User-Agent': 'KitabsLibrary/2.0'},
        signal: AbortSignal.timeout(15000)
      });
      if (pRes.ok) {
        const pData = await pRes.json();
        const pMeta = typeof pData.meta === 'string' ? JSON.parse(pData.meta) : (pData.meta || {});
        pages.push({
          page_num: p,
          vol: String(pMeta.vol || '1'),
          body: plainText(pData.text || ''),
          headings: pMeta.headings || []
        });
      }
    } catch (e) {
      console.warn(`[Shamela] خطأ في تحميل الصفحة ${p}:`, (e as Error).message);
    }
  }

  return {
    shamela_id: id,
    title: bookName,
    author: authorName,
    death: authorDeath,
    category: 'المكتبة الشاملة',
    source: 'المكتبة الشاملة v4',
    source_url: `https://shamela.ws/book/${id}`,
    headings,
    pages
  };
}

async function main() {
  const args = process.argv.slice(2);
  const ids = args.filter(a => /^\d+$/.test(a)).map(Number);
  const targetIds = ids.length ? ids : [1];

  const shamelaDir = resolve('data/shamela');
  if (!existsSync(shamelaDir)) {
    await mkdir(shamelaDir, {recursive: true});
  }

  for (const id of targetIds) {
    try {
      const book = await downloadShamelaBook(id, 25);
      const outPath = resolve(shamelaDir, `${id}.json`);
      await writeFile(outPath, JSON.stringify(book, null, 2), 'utf8');
      console.log(`✓ تم حفظ الكتاب بنجاح: ${outPath} (${book.pages.length} صفحة)`);
    } catch (err) {
      console.error(`✗ فشل تنزيل كتاب ${id}:`, (err as Error).message);
    }
  }
}

main().catch(console.error);
