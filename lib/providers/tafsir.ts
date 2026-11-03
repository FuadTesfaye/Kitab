import {sourceJson} from '../http';
import {plainText} from '../arabic';
import type {Provider,RemoteBook,BookContent,Page,Section} from '../types';

export interface TafsirVerse {
  surah: number;
  ayah: number;
  text: string;
}

const TAFSIR_BOOKS: Record<string, {title: string; author: string; death: number}> = {
  'ar-tafsir-ibn-kathir': {title: 'تفسير ابن كثير (تفسير القرآن العظيم)', author: 'إسماعيل بن عمر بن كثير', death: 774},
  'ar-tafsir-as-saadi': {title: 'تفسير السعدي (تيسير الكريم الرحمن)', author: 'عبد الرحمن بن ناصر السعدي', death: 1376},
  'ar-tafsir-al-tabari': {title: 'تفسير الطبري (جامع البيان)', author: 'محمد بن جرير الطبري', death: 310},
  'ar-tafseer-al-qurtubi': {title: 'تفسير القرطبي (الجامع لأحكام القرآن)', author: 'محمد بن أحمد القرطبي', death: 671},
  'ar-tafsir-al-baghawi': {title: 'تفسير البغوي (معالم التنزيل)', author: 'الحسين بن مسعود البغوي', death: 516},
  'ar-tafsir-al-jalalayn': {title: 'تفسير الجلالين', author: 'جلال الدين المحلي وجلال الدين السيوطي', death: 911},
  'ar-tafsir-muyassar': {title: 'التفسير الميسر', author: 'مجمع الملك فهد لطباعة المصحف الشريف', death: 1420}
};

export async function fetchTafsirAyah(tafsirSlug: string, surah: number, ayah: number): Promise<string | null> {
  const url = `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${tafsirSlug}/${surah}.json`;
  try {
    const ayahs = await sourceJson<TafsirVerse[]>(url);
    const found = ayahs.find(a => a.ayah === ayah);
    return found ? plainText(found.text) : null;
  } catch {
    return null;
  }
}

export const tafsir: Provider = {
  id: 'tafsir',
  async discover() {
    const books: RemoteBook[] = [];
    for (const [id, meta] of Object.entries(TAFSIR_BOOKS)) {
      books.push({
        externalId: id,
        title: meta.title,
        authors: [meta.author],
        categories: ['quran'],
        sourceUrl: 'https://github.com/spa5k/tafsir_api',
        revision: 'main',
        licenseUrl: 'https://github.com/spa5k/tafsir_api/blob/main/LICENSE',
        rightsHint: 'Classical Quran commentaries digitized and indexed per surah and ayah.',
        files: [],
        raw: {id, ...meta}
      });
    }
    return {books};
  },
  async getBook(id: string) {
    const meta = TAFSIR_BOOKS[id];
    if (!meta) throw new Error('Unknown Tafsir work');
    return {
      externalId: id,
      title: meta.title,
      authors: [meta.author],
      categories: ['quran'],
      sourceUrl: 'https://github.com/spa5k/tafsir_api',
      revision: 'main',
      licenseUrl: 'https://github.com/spa5k/tafsir_api/blob/main/LICENSE',
      rightsHint: 'Classical Quran commentaries digitized and indexed per surah and ayah.',
      files: [],
      raw: {id, ...meta}
    };
  },
  async fetchContent(book: RemoteBook): Promise<BookContent> {
    const pages: Page[] = [];
    const sections: Section[] = [];
    // Fetch surah by surah (for full ingestion, surah 1 to 114)
    for (let surah = 1; surah <= 114; surah++) {
      try {
        const url = `https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/${book.externalId}/${surah}.json`;
        const ayahs = await sourceJson<TafsirVerse[]>(url);
        sections.push({title: `سورة ${surah}`, seq: pages.length + 1});
        for (const a of ayahs) {
          pages.push({
            seq: pages.length + 1,
            part: `سورة ${surah}`,
            pageNo: `الآية ${a.ayah}`,
            body: plainText(a.text)
          });
        }
      } catch {
        // Skip unavailable surahs
      }
    }
    return {pages, sections};
  }
};
