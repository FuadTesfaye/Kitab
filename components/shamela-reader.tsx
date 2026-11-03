'use client';
import Link from 'next/link';
import {useState, useEffect, useMemo} from 'react';
import {normalizeArabic, plainText} from '@/lib/arabic';

export interface ShamelaIndexEntry {
  id: number;
  title: string;
  author: string;
  author_id?: number;
  death?: number;
  category: string;
  volumes?: number;
  pages?: number;
  download_url?: string;
  description?: string;
}

export interface ShamelaBookDetail {
  id: number;
  title: string;
  author: string;
  authorBio?: string;
  category: string;
  pageCount: number;
  headings: {title: string; page: number}[];
}

export interface ShamelaPageData {
  page_num: number;
  vol: string;
  body: string;
  headings?: string[];
}

export function ShamelaBrowser({bookId, initialPage = 1}: {bookId?: string; initialPage?: number}) {
  const [books, setBooks] = useState<ShamelaIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Reader state if bookId is present
  const currentId = bookId ? Number(bookId) : null;

  useEffect(() => {
    let active = true;
    fetch('/api/shamela/books')
      .then(res => {
        if (!res.ok) throw new Error('فشل تحميل قائمة كتب الشاملة');
        return res.json();
      })
      .then(data => {
        if (active) {
          setBooks(data.books || []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    books.forEach(b => {
      if (b.category) set.add(b.category);
    });
    return ['all', ...Array.from(set)];
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = normalizeArabic(searchQuery.trim());
    return books.filter(b => {
      const matchCat = selectedCategory === 'all' || b.category === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      const haystack = normalizeArabic(`${b.title} ${b.author} ${b.category} ${b.description || ''}`);
      return haystack.includes(q);
    });
  }, [books, searchQuery, selectedCategory]);

  if (currentId && Number.isSafeInteger(currentId) && currentId > 0) {
    return <ShamelaReaderView bookId={currentId} initialPage={initialPage} />;
  }

  return (
    <div className="shamela-container">
      <section className="shamela-hero">
        <div className="shamela-badge">المكتبة الشاملة v4 · مستودع رقمي قابل للتنزيل</div>
        <h1>المكتبة الشاملة: أمهات الكتب والمصنفات الإسلامية</h1>
        <p className="lead">
          تصفّح واقرأ وحمّل نصوص كتب المكتبة الشاملة بصيغتي JSON و TXT، مع فهرسة دقيقة للصفحات والأجزاء والأبواب.
        </p>

        <div className="shamela-search-bar">
          <input
            type="search"
            placeholder="ابحث في كتب الشاملة حسب العنوان، المؤلف، أو الفن..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="standalone-input"
          />
        </div>

        {categories.length > 1 && (
          <div className="shamela-categories">
            {categories.map(cat => (
              <button
                key={cat}
                className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat === 'all' ? 'جميع الفنون' : cat}
              </button>
            ))}
          </div>
        )}
      </section>

      {loading && <div className="loading">جارٍ تحميل مصنفات الشاملة...</div>}
      {error && <div className="error-message">{error}</div>}

      {!loading && !error && (
        <div className="shamela-grid">
          {filteredBooks.map(b => (
            <div key={b.id} className="shamela-card">
              <div className="shamela-card-header">
                <span className="shamela-tag">{b.category}</span>
                {b.volumes ? <span className="shamela-vol-tag">{b.volumes} أجزاء</span> : null}
              </div>
              <h3>
                <Link href={`/shamela/${b.id}`}>{b.title}</Link>
              </h3>
              <p className="shamela-author">
                {b.author} {b.death ? <span className="death-badge">({b.death} هـ)</span> : null}
              </p>
              {b.description && <p className="shamela-desc">{b.description}</p>}
              <div className="shamela-stats">
                <span>📄 {b.pages?.toLocaleString('ar') || 'متعدد'} صفحة</span>
                <span className="source-tag">المكتبة الشاملة</span>
              </div>
              <div className="shamela-actions">
                <Link href={`/shamela/${b.id}`} className="primary read-action">
                  قراءة في المتصفح ←
                </Link>
                <div className="shamela-downloads">
                  <a
                    href={`/api/shamela/download?id=${b.id}&format=json`}
                    download
                    className="action-pill"
                    title="تنزيل ملف الكتاب بصيغة JSON كاملة"
                  >
                    JSON ⬇
                  </a>
                  <a
                    href={`/api/shamela/download?id=${b.id}&format=txt`}
                    download
                    className="action-pill"
                    title="تنزيل نص الكتاب المجرّد TXT"
                  >
                    TXT ⬇
                  </a>
                </div>
              </div>
            </div>
          ))}

          {filteredBooks.length === 0 && (
            <div className="empty">
              <h3>لم يُعثر على مصنفات مطابقة</h3>
              <p>جرّب تعديل كلمات البحث أو اختيار تصنيف آخر.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShamelaReaderView({bookId, initialPage}: {bookId: number; initialPage: number}) {
  const [info, setInfo] = useState<ShamelaBookDetail | null>(null);
  const [currentPage, setCurrentPage] = useState<ShamelaPageData | null>(null);
  const [pageNum, setPageNum] = useState<number>(initialPage);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Typography controls
  const [fontSize, setFontSize] = useState<number>(20);
  const [fontFamily, setFontFamily] = useState<'amiri' | 'scheherazade' | 'traditional'>('amiri');
  const [showTashkeel, setShowTashkeel] = useState<boolean>(true);

  // Load Book metadata
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/shamela/book?id=${bookId}`)
      .then(r => {
        if (!r.ok) throw new Error('فشل جلب بيانات الكتاب');
        return r.json();
      })
      .then(data => {
        if (active) {
          setInfo(data.book);
          setLoading(false);
        }
      })
      .catch(e => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [bookId]);

  // Load specific page
  useEffect(() => {
    let active = true;
    setPageLoading(true);
    fetch(`/api/shamela/page?id=${bookId}&page=${pageNum}`)
      .then(r => {
        if (!r.ok) throw new Error(`تعذر جلب الصفحة ${pageNum}`);
        return r.json();
      })
      .then(data => {
        if (active) {
          setCurrentPage(data.page);
          setPageLoading(false);
          // scroll to top of reading area
          window.scrollTo({top: 0, behavior: 'smooth'});
        }
      })
      .catch(e => {
        if (active) {
          setError(e.message);
          setPageLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [bookId, pageNum]);

  const maxPages = info?.pageCount || 100;

  function copyCitation() {
    if (!info || !currentPage) return;
    const text = `${currentPage.body}\n\n[المصدر: ${info.title}، تأليف: ${info.author}، الجزء: ${currentPage.vol || '1'}، الصفحة: ${currentPage.page_num}]`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  const renderedBody = useMemo(() => {
    if (!currentPage) return '';
    if (!showTashkeel) {
      return plainText(currentPage.body);
    }
    return currentPage.body;
  }, [currentPage, showTashkeel]);

  const fontClass =
    fontFamily === 'traditional'
      ? 'font-traditional'
      : fontFamily === 'scheherazade'
      ? 'font-scheherazade'
      : 'font-amiri';

  return (
    <div className="shamela-reader-wrapper">
      <header className="shamela-reader-bar">
        <div className="reader-bar-start">
          <Link href="/shamela" className="back-link">
            ← فهرس الشاملة
          </Link>
          <div className="reader-titles">
            <h2>{info?.title || `كتاب ${bookId}`}</h2>
            <small>{info?.author}</small>
          </div>
        </div>

        <div className="reader-bar-actions">
          {/* Typography Toolbar */}
          <div className="typography-toolbar">
            <button
              className={`tool-btn ${showTashkeel ? 'active' : ''}`}
              onClick={() => setShowTashkeel(!showTashkeel)}
              title={showTashkeel ? 'إخفاء التشكيل' : 'إظهار التشكيل'}
            >
              {showTashkeel ? 'بِالتَّشْكِيلِ' : 'بدون تشكيل'}
            </button>

            <select
              aria-label="نوع الخط"
              value={fontFamily}
              onChange={e => setFontFamily(e.target.value as any)}
              className="font-select"
            >
              <option value="amiri">خط أميري (Amiri)</option>
              <option value="scheherazade">شهرزاد (Scheherazade)</option>
              <option value="traditional">الخط التقليدي</option>
            </select>

            <button
              className="tool-btn"
              onClick={() => setFontSize(s => Math.min(s + 2, 34))}
              title="تكبير الخط"
            >
              A+
            </button>
            <button
              className="tool-btn"
              onClick={() => setFontSize(s => Math.max(s - 2, 14))}
              title="تصغير الخط"
            >
              A-
            </button>
            <button
              className={`tool-btn ${copied ? 'active' : ''}`}
              onClick={copyCitation}
              title="نسخ الصفحة مع التوثيق"
            >
              {copied ? 'تم النسخ ✓' : 'نسخ مع التوثيق'}
            </button>
          </div>

          {/* Quick downloads */}
          <div className="reader-download-pills">
            <a
              href={`/api/shamela/download?id=${bookId}&format=json`}
              download
              className="action-pill primary-pill"
              title="تنزيل الكتاب JSON"
            >
              تنزيل JSON
            </a>
            <a
              href={`/api/shamela/download?id=${bookId}&format=txt`}
              download
              className="action-pill"
              title="تنزيل الكتاب TXT"
            >
              تنزيل TXT
            </a>
            {info?.headings && info.headings.length > 0 && (
              <button
                className={`tool-btn ${tocOpen ? 'active' : ''}`}
                onClick={() => setTocOpen(!tocOpen)}
              >
                الفهرس ({info.headings.length})
              </button>
            )}
          </div>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="shamela-reader-layout">
        {/* TOC Sidebar if open */}
        {tocOpen && info?.headings && (
          <aside className="shamela-toc-sidebar">
            <div className="toc-header">
              <h3>فهرس الأبواب والموضوعات</h3>
              <button onClick={() => setTocOpen(false)} aria-label="إغلاق الفهرس">
                ×
              </button>
            </div>
            <ul className="toc-list">
              {info.headings.map((h, i) => (
                <li key={i}>
                  <button
                    className={pageNum === h.page ? 'active' : ''}
                    onClick={() => {
                      setPageNum(h.page);
                      setTocOpen(false);
                    }}
                  >
                    <span className="toc-title">{h.title}</span>
                    <span className="toc-page">ص {h.page}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        {/* Main page content */}
        <main className="shamela-page-surface">
          {pageLoading ? (
            <div className="page-spinner">جارٍ تحميل الصفحة {pageNum}...</div>
          ) : currentPage ? (
            <article className={`shamela-reading-text ${fontClass}`} style={{fontSize: `${fontSize}px`}}>
              <div className="page-info-header">
                <span>الجزء: {currentPage.vol || '1'}</span>
                <span>الصفحة: {currentPage.page_num}</span>
              </div>

              {currentPage.headings && currentPage.headings.length > 0 && (
                <div className="page-headings">
                  {currentPage.headings.map((h, i) => (
                    <h3 key={i} className="shamela-heading-badge">
                      {h}
                    </h3>
                  ))}
                </div>
              )}

              <div className="reading-body">{renderedBody}</div>
            </article>
          ) : (
            <div className="empty">لا يوجد نص لهذه الصفحة.</div>
          )}

          {/* Reader Pagination */}
          <div className="shamela-pagination">
            <button
              className="page-nav-btn"
              disabled={pageNum <= 1 || pageLoading}
              onClick={() => setPageNum(1)}
              title="الصفحة الأولى"
            >
              ⇥ الأولى
            </button>
            <button
              className="page-nav-btn"
              disabled={pageNum <= 1 || pageLoading}
              onClick={() => setPageNum(p => Math.max(1, p - 1))}
              title="السابق"
            >
              → السابقة
            </button>

            <div className="page-jump">
              <span>صفحة</span>
              <input
                type="number"
                min={1}
                max={maxPages}
                value={pageNum}
                onChange={e => {
                  const val = Number(e.target.value);
                  if (Number.isSafeInteger(val) && val >= 1 && val <= maxPages) {
                    setPageNum(val);
                  }
                }}
              />
              <span>من {maxPages.toLocaleString('ar')}</span>
            </div>

            <button
              className="page-nav-btn"
              disabled={pageNum >= maxPages || pageLoading}
              onClick={() => setPageNum(p => Math.min(maxPages, p + 1))}
              title="التالي"
            >
              التالية ←
            </button>
            <button
              className="page-nav-btn"
              disabled={pageNum >= maxPages || pageLoading}
              onClick={() => setPageNum(maxPages)}
              title="الصفحة الأخيرة"
            >
              الأخيرة ⇤
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
