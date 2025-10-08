# Feature Brief

Vertical Slice: Large-PDF Fast Pagination — Proposal & Plan

1) Problem framing & constraints

**Goal (vertical slice)**:

Ship an end-to-end, minimal but real feature that loads and paginates a large multi-page PDF fast and smoothly:

- Efficiently load and view a large PDF in the browser, one page at a time, with snappy navigation and caching.
- Backend efficiently serves content (cloud-ready, cacheable).
- Frontend renders pages without blocking the UI and feels snappy.
- Deployable on AWS (S3 for storage; CloudFront for caching).

## What “fast” means (success metrics & budgets):

- TTFP (Time-to-First-Page): p50 ≤ 800 ms (same-region CloudFront → origin) p95 ≤ 1.5 s (cross-region)
- Next/Prev page time-to-render (after click): p50 ≤ 300 ms, p95 ≤ 600 ms (from cached one-page PDF or CDN hit).
- Main-thread blocking: keep per-interaction work ≤ 16 ms budget (60 fps guideline).
- Network bytes: initial payload ≤ 1 MB (1 single-page PDF + viewer code). Subsequent pages typically ≤ 500 KB each (page-dependent).
- Server memory: cap in-memory page cache (LRU) to ≤ 128 MB for the slice (configurable).
- Document assumptions & limits (for the slice): PDFs up to 150–200 MB, 200–1,200 pages.
- Non-encrypted, standard PDFs (no forms/signatures processing).
- Text selection preserved (we serve page-sub-PDFs, not raster images).

Target devices & minimum browser support:

- Desktop/Laptop: Chrome/Edge 110+, Firefox 110+, Safari 16+.
- Mobile: iOS/iPadOS Safari 16+, Android Chrome 110+.
- No IE/legacy. Degrade gracefully on very low-end devices (bigger render scale can be lowered).

## Key Features

- **Byte-range streaming** for PDFs to avoid downloading the entire file at once.
- **Page navigation** controls (first/prev/next/last) with a page number input.
- **Caching** of repeated byte ranges via `ETag`, `Cache-Control`, and `Last-Modified` headers.
- **JSON metadata** endpoint to show basic info and page count.
- **Meaningful errors** as JSON with proper status codes.
- **Dotenv**-powered config for portability.

## Non-Goals

Upload UI, document library, full-text search, annotations, server-side thumbnails, auth/ACLs, analytics dashboards.

- Server-side rasterization or thumbnail generation (kept lean on purpose).
- Authentication/authorization (can be added later).
- Multi-file library; we focus on a single configured PDF for clarity.

2) Architecture overview

Frontend approach

- PDF.js (ESM) with Worker: Use pdfjs-dist ESM build; module worker for parsing/raster off the main thread.
- Single <canvas> viewport (virtualized: render one page at a time).
- Navigation UX: First/Prev/Next/Last + page input.
- Prefetch strategy:
  On displaying page N, background fetch N+1 (and optionally N−1 on quick backwards scroll).
  Prefetch concurrency = 1; pause when network is slow or when tab is hidden.
- Rendering details:
  Default scale ~ 1.5× (responsive to DPR); cap to avoid huge bitmaps on 4K screens.
  Only the active page’s canvas in the DOM; destroy prior PDF.js page objects to free memory.
- Error UX: Toast/banner with retriable states (offline, 404, 5xx).
- Observability (lightweight): console timings for TTFP and per-page render; log to backend later (vNext).

Backend approach

- Hybrid, page-centric delivery (chosen for the slice):
  - Per-page endpoint — GET /api/pdf/page/:n
    Server extracts a single-page PDF from the source (via pdf-lib).
    Preserves text/search/selectability.
    Emits strong caching headers; tiny payloads are CDN-friendly.
  - Full-doc streaming — GET /api/pdf/stream
    HTTP Range (206) support for compatibility and external viewers.
    Also cacheable via ETag/Last-Modified for repeated ranges.
  - Metadata — GET /api/pdf/info
    Returns filename, size, etag, lastModified, and pageCount.

Why not image rasterization endpoints (PNG/JPEG) first?
Raster is heavier CPU-wise and loses text selection/search. Great for thumbnails, but we’ll do it later if needed.

- Storage abstraction:
  Local FS for dev: PDF_PATH.
  S3 mode for prod: S3_REGION/B UCKET/KEY (+ optional S3-compatible endpoint).
  Server caches the source bytes per ETag in RAM to accelerate per-page extraction, with a configurable LRU cap (e.g., 128 MB).

- Resilience:
  Validate page bounds; return JSON errors with meaningful codes (400 invalid page, 404 missing doc, 500 extraction/stream errors).
  Timeouts and stream back-pressure handled by Node streams (206 or full).
  Caching strategy (client, CDN, server)

- Versioning:
  Server computes a base ETag for the source (FS hash or S3 ETag).