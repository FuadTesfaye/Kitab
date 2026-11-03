import './env';
import {writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {listAljam3Books, getAljam3Book, type Aljam3Book} from '../lib/providers/aljam3';

async function main() {
  console.log('[1500-Books] بدء جلب 1500 كتاب إسلامي من مكتبات الجامع والشاملة...');
  const targetTotal = 1500;
  const pageSize = 50;
  const allBooks: Aljam3Book[] = [];

  // Libraries:
  // 3: Shamela Waqfeya (4,646 books)
  // 2: Waqfeya (10,090 books)
  // 1: Prophet's Mosque Library (48,697 books)
  const libraries = [
    {id: 3, name: 'المكتبة الشاملة الوقفية', target: 500},
    {id: 2, name: 'المكتبة الوقفية', target: 500},
    {id: 1, name: 'مكتبة المسجد النبوي', target: 500}
  ];

  for (const lib of libraries) {
    console.log(`[1500-Books] جلب 500 كتاب من: ${lib.name}...`);
    let libCount = 0;

    for (let page = 1; page <= 10; page++) {
      if (libCount >= lib.target) break;
      try {
        const res = await listAljam3Books({page, limit: pageSize, library: lib.id});
        console.log(`[1500-Books] ${lib.name} - صفحة ${page}: تم استلام ${res.books.length} كتاب (إجمالي المكتبة: ${libCount + res.books.length})`);

        for (const b of res.books) {
          if (libCount >= lib.target) break;
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
          libCount++;
        }
      } catch (err) {
        console.warn(`[1500-Books] خطأ في صفحة ${page} لمكتبة ${lib.name}:`, (err as Error).message);
        break;
      }
    }
  }

  // Enrich top books with direct Hugging Face PDF CDN URLs
  console.log(`[1500-Books] ربط الروابط المباشرة لملفات PDF...`);
  const enrichedCount = Math.min(allBooks.length, 100);
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
      if ((i + 1) % 25 === 0) {
        console.log(`[1500-Books] تم تدقيق ${i + 1} / ${enrichedCount} كتاب...`);
      }
    } catch {
      // Keep fallback url
    }
  }

  const outDir = resolve('data/shamela');
  if (!existsSync(outDir)) {
    await mkdir(outDir, {recursive: true});
  }

  const outPath = resolve(outDir, '1500-books.json');
  await writeFile(outPath, JSON.stringify(allBooks, null, 2), 'utf8');
  console.log(`✓ تم بنجاح إنشاء وحفظ فهرس 1500 كتاب: ${outPath} (${allBooks.length} كتاب)`);
}

main().catch(console.error);
