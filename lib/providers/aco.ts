import {sourceJson,revision,list} from '../http';
import {plainText} from '../arabic';
import type {Provider,RemoteBook,RemoteFile} from '../types';

interface AcoSearchDoc {
  identifier: string;
  title?: string | string[];
  author?: string | string[];
  date?: string | string[];
  description?: string | string[];
  subject?: string | string[];
}

interface AcoSearchResponse {
  response?: {
    docs?: AcoSearchDoc[];
    numFound?: number;
  };
}

export const aco: Provider = {
  id: 'aco',
  async discover(cursor) {
    const page = Number(cursor || 1);
    const limit = Math.min(Number(process.env.DISCOVERY_LIMIT || 20), 50);
    const url = `https://sites.dlib.nyu.edu/viewer/api/v1/search?q=*&rows=${limit}&page=${page}&output=json`;
    try {
      const data = await sourceJson<AcoSearchResponse>(url);
      const docs = data.response?.docs || [];
      const books: RemoteBook[] = [];
      for (const d of docs) {
        if (!d.identifier) continue;
        const title = list(d.title)[0] || d.identifier;
        const authors = list(d.author);
        const externalId = d.identifier;
        books.push({
          externalId,
          title: plainText(title),
          authors,
          categories: list(d.subject),
          description: list(d.description).join('\n'),
          sourceUrl: `https://dlib.nyu.edu/aco/book/${externalId}`,
          revision: '1.0',
          licenseUrl: 'https://aco.dlib.nyu.edu/rights',
          rightsHint: 'Public domain digitized classical Arabic books from NYU Arabic Collections Online.',
          files: [
            {
              name: `${externalId}-lo.pdf`,
              format: 'pdf',
              url: `https://sites.dlib.nyu.edu/viewer/download/pdf/books/${externalId}/lo`
            }
          ],
          raw: d
        });
      }
      return {
        books,
        nextCursor: docs.length === limit ? String(page + 1) : undefined
      };
    } catch {
      return {books: []};
    }
  },
  async getBook(id: string) {
    const url = `https://sites.dlib.nyu.edu/viewer/api/presentation/books/${encodeURIComponent(id)}/manifest.json`;
    const manifest = await sourceJson<{label?: string; metadata?: {label: string; value: string}[]}>(url).catch(() => ({label: id}));
    const title = manifest.label || id;
    return {
      externalId: id,
      title: plainText(title),
      authors: [],
      categories: [],
      sourceUrl: `https://dlib.nyu.edu/aco/book/${id}`,
      revision: '1.0',
      licenseUrl: 'https://aco.dlib.nyu.edu/rights',
      rightsHint: 'Public domain digitized classical Arabic books from NYU Arabic Collections Online.',
      files: [
        {
          name: `${id}-lo.pdf`,
          format: 'pdf',
          url: `https://sites.dlib.nyu.edu/viewer/download/pdf/books/${id}/lo`
        }
      ],
      raw: manifest
    };
  },
  async fetchContent(book: RemoteBook) {
    return {pages: [], sections: [], files: book.files};
  }
};
