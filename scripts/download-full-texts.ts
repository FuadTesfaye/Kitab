import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {fetchFullBookText, sanitizeTitle} from '../lib/bulk-importer';

const BOOKS_DIR = path.resolve(process.cwd(), 'data/books');
const SHAMELA_DATA_PATH = path.resolve(process.cwd(), 'data/shamela/shamela-all-books.json');

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 12;

  const offsetArg = args.find(a => a.startsWith('--offset='));
  const offset = offsetArg ? Number(offsetArg.split('=')[1]) : 0;

  const idsArg = args.find(a => a.startsWith('--ids='));

  if (!fs.existsSync(BOOKS_DIR)) {
    fs.mkdirSync(BOOKS_DIR, {recursive: true});
  }

  const allBooks: any[] = JSON.parse(fs.readFileSync(SHAMELA_DATA_PATH, 'utf8'));

  let targetBooks: any[] = [];
  if (idsArg) {
    const ids = new Set(idsArg.split('=')[1].split(',').map(Number));
    targetBooks = allBooks.filter(b => ids.has(b.id));
  } else {
    // Find books that don't have .txt files yet
    const existingTxtFiles = new Set(fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.txt')));
    const existingTxtIds = new Set<number>();
    for (const f of existingTxtFiles) {
      const num = parseInt(f.split('-')[0], 10);
      if (Number.isSafeInteger(num)) existingTxtIds.add(num);
    }

    targetBooks = allBooks.filter(b => !existingTxtIds.has(b.id)).slice(offset, offset + limit);
  }

  console.log('='.repeat(60));
  console.log('📖 Kitab Full-Text Unabridged Book Downloader');
  console.log(`عدد الكتب المستهدفة: ${targetBooks.length}`);
  console.log('='.repeat(60));

  const pendingBatch: {path: string; title: string}[] = [];
  let downloadedCount = 0;

  for (const book of targetBooks) {
    const safeTitle = sanitizeTitle(book.title);
    const txtFilename = `${book.id}-${safeTitle}.txt`;
    const txtPath = path.join(BOOKS_DIR, txtFilename);

    if (fs.existsSync(txtPath) && fs.statSync(txtPath).size > 1000) {
      console.log(`[تخطي] الكتاب #${book.id} محمل مسبقاً (${(fs.statSync(txtPath).size / 1024).toFixed(1)} KB)`);
      continue;
    }

    try {
      console.log(`[جلب] جارٍ تحميل النص الكامل للكتاب #${book.id}: «${book.title.slice(0, 45)}»...`);
      const fullText = await fetchFullBookText(book.id, book.txt_url);

      if (fullText && fullText.length > 50) {
        fs.writeFileSync(txtPath, fullText, 'utf8');
        downloadedCount++;
        pendingBatch.push({path: txtPath, title: book.title});
        console.log(`  ✓ تم الحفظ: ${txtFilename} (${(fullText.length / 1024).toFixed(1)} KB, ${fullText.split('\n').length} أسطر)`);

        // Check if batch of 3 is ready to commit and push
        if (pendingBatch.length >= 3) {
          const batch = pendingBatch.splice(0, 3);
          const fileArgs = batch.map(b => `"${b.path}"`).join(' ');
          const titleSummary = batch.map(b => b.title.slice(0, 25)).join('، ');

          console.log(`  🔄 جارٍ الالتزام والدفع إلى GitHub (٣ كتب كاملة)...`);
          execSync(`git add ${fileArgs}`, {cwd: process.cwd()});
          execSync(`git commit -m "Download full text unabridged books: ${titleSummary.replace(/["`$]/g, '')}"`, {cwd: process.cwd()});
          execSync('git push origin main', {cwd: process.cwd(), timeout: 45000});
          const hash = execSync('git rev-parse --short HEAD', {cwd: process.cwd()}).toString().trim();
          console.log(`  🚀 تم الدفع بنجاح إلى GitHub [${hash}]!`);
        }
      } else {
        console.warn(`  ✗ تعذر جلب النص الكامل للكتاب #${book.id}`);
      }
    } catch (err: any) {
      console.error(`  ✗ خطأ في معالجة الكتاب #${book.id}:`, err.message);
    }
  }

  // Final remaining batch
  if (pendingBatch.length > 0) {
    const fileArgs = pendingBatch.map(b => `"${b.path}"`).join(' ');
    const titleSummary = pendingBatch.map(b => b.title.slice(0, 25)).join('، ');
    console.log(`  🔄 الدفعة الأخيرة (${pendingBatch.length} كتب كاملة)...`);
    execSync(`git add ${fileArgs}`, {cwd: process.cwd()});
    execSync(`git commit -m "Download full text unabridged books: ${titleSummary.replace(/["`$]/g, '')}"`, {cwd: process.cwd()});
    execSync('git push origin main', {cwd: process.cwd(), timeout: 45000});
    const hash = execSync('git rev-parse --short HEAD', {cwd: process.cwd()}).toString().trim();
    console.log(`  🚀 تم الدفع النهائي إلى GitHub [${hash}]!`);
  }

  console.log('='.repeat(60));
  console.log(`✅ اكتمل تنزيل النصوص الكاملة: تم تحميل ${downloadedCount} كتاباً بنجاح.`);
  console.log('='.repeat(60));
}

main().catch(console.error);
