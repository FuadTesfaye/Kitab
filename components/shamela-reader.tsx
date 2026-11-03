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

export interface Aljam3BookItem {
  id: number;
  title: string;
  author: {
    id: number;
    name: string;
  };
  category: {
    id: number;
    name: string;
  };
  library: {
    id: number;
    name: string;
  };
  pages_count: number;
  files_count: number;
  views_count?: number;
  volumes?: number;
  pdf_url?: string;
  txt_url?: string;
  docx_url?: string;
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
  const [activeTab, setActiveTab] = useState<'500books' | 'shamela'>('500books');
  const [shamelaBooks, setShamelaBooks] = useState<ShamelaIndexEntry[]>([]);
  const [aljam3Books, setAljam3Books] = useState<Aljam3BookItem[]>([]);
  const [aljam3Total, setAljam3Total] = useState(0);
  const [aljam3Page, setAljam3Page] = useState(1);
  const [selectedLibrary, setSelectedLibrary] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Reader state if bookId is present
  const currentId = bookId ? Number(bookId) : null;

  // Load Shamela local books
  useEffect(() => {
    let active = true;
    fetch('/api/shamela/books')
      .then(res => res.json())
      .then(data => {
        if (active) setShamelaBooks(data.books || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Load 500 books from Aljam3 endpoint
  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(aljam3Page),
      limit: '24'
    });
    if (selectedLibrary !== 'all') params.set('library', selectedLibrary);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());

    fetch(`/api/aljam3/books?${params.toString()}`)
      .then(res => {
        if (!res.ok) throw new Error('فشل جلب مصنفات الجامع');
        return res.json();
      })
      .then(data => {
        if (active) {
          setAljam3Books(data.books || []);
          setAljam3Total(data.total || 0);
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
  }, [aljam3Page, selectedLibrary, searchQuery]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    shamelaBooks.forEach(b => {
      if (b.category) set.add(b.category);
    });
    return ['all', ...Array.from(set)];
  }, [shamelaBooks]);

  const filteredShamela = useMemo(() => {
    const q = normalizeArabic(searchQuery.trim());
    return shamelaBooks.filter(b => {
      const matchCat = selectedCategory === 'all' || b.category === selectedCategory;
      if (!matchCat) return false;
      if (!q) return true;
      const haystack = normalizeArabic(`${b.title} ${b.author} ${b.category} ${b.description || ''}`);
      return haystack.includes(q);
    });
  }, [shamelaBooks, searchQuery, selectedCategory]);

  if (currentId && Number.isSafeInteger(currentId) && currentId > 0) {
    return <ShamelaReaderView bookId={currentId} initialPage={initialPage} />;
  }

  const totalPagesAljam3 = Math.max(1, Math.ceil(aljam3Total / 24));

  return (
    <div className="shamela-container">
      <section className="shamela-hero">
        <div className="shamela-badge">المكتبة الرقمية الشاملة · ١٥٠٠+ مصنف إسلامي متاح للتحميل والقراءة</div>
        <h1>مكتبة أمهات الكتب والمصنفات الإسلامية</h1>
        <p className="lead">
          مستودع متكامل يضم أكثر من ١٥٠٠ كتاب معتمد في التفسير والحديث والفقه والعقيدة والسيرة، مع إتاحة التحميل المباشر لملفات PDF الأصلية ونصوص TXT و JSON وقراءة الصفحات مجاناً.
        </p>

        {/* Collection Tabs */}
        <div className="collection-tabs">
          <button
            className={`tab-btn ${activeTab === '500books' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('500books');
              setAljam3Page(1);
            }}
          >
            📚 مكتبة الـ ١٥٠٠ كتاب الإسلامي المعتمدة (تحميل PDF)
          </button>
          <button
            className={`tab-btn ${activeTab === 'shamela' ? 'active' : ''}`}
            onClick={() => setActiveTab('shamela')}
          >
            🏛 فهرس مصنفات الشاملة المباشر
          </button>
        </div>

        {/* Search Bar */}
        <div className="shamela-search-bar">
          <input
            type="search"
            placeholder={
              activeTab === '500books'
                ? 'ابحث في الـ ١٥٠٠ كتاب حسب العنوان، اسم العالم، أو الفن...'
                : 'ابحث في كتب الشاملة...'
            }
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              setAljam3Page(1);
            }}
            className="standalone-input"
          />
        </div>

        {/* Library Filters for 1500 Books Tab */}
        {activeTab === '500books' ? (
          <div className="library-filters">
            <span className="filter-label">المكتبة المصدر:</span>
            <button
              className={`lib-pill ${selectedLibrary === 'all' ? 'active' : ''}`}
              onClick={() => {
                setSelectedLibrary('all');
                setAljam3Page(1);
              }}
            >
              جميع المكتبات ({aljam3Total})
            </button>
            <button
              className={`lib-pill ${selectedLibrary === '3' ? 'active' : ''}`}
              onClick={() => {
                setSelectedLibrary('3');
                setAljam3Page(1);
              }}
            >
              المكتبة الشاملة الوقفية
            </button>
            <button
              className={`lib-pill ${selectedLibrary === '2' ? 'active' : ''}`}
              onClick={() => {
                setSelectedLibrary('2');
                setAljam3Page(1);
              }}
            >
              المكتبة الوقفية
            </button>
            <button
              className={`lib-pill ${selectedLibrary === '1' ? 'active' : ''}`}
              onClick={() => {
                setSelectedLibrary('1');
                setAljam3Page(1);
              }}
            >
              مكتبة المسجد النبوي
            </button>
          </div>
        ) : (
          categories.length > 1 && (
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
          )
        )}
      </section>

      {loading && <div className="loading">جارٍ تحميل قائمة المصنفات والملفات...</div>}
      {error && <div className="error-message">{error}</div>}

      {/* 500 Books View */}
      {activeTab === '500books' && !loading && (
        <>
          <div className="results-header">
            <span>عرض المصنفات (إجمالي: {aljam3Total.toLocaleString('ar')} كتاباً)</span>
            <span>الصفحة {aljam3Page} من {totalPagesAljam3}</span>
          </div>

          <div className="shamela-grid">
            {aljam3Books.map(b => (
              <div key={b.id} className="shamela-card">
                <div className="shamela-card-header">
                  <span className="shamela-tag">{b.category?.name || 'علوم شرعية'}</span>
                  <span className="lib-badge">{b.library?.name || 'المكتبة الإسلامية'}</span>
                </div>
                <h3>
                  <Link href={`/shamela/${b.id}`}>{b.title}</Link>
                </h3>
                <p className="shamela-author">{b.author?.name || 'من علماء الإسلام'}</p>
                <div className="shamela-stats">
                  <span>📄 {b.pages_count?.toLocaleString('ar') || 'متعدد'} صفحة</span>
                  <span>{b.files_count > 1 ? `📚 ${b.files_count} مجلدات` : 'مجلد واحد'}</span>
                </div>
                <div className="shamela-actions">
                  <Link href={`/shamela/${b.id}`} className="primary read-action">
                    قراءة ←
                  </Link>
                  <div className="shamela-downloads">
                    <a
                      href={`/api/aljam3/pdf?id=${b.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="action-pill pdf-pill"
                      title="تحميل ملف الـ PDF الأصلي بجودة عالية"
                    >
                      PDF 📄
                    </a>
                    {b.txt_url && (
                      <a
                        href={b.txt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="action-pill"
                        title="تحميل النص TXT"
                      >
                        TXT 📝
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPagesAljam3 > 1 && (
            <div className="pagination aljam3-pagination">
              <button
                disabled={aljam3Page <= 1}
                onClick={() => {
                  setAljam3Page(p => Math.max(1, p - 1));
                  window.scrollTo({top: 400, behavior: 'smooth'});
                }}
              >
                السابق →
              </button>
              <span>{aljam3Page} / {totalPagesAljam3}</span>
              <button
                disabled={aljam3Page >= totalPagesAljam3}
                onClick={() => {
                  setAljam3Page(p => Math.min(totalPagesAljam3, p + 1));
                  window.scrollTo({top: 400, behavior: 'smooth'});
                }}
              >
                ← التالي
              </button>
            </div>
          )}
        </>
      )}

      {/* Shamela Direct Catalogue Tab */}
      {activeTab === 'shamela' && !loading && (
        <div className="shamela-grid">
          {filteredShamela.map(b => (
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
                <span className="source-tag">المكتبة الشاملة v4</span>
              </div>
              <div className="shamela-actions">
                <Link href={`/shamela/${b.id}`} className="primary read-action">
                  قراءة في المتصفح ←
                </Link>
                <div className="shamela-downloads">
                  <a
                    href={`/api/shamela/download?id=${b.id}&format=pdf`}
                    download
                    className="action-pill pdf-pill"
                    title="تنزيل الكتاب بصيغة PDF"
                  >
                    PDF 📄
                  </a>
                  <a
                    href={`/api/shamela/download?id=${b.id}&format=json`}
                    download
                    className="action-pill"
                    title="تنزيل ملف الكتاب بصيغة JSON"
                  >
                    JSON ⬇
                  </a>
                  <a
                    href={`/api/shamela/download?id=${b.id}&format=txt`}
                    download
                    className="action-pill"
                    title="تنزيل نص الكتاب TXT"
                  >
                    TXT ⬇
                  </a>
                </div>
              </div>
            </div>
          ))}
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
            ← فهرس الكتب
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
              href={`/api/shamela/download?id=${bookId}&format=pdf`}
              download
              className="action-pill pdf-pill"
              title="تنزيل الكتاب بصيغة PDF"
            >
              تنزيل PDF 📄
            </a>
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
