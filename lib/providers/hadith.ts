import {sourceJson,revision,list} from '../http';
import {plainText} from '../arabic';
import type {Provider,RemoteBook,BookContent,Page,Section} from '../types';

interface HadithRow {
  hadithnumber: number;
  arabicnumber?: number;
  text: string;
  grades?: {name: string; grade: string}[];
  reference?: {book?: number; hadith?: number};
}

interface CollectionMeta {
  name: string;
  sections?: Record<string, string>;
  section_details?: Record<string, {hadithnumber_first: number; hadithnumber_last: number}>;
}

interface HadithData {
  metadata: CollectionMeta;
  hadiths: HadithRow[];
}

const COLLECTIONS: Record<string, {title: string; author: string; death: number; category: string}> = {
  'ara-nawawi': {title: 'الأربعون النووية', author: 'يحيى بن شرف النووي', death: 676, category: 'hadith'},
  'ara-bukhari': {title: 'صحيح البخاري', author: 'محمد بن إسماعيل البخاري', death: 256, category: 'hadith'},
  'ara-muslim': {title: 'صحيح مسلم', author: 'مسلم بن الحجاج النيسابوري', death: 261, category: 'hadith'},
  'ara-malik': {title: 'موطأ الإمام مالك', author: 'مالك بن أنس', death: 179, category: 'hadith'},
  'ara-abudawud': {title: 'سنن أبي داود', author: 'أبو داود السجستاني', death: 275, category: 'hadith'},
  'ara-tirmidhi': {title: 'جامع الترمذي', author: 'أبو عيسى محمد الترمذي', death: 279, category: 'hadith'},
  'ara-nasai': {title: 'سنن النسائي', author: 'أحمد بن شعيب النسائي', death: 303, category: 'hadith'},
  'ara-ibnmajah': {title: 'سنن ابن ماجه', author: 'ابن ماجه القزويني', death: 273, category: 'hadith'}
};

async function fetchCollection(id: string): Promise<HadithData> {
  const cdn = `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${id}.json`;
  const raw = `https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions/${id}.json`;
  try {
    return await sourceJson<HadithData>(cdn);
  } catch {
    return await sourceJson<HadithData>(raw);
  }
}

export const hadith: Provider = {
  id: 'hadith',
  async discover() {
    const books: RemoteBook[] = [];
    for (const [id, meta] of Object.entries(COLLECTIONS)) {
      books.push({
        externalId: id,
        title: meta.title,
        authors: [meta.author],
        categories: [meta.category],
        sourceUrl: `https://github.com/fawazahmed0/hadith-api`,
        revision: '1.0',
        licenseUrl: 'https://github.com/fawazahmed0/hadith-api/blob/1/LICENSE',
        rightsHint: 'Open hadith database compiled from classical source collections.',
        files: [{name: `${id}.json`, format: 'json', url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${id}.json`}],
        raw: {id, ...meta}
      });
    }
    return {books};
  },
  async getBook(id: string) {
    const meta = COLLECTIONS[id];
    if (!meta) throw new Error('Unknown Hadith collection');
    return {
      externalId: id,
      title: meta.title,
      authors: [meta.author],
      categories: [meta.category],
      sourceUrl: `https://github.com/fawazahmed0/hadith-api`,
      revision: '1.0',
      licenseUrl: 'https://github.com/fawazahmed0/hadith-api/blob/1/LICENSE',
      rightsHint: 'Open hadith database compiled from classical source collections.',
      files: [{name: `${id}.json`, format: 'json', url: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${id}.json`}],
      raw: {id, ...meta}
    };
  },
  async fetchContent(book: RemoteBook): Promise<BookContent> {
    const data = await fetchCollection(book.externalId);
    const pages: Page[] = [];
    const sections: Section[] = [];
    
    // Add sections from metadata
    if (data.metadata?.sections) {
      for (const [secKey, title] of Object.entries(data.metadata.sections)) {
        if (!title.trim()) continue;
        const first = data.metadata.section_details?.[secKey]?.hadithnumber_first;
        if (first !== undefined) {
          sections.push({title: plainText(title), seq: first});
        }
      }
    }

    for (let i = 0; i < data.hadiths.length; i++) {
      const h = data.hadiths[i];
      const grades = (h.grades || []).map(g => `${g.name}: ${g.grade}`).join(' | ');
      pages.push({
        seq: i + 1,
        part: h.reference?.book ? `كتاب ${h.reference.book}` : '',
        pageNo: String(h.hadithnumber || i + 1),
        body: plainText(h.text),
        footnotes: grades
      });
    }

    return {pages, sections, files: book.files};
  }
};
