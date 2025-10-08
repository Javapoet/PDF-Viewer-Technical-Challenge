# PDF Access API

All PDFs are accessed **only** through this API. Responses include `ETag`, `Last-Modified`, and environment-sensitive `Cache-Control`:

- **Production:** `Cache-Control: public, max-age=31536000, immutable`
- **Development:** `Cache-Control: no-store`

## Endpoints

### GET `/api/pdf/info`

Returns document metadata.

**200**
```json
{
  "fileName": "UnicodeStandard-17.0.pdf",
  "fileSize": 13456789,
  "lastModified": 1727731200000,
  "etag": "W/\"a1b2c3...\"",
  "pageCount": 902
}
```

**404**
```json
{ "error": "Document not found", "code": "NOT_FOUND" }
```

**500**
```json
{ "error": "Failed to fetch document metadata", "code": "META_ERROR" }
```

### GET `/api/pdf/page/:n`

Returns a single-page PDF extracted server-side.

Headers: Content-Type: application/pdf, ETag: <baseEtag>-p<n>

**200** – binary body (one page)

**304** – when If-None-Match matches

**400** 
```json
{ "error": "Invalid page number", "totalPages": 902 }
```

**404** (if source missing)
```json
{ "error": "Document not found", "code": "NOT_FOUND" }
```

**500** (if source missing)
```json
{ "error": "Failed to extract page", "code": "EXTRACT_ERROR" }
```

### GET /api/pdf/stream

Streams the full PDF; supports HTTP Range.

**200** – full body when no Range sent
**206** – partial response when a valid Range is sent (includes Content-Range)
**304** – when conditional headers match

**416**
```json
{ "error": "Invalid Range", "code": "INVALID_RANGE", "fileSize": 13456789 }
```

**404**
```json
{ "error": "Document not found", "code": "NOT_FOUND" }
```

**500**
```json
{ "error": "Stream error", "code": "STREAM_ERROR" }

```

**Timeout (gateway)**
```json
{ "error": "Request timed out", "code": "TIMEOUT" }
```
---

## Notes:

- Caching: clients append ?v=<etag> when requesting pages; CDN/browser then reuse cached single-page PDFs until the document changes.
- CDN: Prefer caching /api/pdf/page/* keyed by query v. For /api/pdf/stream, forward Range and cache conservatively.
- Security: PDFs aren’t publicly reachable—no static serving of the source file; S3 bucket is private.

---

## 5) Quick test matrix

- **Missing key/file** → `/info` & `/stream` & `/page/1` return **404 JSON**.
- **Invalid Range** → `/stream` with `Range: bytes=999999999-` on a small file returns **416** + `Content-Range: bytes */<size>`.
- **Timeout** → throttle S3 / network and verify you see **504 JSON** (or 503 if you prefer) with `code: TIMEOUT`.
- **Structured logs** → grep your server output; you should see one JSON line per request with `duration_ms`.

---
