# كِتاب — Kitabs Islamic Digital Library

A self-hosted, Arabic-first catalogue, reader, and edition-aware book ingestion system. The app code is MIT licensed. Imported books and dataset files keep their own rights; the code license grants no rights to redistribute them.

## Run locally

Requires Node.js 22.13+ and npm. This environment provides a quick-start **SQLite** database and local object storage; do not use local SQLite on a shared production server.

```sh
cp .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run admin:create     # prompts for an admin password without echoing it
npm run dev
```

Open <http://localhost:3000>. Start the separate ingestion worker in another terminal:

```sh
npm run worker
```

The landing page and sample entries work without downloading a corpus. The 12 starter entries are bibliographic examples, not proof that a particular edition is licensed. They include no third-party full text.

## PostgreSQL deployment

For a private server, set a long random `POSTGRES_PASSWORD`, `COOKIE_SECURE=true`, and `APP_URL=https://your-host`; configure TLS at the reverse proxy. Set `DATABASE_URL` and optional S3/MinIO and OpenSearch endpoints in `.env`. Docker Compose runs PostgreSQL, the web application, and an independent durable worker. The `search` profile adds OpenSearch; the app retains its database search if OpenSearch is unavailable.

```sh
mkdir -p data imports
npm run build
npm run db:migrate
npm run db:seed
npm run admin:create
npm run start
# In a separate terminal:
npm run worker
# Or deploy the web and worker services with Docker Compose:
docker compose up --build -d
```

Register the first administrator with `npm run admin:create` before accepting student registrations. Make regular `npm run backup` snapshots and separately back up object storage. In production use PostgreSQL's `pg_dump` and follow the database and MinIO backup runbooks in your hosting environment. Do not put production `.env`, scans, or database dumps in the public repository.

## What works

- Responsive right-to-left Arabic catalogue, search, category and author browsing, detail pages, saved works, and teacher-curated reading lists.
- Password-protected student, teacher, and administrator accounts, reading progress, bookmarks, and passage notes.
- Separate work, author, edition, source, page, file, and edition-specific rights records.
- Provider adapters for Internet Archive, OpenITI, Turath, the Shamela v4 client, and selected Waqfeya / Prophet's Mosque Hugging Face repositories.
- Arabic-normalized full-text search, original-text exact search, PostgreSQL/SQLite fallback, and optional OpenSearch.
- Durable background jobs, revision-aware metadata discovery, per-book ingestion, checksums, S3/MinIO object storage, an administrator review queue, publication and withdrawal controls, and audit log.
- Native browser PDF reader with byte-range requests; text reader with printed page references, sections, font and night modes.
- Works with a local SQLite file and local object storage without Docker or third-party API keys.

## Book imports

See [the source and download guide](docs/DOWNLOADS.md) before selecting files. Start with 20–50 texts whose rights you have verified. Use external databases and object storage for book content; Git contains application code and documentation. Open `/downloads` in the app for the same guidance.

Open `.env.example` and configure individual providers. For Turath set selected book IDs. For Hugging Face confirm the actual Prophet's Mosque repository first. Shamela requires its own API credentials. Empty provider credentials disable protected integrations. Run `npm run sync -- openiti` or enable a source in `/admin`, then run `npm run worker` to process its job. The default service performs a small, cursor-based discovery batch at a time.

Local import formats:

```sh
npm run import -- manifest imports/manifest.json
npm run import -- jsonl imports/manifest.jsonl
npm run import -- openiti imports/text.mARkdown 'عنوان الكتاب' 'اسم المؤلف'
npm run import -- shamela-folder imports/shamela/one-selected-book
```

### Tanzil Quran text

On a server with outbound HTTPS access, you can retrieve the official Uthmani text from Tanzil and stage it as one locally managed edition:

```sh
npm run import -- tanzil
```

The downloader requests the verbatim numbered Tanzil v1.1 export, validates that all 6,236 verses are present and ordered, saves the untouched source file under ignored `imports/tanzil/`, and records its SHA-256. It does **not** rewrite the Quran text or automatically approve/publicize it. Review the edition in `/admin`, retain Tanzil attribution and the source link, approve its license record, then queue ingestion and publish it. The published reader text remains the exact verse text; its surah/ayah numbers are catalogue navigation metadata. Follow [Tanzil's text license](https://tanzil.net/docs/Text_License) and check for upstream updates.

All these commands create records marked **pending review**. Open `/admin`, inspect the actual edition, document the permission or license, explicitly authorize hosting, enqueue ingestion, and publish only after ingestion succeeds. A newly discovered revision starts a new edition and needs fresh review.

## Search and storage

The original Arabic text remains intact. The fallback search stores a normalized search-only representation; exact search uses the original text. The optional OpenSearch analyzer handles Arabic stemming. Restart or rebuild it with `npm run reindex` after configuration or recovery.

The database stores catalogue metadata, users, provenance, rights, page text, reading state, and checksums. PDFs and other original bytes are immutable, content-addressed objects in `data/objects/` or a configured S3-compatible bucket. The included database queue removes the initial Redis requirement while preserving retry and lease semantics.

## Operations

```sh
npm run check
npm test
npm run build
npm run db:migrate
npm run db:seed
npm run admin:create
npm run worker
npm run backup
npm run reindex
```

Run `npm run admin:create` only in a trusted interactive terminal; the password input is hidden. Each running worker processes one job at a time and saves sync cursors only after successful staging. Use one worker on SQLite; PostgreSQL supports concurrent workers.

`/api/health` reports the configured database, search, and storage backends. `/admin` shows staged revisions, permissions, job failures, synchronization history, accounts, and an audit trail. Provider network calls require deployment egress and access to their public HTTPS endpoints.

## Important source-specific boundaries

- **OpenITI:** pin a release or commit; retain attribution and the applicable CC BY-NC-SA conditions. Individual editorial material can have separate rights.
- **Internet Archive:** check item and edition rights. Search results are metadata leads, not blanket approval.
- **Waqfeya / Hugging Face datasets:** begin with `index.tsv`. A dataset card's MIT packaging label does not establish permission to republish every scanned edition.
- **Shamela:** the community API client is optional and installed explicitly. Obtain the API key and local-hosting permission from Shamela.
- **Turath:** use a chosen list of IDs, cache politely, and obtain agreement before bulk mirroring.
- **Prophet's Mosque dataset:** verify the intended repository identifier, dataset card, and per-item rights before configuring `HF_PROPHET_REPO`.

No complete scanned collection is downloaded or committed automatically. Never bypass access restrictions, download gates, or access controls.
