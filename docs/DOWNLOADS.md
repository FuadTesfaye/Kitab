# First collection: safe downloads and import steps

Begin with **25–50 works** from a corpus whose individual text licenses have been checked. Store imported files under `imports/`, outside Git. Keep database records and extracted pages in PostgreSQL; the original bytes go to MinIO or `data/objects/`. Use the application's administrator to review rights before ingesting or publishing a book.

## Aljam3 & Shamela: 4,645+ Books Digital Catalogue & PDF Downloads

The library includes an integrated client for [Aljam3 (الجامع — ieasybooks/aljam3-web-app)](https://github.com/ieasybooks/aljam3-web-app), providing direct access to 63,427 digitized Islamic works:
- **المكتبة الشاملة الوقفية** (Complete Shamela Waqfeya - **4,645 books** indexed in `data/shamela/shamela-all-books.json`)
- **المكتبة الوقفية** (Al-Waqfeya - 500 foundational works)
- **مكتبة المسجد النبوي** (Prophet's Mosque Library - 500 foundational works)

A pre-packaged collection of **5,645+ classical Islamic works** is indexed across `data/shamela/shamela-all-books.json` and `data/shamela/1500-books.json`. Every book features:
- **Homepage Search (`http://localhost:3000/`)**: Full real-time search across all 5,662+ titles, authors, and topics with instant typing filters and Arabic numeral shelf counts.
- Direct 1-click **PDF downloads** streamed or redirected from Hugging Face / CDN without polluting git repository storage limits.
- Extracted **TXT** and **DOCX** files.
- In-browser reading and volume navigation via `/shamela/[id]`.
- Direct "PDF 📄", "TXT 📝", and "تحميل ⤓" download pills on book cards and detail pages.

### Universal Download Endpoints:
- `/api/books/{id}/download?format=pdf`: Direct PDF download attachment for any book in the catalogue.
- `/api/books/{id}/download?format=txt`: Complete text download attachment for any book in the catalogue.
- `/api/books/{id}/download?format=json`: Complete structured JSON export for any book in the catalogue.
- `/api/aljam3/pdf?id={id}`: Direct PDF download attachment for any book in the 1,500-book catalogue.
- `/api/shamela/download?id={id}&format=pdf`: Direct PDF download for Shamela works.
- `/api/shamela/download?id={id}&format=json`: Structured machine-readable JSON format.
- `/api/shamela/download?id={id}&format=txt`: Plain-text format.
- `/api/shamela/books/all`: Complete dataset dump for all 4,645 Maktabatu Shamela books in JSON format.

### Website-to-Website Bulk Importer (Automatic GitHub Synchronization):
Import full collections directly from digital libraries to GitHub in automated 3-file batches:
```sh
# Bulk import books from Maktabatu Shamela (with automatic 3-file GitHub commits & pushes)
npx tsx scripts/bulk-import-to-github.ts --source=shamela --limit=30

# Bulk import from Prophet's Mosque Library
npx tsx scripts/bulk-import-to-github.ts --source=prophet-mosque --limit=30

# Bulk import from Al-Waqfeya Library
npx tsx scripts/bulk-import-to-github.ts --source=waqfeya --limit=30

# Or use the Web UI at http://localhost:3000/admin under "استيراد المواقع (Bulk Import)"
```

### Maktabatu Shamela Batch Downloader & Full Synchronizer:
Download and archive Shamela books into `data/books/`:
```sh
# Fetch and synchronize the full 4,645 Shamela catalogue
npx tsx scripts/fetch-all-shamela.ts

# Download specific Shamela books into repository
npx tsx scripts/download-shamela-batch.ts --ids=2040,1446,1444,4266,4263,4425

# Download first N Shamela books with optional PDF/TXT fetching
npx tsx scripts/download-shamela-batch.ts --limit=10 --txt
```

### Universal Bulk Book Downloader:
Download and archive any book or range of books directly to `data/books/`:
```sh
# Download specific books by ID
npx tsx scripts/download-all-books.ts 3435 11940 17525 3 4

# Bulk download the first N books
npx tsx scripts/download-all-books.ts --limit=50
```

To re-fetch or expand the 1,500 books dataset:
```sh
npx tsx scripts/fetch-1500-books.ts
```

## Recommended first download

### Quran text from Tanzil (small first import)

On a host with outbound HTTPS access, run `npm run import -- tanzil`. The command downloads the official Uthmani v1.1 text, checks its numbering and 6,236-verse count, preserves the exact upstream file with a SHA-256-based immutable filename, and creates a pending edition. It does not auto-publish. Keep the text verbatim, include Tanzil's attribution and link, and check for upstream updates. See [Tanzil's terms](https://tanzil.net/docs/Text_License).

This import does not fetch translations or a scanned Mushaf PDF. Those have separate sources and rights.

### OpenITI: modest, curated text collection

OpenITI provides downloadable mARkdown files and structured author/title/version metadata. Its repository gives a specific snapshot and metadata layout. Check the license for the selected text; the corpus has CC BY-NC-SA terms, and individual editorial additions can have separate rights. See the [OpenITI release repository](https://github.com/OpenITI/RELEASE) and [release instructions](https://github.com/OpenITI/RELEASE#readme).

Choose an appropriate tagged snapshot; download the **metadata TSV and selected Arabic `.completed`/`.mARkdown` files**, not every version of every text. Save the original release identifier and metadata alongside files. Place the selected file in `imports/openiti/`. Then run:

```sh
npm run import -- openiti imports/openiti/FILE.mARkdown "عنوان الكتاب بالعربية" "اسم المؤلف بالعربية"
```

Open `/admin`, review the individual text and license, document evidence and attribution, and select the correct open-license status. The server preserves the original file, parses page markers, and keeps reader visibility off until you explicitly publish.

## Metadata-first sources

### Internet Archive

Discover an item by its identifier in **Administration → Sources → Internet Archive**. The app reads item metadata first. Confirm the specific edition's copyright and the uploader's distribution rights. Item metadata saying “public domain,” a scan's availability, or an old author's death does not by itself establish rights to a modern edited edition. Do not approve uncertain items.

### Waqfeya Hugging Face index

The [dataset index](https://huggingface.co/datasets/ieasybooks-org/waqfeya-library) describes many books and file paths. Its repository's dataset license describes the data package; it is not blanket permission for the underlying editions or scans. First fetch the small catalogue index only:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install huggingface_hub
python scripts/download-dataset.py ieasybooks-org/waqfeya-library
```

The downloader prints and pins a commit revision. The default only retrieves `index.tsv` and `README.md`. Add a **specific** `--pattern 'relative/file/path.pdf'` only after identifying one item and verifying its rights. Do not mirror the repository wholesale.

## Shamela: request permission first

The [Shamela v4 API client](https://github.com/ragaeeb/shamela) supports the versioned master database, per-book versions, SQLite patches, and Arabic content parsing. Install it on your trusted server only after Shamela grants your NGO an API key and written permission to host each requested category of material:

```sh
npm install shamela
```

Store the key in `.env` as `SHAMELA_API_KEY`; never put it in Git or in the browser. The adapter reads a selected metadata snapshot from `SHAMELA_CATALOGUE_PATH` and checks revisions before importing. API access does not automatically grant republication rights.

For a small **locally obtained** Shamela JSON file, the CLI supports:

```sh
npm run import -- manifest path/to/rights-reviewed-book.json
```

Large per-book extractions use the dataset folder format described below.

## Shamela Hugging Face dump: test one work only

The [AuthenticIlm Shamela corpus](https://huggingface.co/datasets/AuthenticIlm/Shamela4_Full_DB) is listed as about **19.8 GB**. Its card says the terms are for **research and personal use**, and that publishers and editors retain rights in critical editions. Do not bulk-download and republish it for the NGO without separate written permission. Its `is_hidden` flag identifies restricted records; the importer rejects them.

If you have permission for an individual edition, install the Hub downloader and retrieve only that work's directory: `book_metadata.json`, `pages.jsonl`, `toc.jsonl`, and `manifest.json`. Put the directory beneath `imports/shamela/` and stage it:

```sh
npm run import -- shamela-folder imports/shamela/BOOK-DIRECTORY
```

Inspect the specific edition and its rights record before starting its ingestion job. The original JSONL is preserved separately from the reader's extracted text.

## Do not upload collections to GitHub

This repository's MIT license applies to application code and documentation. It does not license scanned books, modern editorial notes, or the external dataset files. Keep `imports/`, `data/`, object-storage files, backups, and provider credentials outside version control. GitHub recommends repositories remain under 1 GB and blocks ordinary files over 100 MiB; it recommends a dedicated file store rather than Git for large databases. Use MinIO/S3 or approved institutional storage for authorized files.

## Import lifecycle

```text
Discover metadata → review edition → record rights evidence
      → explicitly authorize hosting → queue import → verify → publish
```

An approved revision gets its own rights entry. A later revision needs its own review. Removing permission immediately hides that edition from readers and search. Bulk imports can stage records for review; they cannot automatically authorize hosting.
