import {archive} from './archive';
import {openiti} from './openiti';
import {turath} from './turath';
import {shamela} from './shamela';
import {huggingface} from './huggingface';
import {hadith} from './hadith';
import {tafsir} from './tafsir';
import {aco} from './aco';
import type {SourceId,Provider} from '../types';

export const sourceNames: Record<SourceId, string> = {
  'internet-archive': 'Internet Archive',
  openiti: 'OpenITI',
  turath: 'Turath',
  shamela: 'المكتبة الشاملة',
  waqfeya: 'الوقفية — Hugging Face',
  'prophet-mosque': 'مكتبة المسجد النبوي — Hugging Face',
  hadith: 'موسوعة الحديث الشريف (Hadith CDN)',
  tafsir: 'موسوعة التفاسير (Tafsir CDN)',
  aco: 'مجموعة المطبوعات العربية (NYU ACO)',
  local: 'استيراد محلي'
};

export function provider(id: string): Provider {
  switch (id) {
    case 'internet-archive': return archive;
    case 'openiti': return openiti;
    case 'turath': return turath;
    case 'shamela': return shamela;
    case 'hadith': return hadith;
    case 'tafsir': return tafsir;
    case 'aco': return aco;
    case 'waqfeya': return huggingface('waqfeya', process.env.HF_WAQFEYA_REPO || 'ieasybooks-org/waqfeya-library');
    case 'prophet-mosque':
      if (!process.env.HF_PROPHET_REPO) throw new Error('Set HF_PROPHET_REPO to the verified dataset repository');
      return huggingface('prophet-mosque', process.env.HF_PROPHET_REPO);
    default: throw new Error('Unsupported source');
  }
}

export function configuration(id: string) {
  switch (id) {
    case 'shamela': return !!process.env.SHAMELA_API_KEY;
    case 'turath': return !!process.env.TURATH_BOOK_IDS;
    case 'prophet-mosque': return !!process.env.HF_PROPHET_REPO;
    default: return true;
  }
}
