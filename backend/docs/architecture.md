# Architecture (Deliverable 0)

## Overview

The system consists of a small Express server and a static browser UI powered by PDF.js. The server exposes two main endpoints:

1. `GET /api/pdf/info`: Returns metadata and (if available) `pageCount` by parsing the PDF with `pdfjs-dist` in Node.
2. `GET /api/pdf/stream`: Streams the PDF with **byte-range** support, proper **cache headers**, and **conditional requests**.
3. `GET /api/pdf/page/<PAGE_NUMBER>?v=<etag>`: Uses the page number to retrieve the page and the etag to bust caches when the source PDF changes.

The browser uses PDF.js to fetch the PDF via `/api/pdf/stream` and renders one page at a time on a `<canvas>`.

## Components

- **Express App**: Initializes middleware (Helmet, JSON, logging), static routes, and the PDF router.
- **PDF Router**:
  - `initPdfInfo()` runs on startup to compute file stats, an `ETag` from the file contents, and (optionally) the page count via pdfjs.
  - `/info` returns JSON metadata.
  - `/stream` implements range parsing and streaming; returns `200` (full) or `206` (partial) with `Accept-Ranges: bytes`.
- **Range Utility**: Small helper to validate and parse the `Range` header according to RFC 7233 semantics (single-range only for simplicity).
- **Static UI**: Served from `/public`. Loads `pdf.min.js` and sets `pdf.worker.min.js` worker path to `/static/pdfjs/pdf.worker.min.js`.
- **Per-page**: server extracts a single page with `pdf-lib`, memoizes both the full-source bytes (per ETag) and each page (per ETag|page).
- **Streaming**: `/api/pdf/stream` pipes either fs stream or S3 GetObject stream, supporting `Range`.
- **Frontend**: ESM PDF.js renders per-page PDFs; UI triggers `/api/pdf/page/N` on nav; uses `?v=<etag>` to bust caches when the source PDF changes.

## Caching
- The server sets:
  - `Cache-Control: public, max-age=31536000, immutable`
  - `ETag` (weak, content-hash based) and `Last-Modified`.
- Supports `If-None-Match` and `If-Modified-Since` with `304 Not Modified` responses.
- Repeated requests for the same range or full file are cacheable by browsers and proxies.

## Error Handling
- Missing file → `404` with `{ error: "PDF not found" }`.
- Bad ranges → fallback to full response (simpler UX). Could be extended to `416 Range Not Satisfiable` if desired.
- Stream errors → `500` with best-effort logging.

## Extensibility
- Add authentication middleware (e.g., JWT) before the `/api/pdf/*` routes.
- Add `/api/pdf/pages/:n/image` for server-side page rasterization if needed.
- Rotate PDFs by adjusting `PDF_PATH`; `initPdfInfo()` recalculates metadata on start.
