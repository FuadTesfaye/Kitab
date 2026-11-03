import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {getBulkImportStatus, sanitizeTitle, startBulkImport} from '../lib/bulk-importer';
import {api} from '../lib/api';

test('Bulk import engine sanitization and initial status', async () => {
  const safe = sanitizeTitle('كتاب التوحيد / ابن عبد الوهاب : طبعة 1');
  assert.ok(safe.length > 0);
  assert.ok(!safe.includes('/'));
  assert.ok(!safe.includes(':'));

  const status = getBulkImportStatus();
  assert.equal(typeof status.active, 'boolean');
  assert.equal(typeof status.imported, 'number');
  assert.equal(Array.isArray(status.commits), true);
  assert.equal(Array.isArray(status.logs), true);
});

test('Bulk import execution without git commit stages books properly', async () => {
  const initialStatus = getBulkImportStatus();
  assert.equal(initialStatus.active, false);

  const status = await startBulkImport({
    source: 'shamela',
    limit: 1,
    offset: 0,
    commitToGit: false
  });

  assert.equal(typeof status.total, 'number');

  // Wait for async processing
  let maxWait = 20;
  while (maxWait-- > 0) {
    const current = getBulkImportStatus();
    if (!current.active) break;
    await new Promise(r => setTimeout(r, 200));
  }

  const finalStatus = getBulkImportStatus();
  assert.equal(finalStatus.active, false);
  assert.ok(finalStatus.logs.length > 0);
});

test('Bulk import admin API requires admin authentication', async () => {
  const req = new Request('http://localhost:3000/api/admin/bulk-import', {
    method: 'GET'
  });
  const res = await api(req, ['admin', 'bulk-import']);
  // Without admin session cookie, should return 401 Unauthorized
  assert.equal(res.status, 401);
});
