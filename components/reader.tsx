'use client';
import Link from 'next/link';
import {useState, useEffect, type FormEvent, type ClipboardEvent} from 'react';
import {request, post} from './client';
import {useLibrary, ErrorMessage, Loading, safeUrl} from './library';
import {stripDiacritics} from '@/lib/arabic';
import type {Edition} from '@/lib/types';

interface ReadingPage {
  seq: number;
  part: string;
  page_no: string;
  body: string;
  footnotes: string;
}

interface Section {
  title: string;
  seq: number;
}

interface File {
  id: string;
  format: string;
  original_name: string;
}

interface SurahItem {
  number: number;
  name: string;
  englishName: string;
  numberOfAyahs: number;
}

const TAFSIR_OPTIONS = [
  {id: 'ar-tafsir-as-saadi', name: 'تفسير السعدي (تيسير الكريم الرحمن)'},
  {id: 'ar-tafsir-ibn-kathir', name: 'تفسير ابن كثير (تفسير القرآن العظيم)'},
  {id: 'ar-tafsir-muyassar', name: 'التفسير الميسر'},
  {id: 'ar-tafsir-al-tabari', name: 'تفسير الطبري (جامع البيان)'},
  {id: 'ar-tafseer-al-qurtubi', name: 'تفسير القرطبي (الجامع لأحكام القرآن)'},
  {id: 'ar-tafsir-al-baghawi', name: 'تفسير البغوي (معالم التنزيل)'},
  {id: 'ar-tafsir-al-jalalayn', name: 'تفسير الجلالين'}
];

export function Reader({id}: {id: string}) {
  const {user, notify, refresh} = useLibrary();
  const [edition, setEdition] = useState<Edition | null>(null);
  const [page, setPage] = useState<ReadingPage | null>(null);
  const [seq, setSeq] = useState(1);
  const [sections, setSections] = useState<Section[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [surahs, setSurahs] = useState<SurahItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('text');
  const [font, setFont] = useState(26);
  const [fontFamily, setFontFamily] = useState<'amiri' | 'scheherazade' | 'traditional'>('amiri');
  const [tashkeel, setTashkeel] = useState(true);
  const [theme, setTheme] = useState('paper');
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<{seq: number; body: string}[]>([]);
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState('');
  const [saving, setSaving] = useState(false);
  const [jump, setJump] = useState('1');

  // Tafsir state
  const [tafsirOpen, setTafsirOpen] = useState(false);
  const [tafsirAuthor, setTafsirAuthor] = useState('ar-tafsir-as-saadi');
  const [tafsirText, setTafsirText] = useState('');
  const [tafsirLoading, setTafsirLoading] = useState(false);

  // Audio recitation state
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  const isQuran = edition?.work_id.includes('quran') || edition?.external_id.includes('tanzil') || page?.part?.includes('سورة') || !isNaN(Number(page?.part));
  const surahNum = Number(page?.part || 0);
  const ayahNum = Number(page?.page_no || 0);

  useEffect(() => {
    let active = true;
    setEdition(null);
    setError('');
    setLoading(true);
    (async () => {
      const info = await request<{edition: Edition; sections: Section[]}>('editions/' + id);
      const f = await request<{files: File[]}>('editions/' + id + '/files');
      let target = Number(new URLSearchParams(window.location.search).get('page') || 0);
      if (!target && user) {
        const r = await request<{progress: {seq: number} | null}>('progress/' + id);
        target = r.progress?.seq || 1;
      }
      if (!target) {
        try { target = Number(localStorage.getItem('kitabs:progress:' + id) || 1); } catch {}
      }
      if (active) {
        setEdition(info.edition);
        setFiles(f.files);
        setSections(info.sections);
        setSeq(Number.isInteger(target) && target > 0 && target <= info.edition.page_count ? target : 1);
        setMode(info.edition.page_count ? 'text' : 'pdf');
        setLoading(false);
      }
    })().catch(e => {
      if (active) {
        setError(e.message);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [id, user?.id]);

  useEffect(() => {
    // Load surahs list for Quran reader
    request<{surahs: SurahItem[]}>('surahs').then(r => setSurahs(r.surahs)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!edition || !edition.page_count) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    request<{page: ReadingPage}>('editions/' + id + '/pages?seq=' + seq, {signal: controller.signal})
      .then(r => {
        setPage(r.page);
        setJump(String(seq));
        window.history.replaceState(null, '', `/read/${id}?page=${seq}`);
        try { localStorage.setItem('kitabs:progress:' + id, String(seq)); } catch {}
        if (user) post('progress/' + id, {seq}).catch(e => notify(e.message));
        if (audioEl) { audioEl.pause(); setIsPlaying(false); }
      })
      .catch(e => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, seq, edition?.id, user?.id]);

  async function find(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await request<{hits: typeof hits}>('search?edition=' + id + '&q=' + encodeURIComponent(search));
      setHits(r.hits);
      if (!r.hits.length) notify('لم تُعثر على نتائج');
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function openTafsir(author = tafsirAuthor) {
    if (!surahNum || !ayahNum) return;
    setTafsirOpen(true);
    setTafsirLoading(true);
    try {
      const res = await request<{text: string | null}>(`tafsir?surah=${surahNum}&ayah=${ayahNum}&author=${author}`);
      setTafsirText(res.text || 'لا يتوفر تفسير لهذه الآية في المرجع المختار.');
    } catch {
      setTafsirText('تعذّر جلب التفسير، يرجى المحاولة لاحقاً.');
    } finally {
      setTafsirLoading(false);
    }
  }

  function playRecitation() {
    if (!surahNum || !ayahNum) return;
    if (isPlaying && audioEl) {
      audioEl.pause();
      setIsPlaying(false);
      return;
    }
    const sStr = String(surahNum).padStart(3, '0');
    const aStr = String(ayahNum).padStart(3, '0');
    const audioUrl = `https://everyayah.com/data/Alafasy_128kbps/${sStr}${aStr}.mp3`;
    const audio = new Audio(audioUrl);
    audio.onended = () => setIsPlaying(false);
    audio.onerror = () => {
      notify('تعذّر تشغيل التلاوة الصوتية');
      setIsPlaying(false);
    };
    audio.play().then(() => {
      setIsPlaying(true);
      setAudioEl(audio);
    }).catch(() => notify('تعذّر بدء الصوت'));
  }

  function handleCopy(e: ClipboardEvent<HTMLElement>) {
    const selection = window.getSelection()?.toString().trim();
    if (selection && selection.length > 5) {
      const ref = isQuran && surahNum && ayahNum 
        ? `سورة ${surahs.find(s=>s.number===surahNum)?.name||surahNum}، آية ${ayahNum}`
        : `${edition?.publisher || 'كِتاب'}، صفحة ${page?.page_no || seq}`;
      const cited = `«${selection}»\n— [${ref} — كِتاب: المكتبة الإسلامية]`;
      e.clipboardData.setData('text/plain', cited);
      e.preventDefault();
      notify('تم نسخ النص مع التوثيق المرجعي 📋');
    }
  }

  const pdfs = files.filter(f => f.format === 'pdf');
  const [pdfId, setPdfId] = useState('');
  const selectedPdf = pdfs.find(f => f.id === pdfId) || pdfs[0];

  if (!edition) return error ? <ErrorMessage message={error} /> : <Loading />;

  const displayBody = page ? (tashkeel ? page.body : stripDiacritics(page.body)) : '';

  return (
    <section className={`reader theme-${theme} font-${fontFamily}`}>
      <div className="reader-top">
        <Link href={`/book/${edition.work_id}`}>→ تفاصيل الكتاب</Link>
        <span>{edition.publisher || 'نسخة رقمية'} · {edition.source_id}</span>
        <a href={safeUrl(edition.source_url)} target="_blank" rel="noopener noreferrer">المصدر ↗</a>
      </div>

      <div className="reader-toolbar">
        <div className="row-actions">
          <button className={mode === 'text' ? 'primary' : 'secondary'} disabled={!edition.page_count} onClick={() => setMode('text')}>النص الرقمي</button>
          <button className={mode === 'pdf' ? 'primary' : 'secondary'} disabled={!pdfs.length} onClick={() => setMode('pdf')}>الطبعة المصوّرة (PDF)</button>
          
          <button className={`secondary ${tashkeel ? 'active-tool' : ''}`} onClick={() => setTashkeel(!tashkeel)} title="إظهار / إخفاء الحركات">
            {tashkeel ? 'التشكيل: مُفعّل' : 'التشكيل: مُعطّل'}
          </button>
        </div>

        <div className="row-actions">
          <label className="sr-only" htmlFor="font-family">نوع الخط</label>
          <select id="font-family" value={fontFamily} onChange={e => setFontFamily(e.target.value as any)}>
            <option value="amiri">خط أميري (أصيل)</option>
            <option value="scheherazade">شهرزاد (مصحف)</option>
            <option value="traditional">معياري (واضح)</option>
          </select>

          <button className="secondary font-btn" aria-label="تصغير الخط" onClick={() => setFont(Math.max(16, font - 2))}>أ−</button>
          <button className="secondary font-btn" aria-label="تكبير الخط" onClick={() => setFont(Math.min(46, font + 2))}>أ+</button>

          <label className="sr-only" htmlFor="reader-theme">لون القراءة</label>
          <select id="reader-theme" value={theme} onChange={e => setTheme(e.target.value)}>
            <option value="paper">ورقي كلاسيكي</option>
            <option value="sepia">دافئ (سيبيا)</option>
            <option value="dark">ليلي هادئ</option>
          </select>
        </div>
      </div>

      <ErrorMessage message={error} />

      <div className="reader-layout">
        <aside className="reader-sidebar">
          <h2>فهرس الكتاب</h2>

          {isQuran && surahs.length > 0 && (
            <div className="surah-picker">
              <label htmlFor="surah-select">الانتقال المباشر لسورة:</label>
              <select 
                id="surah-select" 
                value={surahNum || 1} 
                onChange={e => {
                  const sNum = Number(e.target.value);
                  const targetSec = sections.find(s => s.title.includes(`سورة ${sNum}`));
                  if (targetSec) setSeq(targetSec.seq);
                }}
              >
                {surahs.map(s => (
                  <option key={s.number} value={s.number}>
                    {s.number}. سورة {s.name} ({s.numberOfAyahs} آية)
                  </option>
                ))}
              </select>
            </div>
          )}

          {sections.length ? (
            sections.map((s, i) => (
              <button 
                key={i} 
                onClick={() => { setSeq(s.seq); setMode('text'); }} 
                className={seq === s.seq ? 'active' : ''}
              >
                {s.title}
              </button>
            ))
          ) : (
            <p className="muted">لا يتوفر فهرس تفصيلي لهذه النسخة.</p>
          )}

          {edition.page_count > 0 && (
            <form onSubmit={find} className="reader-search">
              <label htmlFor="within-search">بحث داخل هذا الكتاب</label>
              <input 
                id="within-search" 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
                placeholder="ابحث عن كلمة أو عبارة..." 
                required 
                maxLength={300}
              />
              <button className="secondary">بحث</button>
            </form>
          )}

          {hits.map(h => (
            <button key={h.seq} className="search-hit-btn" onClick={() => setSeq(h.seq)}>
              <strong>الصفحة {h.seq}:</strong> {h.body.slice(0, 85)}…
            </button>
          ))}
        </aside>

        <div className="reader-content">
          {mode === 'text' ? (
            <>
              {loading ? (
                <Loading />
              ) : page && (
                <>
                  <div className="page-reference">
                    <div>
                      {page.part && <strong>{page.part} · </strong>}
                      <span>{isQuran ? `الآية ${page.page_no}` : `الصفحة المطبوعة: ${page.page_no || 'غير محددة'}`}</span>
                    </div>

                    <div className="quick-actions">
                      {isQuran && surahNum > 0 && ayahNum > 0 && (
                        <>
                          <button className="quran-action-btn" onClick={playRecitation} title="استمع للآية بصوت العفاسي">
                            {isPlaying ? '⏸ إيقاف التلاوة' : '▶ استماع للآية'}
                          </button>
                          <button className="quran-action-btn" onClick={() => openTafsir()} title="عرض تفاسير هذه الآية">
                            📖 تفسير الآية
                          </button>
                        </>
                      )}
                      <span className="seq-count">صفحة {seq} من {edition.page_count}</span>
                    </div>
                  </div>

                  <article 
                    className="reading-text" 
                    style={{fontSize: font}} 
                    onCopy={handleCopy}
                    onMouseUp={() => {
                      const selection = window.getSelection();
                      if (selection?.anchorNode && document.querySelector('.reading-text')?.contains(selection.anchorNode)) {
                        setQuote(selection.toString().slice(0, 5000));
                      }
                    }}
                  >
                    {displayBody}
                  </article>

                  {page.footnotes && (
                    <div className="footnotes">
                      <h3>التحقيق والحواشي</h3>
                      {page.footnotes.includes('صحيح') || page.footnotes.includes('حسن') ? (
                        <div className="hadith-grade-badge">
                          <span className="badge-icon">✦</span>
                          <strong>درجة الحديث: </strong> {page.footnotes}
                        </div>
                      ) : (
                        <p>{page.footnotes}</p>
                      )}
                    </div>
                  )}

                  {/* Tafsir Drawer */}
                  {tafsirOpen && isQuran && (
                    <div className="tafsir-drawer panel">
                      <div className="tafsir-header">
                        <div>
                          <h3>تفسير الآية ({surahNum}:{ayahNum})</h3>
                          <select 
                            value={tafsirAuthor} 
                            onChange={e => {
                              setTafsirAuthor(e.target.value);
                              openTafsir(e.target.value);
                            }}
                          >
                            {TAFSIR_OPTIONS.map(opt => (
                              <option key={opt.id} value={opt.id}>{opt.name}</option>
                            ))}
                          </select>
                        </div>
                        <button className="text-button" onClick={() => setTafsirOpen(false)}>إغلاق ×</button>
                      </div>

                      <div className="tafsir-body">
                        {tafsirLoading ? <Loading /> : <p>{tafsirText}</p>}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="reader-pagination">
                <button className="secondary" disabled={seq <= 1 || loading} onClick={() => setSeq(seq - 1)}>→ السابقة</button>
                <form onSubmit={e => {
                  e.preventDefault();
                  const n = Number(jump);
                  if (Number.isSafeInteger(n) && n >= 1 && n <= edition.page_count) setSeq(n);
                }}>
                  <label className="sr-only" htmlFor="page-jump">رقم صفحة القراءة</label>
                  <input id="page-jump" type="number" min="1" max={edition.page_count} value={jump} onChange={e => setJump(e.target.value)} />
                  <button className="text-button">انتقال</button>
                </form>
                <button className="secondary" disabled={seq >= edition.page_count || loading} onClick={() => setSeq(seq + 1)}>التالية ←</button>
              </div>
            </>
          ) : selectedPdf ? (
            <>
              <label>
                المجلد:
                <select value={selectedPdf.id} onChange={e => setPdfId(e.target.value)}>
                  {pdfs.map(f => <option key={f.id} value={f.id}>{f.original_name}</option>)}
                </select>
              </label>
              <iframe title="الطبعة المصورة" className="pdf-frame" src={'/api/files/' + selectedPdf.id} />
              <a className="secondary" href={'/api/files/' + selectedPdf.id} target="_blank" rel="noopener noreferrer">فتح ملف PDF في نافذة مستقلة ↗</a>
            </>
          ) : (
            <p>لم تُضف طبعة مصوّرة لهذه النسخة.</p>
          )}

          <div className="reader-attribution">
            <p>{edition.attribution}</p>
            {edition.license_url && <a href={safeUrl(edition.license_url)} target="_blank" rel="noopener noreferrer">شروط الترخيص ↗</a>}
          </div>

          {user && mode === 'text' && page ? (
            <form className="note-form" onSubmit={async e => {
              e.preventDefault();
              setSaving(true);
              try {
                await post('bookmarks', {workId: edition.work_id, editionId: id, seq, note, quote});
                await refresh();
                notify('حُفظت الإشارة والملاحظة في حسابك بنجاح');
                setNote('');
                setQuote('');
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}>
              <h3>إشارة وملاحظة دراسية</h3>
              {quote && <blockquote>{quote}</blockquote>}
              <label>اقتباس من الصفحة:<textarea value={quote} onChange={e => setQuote(e.target.value)} maxLength={5000} placeholder="حدد نصاً من الكتاب ليظهر هنا تلقائياً..." /></label>
              <label>ملاحظتك العلمية:<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={5000} placeholder="دوّن تعليقك أو فوائدك من هذه الصفحة..." /></label>
              <button className="secondary" disabled={saving}>حفظ الملاحظة على هذه الصفحة</button>
            </form>
          ) : !user && (
            <p className="notice"><Link href="/account">سجّل الدخول لحفظ ملاحظاتك ومزامنة قراءتك عبر أجهزتك.</Link></p>
          )}
        </div>
      </div>
    </section>
  );
}
