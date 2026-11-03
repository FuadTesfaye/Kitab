import './env';
import {writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {listAljam3Books, getAljam3Book, type Aljam3Book} from '../lib/providers/aljam3';

async function main() {
  console.log('[500-Books] بدء جلب 500 كتاب إسلامي من مكتبة الجامع والشاملة...');
  const targetTotal = 500;
  const pageSize = 50;
  const allBooks: Aljam3Book[] = [];

  // Library 3 is Shamela Waqfeya (4,646 books)
  // Library 2 is Waqfeya (10,090 books)
  const libraries = [3, 2];

  for (const libId of libraries) {
    if (allBooks.length >= targetTotal) break;
    const libName = libId === 3 ? 'المكتبة الشاملة الوقفية' : 'المكتبة الوقفية';
    console.log(`[500-Books] جلب من: ${libName}...`);

    for (let page = 1; page <= 10; page++) {
      if (allBooks.length >= targetTotal) break;
      try {
        const res = await listAljam3Books({page, limit: pageSize, library: libId});
        console.log(`[500-Books] صفحة ${page}: تم استلام ${res.books.length} كتاب (الإجمالي الحالي: ${allBooks.length + res.books.length})`);

        for (const b of res.books) {
          if (allBooks.length >= targetTotal) break;
          // Construct direct PDF download URL using Aljam3/Hugging Face pattern or fetch details
          allBooks.push({
            id: b.id,
            title: b.title,
            author: b.author,
            category: b.category,
            library: b.library,
            pages_count: b.pages_count,
            files_count: b.files_count,
            views_count: b.views_count,
            volumes: b.volumes,
            pdf_url: `https://aljam3.com/${b.id}`,
            txt_url: `https://aljam3.com/api/v1/books/${b.id}`,
            docx_url: `https://aljam3.com/api/v1/books/${b.id}?expand=files`
          });
        }
      } catch (err) {
        console.warn(`[500-Books] خطأ في صفحة ${page}:`, (err as Error).message);
        break;
      }
    }
  }

  // Enrich top books with direct PDF URLs from files
  console.log(`[500-Books] ربط الروابط المباشرة لملفات PDF...`);
  const enrichedCount = Math.min(allBooks.length, 60);
  for (let i = 0; i < enrichedCount; i++) {
    const book = allBooks[i];
    try {
      const detail = await getAljam3Book(book.id);
      if (detail.files && detail.files.length > 0) {
        const f = detail.files[0];
        if (f.urls.pdf) book.pdf_url = f.urls.pdf;
        if (f.urls.txt) book.txt_url = f.urls.txt;
        if (f.urls.docx) book.docx_url = f.urls.docx;
      }
      if ((i + 1) % 10 === 0) {
        console.log(`[500-Books] تم تدقيق ${i + 1} / ${enrichedCount} كتاب...`);
      }
    } catch {
      // Keep base url if detail fetch fails
    }
  }

  const outDir = resolve('data/shamela');
  if (!existsSync(outDir)) {
    await mkdir(outDir, {recursive: true});
  }

  const outPath = resolve(outDir, '500-books.json');
  await writeFile(outPath, JSON.stringify(allBooks, null, 2), 'utf8');
  console.log(`✓ تم بنجاح إنشاء وحفظ فهرس 500 كتاب: ${outPath} (${allBooks.length} كتاب)`);
}

main().catch(console.error);
