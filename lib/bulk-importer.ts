import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {getShamelaCorpus, getBooksDataset} from './providers/aljam3';

export interface BulkImportOptions {
  source?: 'shamela' | 'waqfeya' | 'prophet-mosque' | 'all';
  limit?: number;
  offset?: number;
  outDir?: string;
  withTxt?: boolean;
  withPdf?: boolean;
  commitToGit?: boolean;
  gitBatchSize?: number;
}

export interface BulkImportStatus {
  active: boolean;
  source: string;
  total: number;
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
  currentBook?: string;
  commits: string[];
  logs: string[];
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

const BOOKS_DIR = path.resolve(process.cwd(), 'data/books');

export function sanitizeTitle(title: string): string {
  return (title || 'book')
    .replace(/[\\/:*?"<>| ]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 45);
}

// Module-level singleton status
const state: BulkImportStatus = {
  active: false,
  source: 'shamela',
  total: 0,
  processed: 0,
  imported: 0,
  skipped: 0,
  failed: 0,
  commits: [],
  logs: []
};

let abortRequested = false;

export function getBulkImportStatus(): BulkImportStatus {
  // Add repository stats
  let localCount = 0;
  if (fs.existsSync(BOOKS_DIR)) {
    localCount = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.json')).length;
  }
  return {
    ...state,
    logs: state.logs.slice(-50)
  };
}

export function stopBulkImport() {
  if (state.active) {
    abortRequested = true;
    state.logs.push(`[${new Date().toLocaleTimeString('ar')}] تم إرسال طلب إيقاف الاستيراد...`);
  }
}

export async function startBulkImport(options: BulkImportOptions = {}): Promise<BulkImportStatus> {
  if (state.active) {
    throw new Error('عملية استيراد أخرى قيد التنفيذ حالياً');
  }

  const {
    source = 'shamela',
    limit = 6,
    offset = 0,
    outDir = BOOKS_DIR,
    withTxt = false,
    withPdf = false,
    commitToGit = true,
    gitBatchSize = 3
  } = options;

  state.active = true;
  state.source = source;
  state.processed = 0;
  state.imported = 0;
  state.skipped = 0;
  state.failed = 0;
  state.commits = [];
  state.logs = [];
  state.startedAt = new Date().toISOString();
  state.finishedAt = undefined;
  state.error = undefined;
  abortRequested = false;

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, {recursive: true});
  }

  // Run in background / async
  (async () => {
    try {
      state.logs.push(`[${new Date().toLocaleTimeString('ar')}] بدء الاستيراد الجماعي: المصدر (${source})، العدد المطلوب (${limit})`);

      // 1. Gather books catalogue
      let candidateBooks: any[] = [];
      if (source === 'shamela') {
        candidateBooks = await getShamelaCorpus();
      } else if (source === 'waqfeya') {
        const all = await getBooksDataset();
        candidateBooks = all.filter(b => b.library?.id === 1);
      } else if (source === 'prophet-mosque') {
        const all = await getBooksDataset();
        candidateBooks = all.filter(b => b.library?.id === 2);
      } else {
        const s = await getShamelaCorpus();
        const a = await getBooksDataset();
        const map = new Map<number, any>();
        for (const b of a) map.set(b.id, b);
        for (const b of s) if (!map.has(b.id)) map.set(b.id, b);
        candidateBooks = Array.from(map.values());
      }

      // Check existing files on disk
      const existingFiles = new Set(fs.readdirSync(outDir));
      const existingIds = new Set<number>();
      for (const file of existingFiles) {
        const idNum = parseInt(file.split('-')[0], 10);
        if (Number.isSafeInteger(idNum)) existingIds.add(idNum);
      }

      // Filter unimported books
      const unimported = candidateBooks.filter(b => !existingIds.has(b.id));
      const selection = unimported.slice(offset, offset + limit);

      state.total = selection.length;
      state.logs.push(`[${new Date().toLocaleTimeString('ar')}] تم تجهيز ${selection.length} كتاباً غير مستورد للمزامنة`);

      const pendingCommitFiles: {path: string; title: string}[] = [];

      for (const book of selection) {
        if (abortRequested) {
          state.logs.push(`[${new Date().toLocaleTimeString('ar')}] تم إيقاف الاستيراد بطلب من المستخدم.`);
          break;
        }

        state.processed++;
        state.currentBook = book.title;

        try {
          const safeTitle = sanitizeTitle(book.title);
          const jsonFilename = `${book.id}-${safeTitle}.json`;
          const jsonPath = path.join(outDir, jsonFilename);

          const bookData = {
            id: book.id,
            kitab_id: `aljam3-${book.id}`,
            title: book.title,
            author: book.author?.name || book.author || 'غير محدد',
            author_id: book.author_id || book.author?.id,
            category: book.category?.name || book.category || 'عام',
            category_id: book.category_id || book.category?.id,
            library: book.library?.name || book.library || 'المكتبة الشاملة',
            library_id: book.library?.id || book.library_id || 3,
            pages_count: book.pages_count || 0,
            volumes: book.volumes || 1,
            views_count: book.views_count || 0,
            pdf_url: book.pdf_url || null,
            txt_url: book.txt_url || null,
            docx_url: book.docx_url || null,
            download_routes: {
              pdf: `/api/books/aljam3-${book.id}/download?format=pdf`,
              txt: `/api/books/aljam3-${book.id}/download?format=txt`,
              json: `/api/books/aljam3-${book.id}/download?format=json`
            },
            imported_at: new Date().toISOString(),
            source_website: 'https://aljam3.com'
          };

          fs.writeFileSync(jsonPath, JSON.stringify(bookData, null, 2), 'utf8');
          pendingCommitFiles.push({path: jsonPath, title: book.title});
          state.imported++;
          state.logs.push(`[${new Date().toLocaleTimeString('ar')}] ✓ تم استيراد #${book.id}: «${book.title.slice(0, 40)}»`);

          // Commit batch check
          if (commitToGit && pendingCommitFiles.length >= gitBatchSize) {
            const batch = pendingCommitFiles.splice(0, gitBatchSize);
            const filePaths = batch.map(f => `"${f.path}"`).join(' ');
            const commitTitles = batch.map(f => f.title.slice(0, 25)).join('، ');

            try {
              state.logs.push(`[${new Date().toLocaleTimeString('ar')}] 🔄 جارٍ الالتزام والدفع إلى GitHub: ${batch.length} ملفات...`);
              execSync(`git add ${filePaths}`, {cwd: process.cwd()});
              execSync(`git commit -m "Bulk import Shamela works: ${commitTitles.replace(/["`$]/g, '')}"`, {cwd: process.cwd()});
              execSync('git push origin main', {cwd: process.cwd(), timeout: 30000});
              const hash = execSync('git rev-parse --short HEAD', {cwd: process.cwd()}).toString().trim();
              state.commits.push(hash);
              state.logs.push(`[${new Date().toLocaleTimeString('ar')}] 🚀 تم الدفع بنجاح إلى GitHub [${hash}]`);
            } catch (gitErr: any) {
              state.logs.push(`[${new Date().toLocaleTimeString('ar')}] ⚠️ تنبيه Git: ${gitErr.message}`);
            }
          }
        } catch (err: any) {
          state.failed++;
          state.logs.push(`[${new Date().toLocaleTimeString('ar')}] ✗ خطأ في استيراد #${book.id}: ${err.message}`);
        }
      }

      // Final remaining batch if commitToGit was requested
      if (commitToGit && pendingCommitFiles.length > 0) {
        try {
          const filePaths = pendingCommitFiles.map(f => `"${f.path}"`).join(' ');
          const commitTitles = pendingCommitFiles.map(f => f.title.slice(0, 25)).join('، ');
          state.logs.push(`[${new Date().toLocaleTimeString('ar')}] 🔄 إنهاء الدفعة الأخيرة (${pendingCommitFiles.length} ملفات)...`);
          execSync(`git add ${filePaths}`, {cwd: process.cwd()});
          execSync(`git commit -m "Bulk import Shamela works: ${commitTitles.replace(/["`$]/g, '')}"`, {cwd: process.cwd()});
          execSync('git push origin main', {cwd: process.cwd(), timeout: 30000});
          const hash = execSync('git rev-parse --short HEAD', {cwd: process.cwd()}).toString().trim();
          state.commits.push(hash);
          state.logs.push(`[${new Date().toLocaleTimeString('ar')}] 🚀 تم الدفع النهائي إلى GitHub [${hash}]`);
        } catch (gitErr: any) {
          state.logs.push(`[${new Date().toLocaleTimeString('ar')}] ⚠️ تنبيه Git للدفعة الأخيرة: ${gitErr.message}`);
        }
      }

      state.logs.push(`[${new Date().toLocaleTimeString('ar')}] اكتمل الاستيراد: ${state.imported} مستورد، ${state.failed} فشل.`);
    } catch (globalErr: any) {
      state.error = globalErr.message;
      state.logs.push(`[${new Date().toLocaleTimeString('ar')}] خطأ عام: ${globalErr.message}`);
    } finally {
      state.active = false;
      state.currentBook = undefined;
      state.finishedAt = new Date().toISOString();
    }
  })();

  return getBulkImportStatus();
}
