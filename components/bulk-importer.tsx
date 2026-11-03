'use client';
import {useState, useEffect} from 'react';
import {request, post} from './client';
import {ErrorMessage, Loading} from './library';

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

export function BulkImporter() {
  const [status, setStatus] = useState<BulkImportStatus | null>(null);
  const [source, setSource] = useState<'shamela' | 'waqfeya' | 'prophet-mosque' | 'all'>('shamela');
  const [limit, setLimit] = useState<number>(6);
  const [commitToGit, setCommitToGit] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  async function pollStatus() {
    try {
      const res = await request<{status: BulkImportStatus}>('admin/bulk-import');
      setStatus(res.status);
    } catch (e: any) {
      // Don't overwrite error if polling occasionally fails
    }
  }

  useEffect(() => {
    pollStatus();
    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  async function handleStart() {
    setBusy(true);
    setError('');
    try {
      const res = await post<{status: BulkImportStatus}>('admin/bulk-import', {
        source,
        limit,
        commitToGit,
        gitBatchSize: 3
      });
      setStatus(res.status);
    } catch (e: any) {
      setError(e.message || 'فشل بدء الاستيراد');
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    try {
      await request('admin/bulk-import', {method: 'DELETE'});
      pollStatus();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const progressPercent = status?.total && status.total > 0
    ? Math.min(100, Math.round((status.processed / status.total) * 100))
    : 0;

  return (
    <div className="panel bulk-importer-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">من موقع إلى موقع وبالمزامنة مع GitHub</span>
          <h2>نظام الاستيراد الجماعي للكتب (Bulk Importer)</h2>
        </div>
        {status?.active && (
          <span className="status running">
            <span className="pulse-dot">●</span> جاري الاستيراد...
          </span>
        )}
      </div>

      <p className="muted">
        استيراد مباشر من مواقع ومكتبات أمهات الكتب (المكتبة الشاملة، الوقفية، المسجد النبوي) مباشرة إلى المستودع ودفع تلقائي إلى GitHub في دفعات محكمة من ٣ ملفات لكل التزام.
      </p>

      <ErrorMessage message={error} />

      <div className="bulk-import-controls">
        <div className="form-grid">
          <label>
            موقع المصدر
            <select
              value={source}
              disabled={status?.active || busy}
              onChange={e => setSource(e.target.value as any)}
            >
              <option value="shamela">🏛 المكتبة الشاملة الكاملة (٤,٦٤٥ مصنفاً)</option>
              <option value="waqfeya">📜 المكتبة الوقفية (٥٠٠ مصنف)</option>
              <option value="prophet-mosque">🕌 مكتبة المسجد النبوي (٥٠٠ مصنف)</option>
              <option value="all">🌐 جميع المكتبات والمصادر (٥,٦٦٢+ مصنف)</option>
            </select>
          </label>

          <label>
            عدد الكتب المطلوب استيرادها
            <select
              value={limit}
              disabled={status?.active || busy}
              onChange={e => setLimit(Number(e.target.value))}
            >
              <option value={3}>٣ كتب (دفعة واحدة متطابقة)</option>
              <option value={6}>٦ كتب (دفعتان على GitHub)</option>
              <option value={9}>٩ كتب (٣ دفعات على GitHub)</option>
              <option value={15}>١٥ كتاباً (٥ دفعات على GitHub)</option>
              <option value={30}>٣٠ كتاباً (١٠ دفعات على GitHub)</option>
              <option value={60}>٦٠ كتاباً (٢٠ دفعة على GitHub)</option>
            </select>
          </label>
        </div>

        <div className="checkbox-row" style={{margin: '1rem 0'}}>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={commitToGit}
              disabled={status?.active || busy}
              onChange={e => setCommitToGit(e.target.checked)}
            />
            <span>دفع تلقائي إلى مستودع GitHub في دفعات من ٣ ملفات (Auto-Commit & Push)</span>
          </label>
        </div>

        <div className="row-actions">
          {status?.active ? (
            <button className="text-button danger" onClick={handleStop}>
              إيقاف الاستيراد ⏹
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={handleStart}>
              {busy ? 'جارٍ البدء...' : 'بدء الاستيراد الجماعي والمزامنة 🚀'}
            </button>
          )}
        </div>
      </div>

      {status && (
        <div className="bulk-status-box" style={{marginTop: '1.5rem', background: 'var(--bg-subtle, #f8f6f0)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color, #e4ded0)'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
            <strong>مستوى التقدم: {status.processed} / {status.total}</strong>
            <span>{progressPercent}%</span>
          </div>

          <div style={{background: '#e0dcd0', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '1rem'}}>
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                background: 'var(--primary-color, #1a472a)',
                transition: 'width 0.3s ease'
              }}
            />
          </div>

          {status.currentBook && (
            <p style={{margin: '0.5rem 0', fontWeight: 600}}>
              📖 المعالجة الحالية: {status.currentBook}
            </p>
          )}

          <div className="stats-row" style={{display: 'flex', gap: '1.5rem', margin: '0.75rem 0'}}>
            <div>مستورد: <strong>{status.imported}</strong></div>
            <div>تخطي: <strong>{status.skipped}</strong></div>
            <div>إخفاق: <strong>{status.failed}</strong></div>
            <div>الالتزامات على GitHub: <strong>{status.commits.length}</strong></div>
          </div>

          {status.commits.length > 0 && (
            <div style={{margin: '0.5rem 0'}}>
              <small className="muted">أحدث دفعات GitHub: </small>
              {status.commits.slice(-5).map(hash => (
                <code key={hash} style={{marginLeft: '6px', padding: '2px 6px', background: '#e8e4d8', borderRadius: '4px'}}>
                  {hash}
                </code>
              ))}
            </div>
          )}

          <details open style={{marginTop: '1rem'}}>
            <summary style={{cursor: 'pointer', fontWeight: 600}}>سجل العمليات المباشر (Terminal Log)</summary>
            <div
              style={{
                background: '#1e1e1e',
                color: '#d4d4d4',
                padding: '0.75rem',
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                maxHeight: '220px',
                overflowY: 'auto',
                direction: 'ltr',
                textAlign: 'left',
                marginTop: '0.5rem'
              }}
            >
              {status.logs.length === 0 ? (
                <div>جاهز لبدء عمليات الاستيراد...</div>
              ) : (
                status.logs.map((log, i) => (
                  <div key={i} style={{whiteSpace: 'pre-wrap', lineHeight: 1.4}}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
