import './env';
import {startBulkImport, getBulkImportStatus} from '../lib/bulk-importer';

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = args.find(a => a.startsWith('--source='));
  const source = (sourceArg ? sourceArg.split('=')[1] : 'shamela') as any;

  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 6;

  const offsetArg = args.find(a => a.startsWith('--offset='));
  const offset = offsetArg ? Number(offsetArg.split('=')[1]) : 0;

  const noCommit = args.includes('--no-commit');
  const commitToGit = !noCommit;

  console.log('='.repeat(60));
  console.log('🚀 Kitab Website-to-Website Bulk Import System');
  console.log(`المصدر: ${source}`);
  console.log(`العدد المطلوب: ${limit}`);
  console.log(`التخطي (offset): ${offset}`);
  console.log(`المزامنة مع GitHub: ${commitToGit ? 'مفعّلة (دفعات كل ٣ ملفات)' : 'معطلة'}`);
  console.log('='.repeat(60));

  await startBulkImport({
    source,
    limit,
    offset,
    commitToGit,
    gitBatchSize: 3
  });

  // Poll progress in console until finished
  while (true) {
    await new Promise(r => setTimeout(r, 1500));
    const status = getBulkImportStatus();
    if (status.currentBook) {
      process.stdout.write(`\r⏳ جاري المعالجة: [${status.processed}/${status.total}] ${status.currentBook.slice(0, 40)}...`);
    }
    if (!status.active) {
      console.log('\n');
      console.log('='.repeat(60));
      console.log(`✅ انتهت عملية الاستيراد:`);
      console.log(`   - تم استيراد وحفظ: ${status.imported}`);
      console.log(`   - إخفاقات: ${status.failed}`);
      console.log(`   - التزامات Git المنفذة: ${status.commits.join(', ') || 'لا يوجد'}`);
      console.log('='.repeat(60));
      break;
    }
  }
}

main().catch(err => {
  console.error('Fatal import error:', err);
  process.exit(1);
});
