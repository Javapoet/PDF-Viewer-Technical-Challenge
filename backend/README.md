# PDF Pager Backend (Node + TypeScript + Express) (Deliverable 2)

A minimal backend + browser UI to load a large PDF via **byte-range** requests and render it **one page at a time** with simple controls.

- Backend: Node.js + Express + TypeScript
- Range support: `/api/pdf/stream` handles `Range` requests and sets caching headers (`ETag`, `Cache-Control`, `Last-Modified`, `Accept-Ranges`).
- JSON API: `/api/pdf/info` returns metadata (filename, size, last-modified, etag, page count when available).
- Frontend: Uses PDF.js in the browser to render individual pages with **first/prev/next/last** controls.
- Config: `.env` (Dotenv) for `PORT` and `PDF_PATH`.

---

## Getting Started (Local)

1. **Install dependencies**
   ```bash
   npm install
   npm i -D @types/morgan
   ```

1.1 **Install pdf-lib**
   ```bash
npm i pdf-lib
   ```

2. **Set environment variables** (optional)
   ```bash
   cp .env.example .env
   # Edit .env to point to your PDF
   # PDF_PATH=./assets/sample.pdf
   # PORT=3000
   ```

3. **Place a PDF**
   - Put your file at `./assets/sample.pdf` **or** set `PDF_PATH` to a different location.

4. **Run in dev (watch mode)**
   ```bash
   npm run dev
   ```

   ```bash
   npm run build && npm start
   ```

5. **Open the UI**
   - Go to: http://localhost:3000
   - Use the controls to navigate pages. The browser will fetch byte ranges from `/api/pdf/stream`.

6. **Production build + start**
   ```bash
   npm run build
   npm start
   ```

---

## API

- `GET /api/pdf/info` → JSON with `{ fileName, fileSize, lastModified, etag, pageCount }`
- `GET /api/pdf/stream` → Serves the PDF with range support. Use `Range: bytes=...-...`. Responds `206 Partial Content` when appropriate.
- `GET /api/pdf/page/<PAGE_NUMBER>?v=<etag>` → Uses the page number to retieve the page and the etag to bust caches when the source PDF changes.

**Caching & Conditionals**: 
- Returns `ETag`, `Last-Modified`, and `Cache-Control: public, max-age=31536000, immutable`.
- Handles `If-None-Match` and `If-Modified-Since` → `304 Not Modified`.

**Error handling**:
- `404` with `{ error: 'PDF not found' }` when the file path is invalid.
- `500` on unexpected stream errors.

---

## Deployment (Optional)

### Docker
A simple Dockerfile is included:

```bash
docker build -t pdf-pager-backend .
docker run --rm -p 3000:3000 --env-file .env -v $(pwd)/assets:/app/assets pdf-pager-backend
```

**Notes**:
- Mount your assets volume so the container can read the PDF.
- Adjust `PORT` mapping as needed.

### Platforms
- **Render**, **Railway**, **Fly.io**, **Heroku**, **AWS Elastic Beanstalk**, etc., can run this app with Node 20+.
- Ensure persistent storage or mount a volume for the PDF file, or reference a static, readable path available at runtime.

---

## Frontend Notes

- The browser loads PDF.js from `/static/pdfjs/*` (served from `node_modules/pdfjs-dist/build`).
- The PDF is loaded via `/api/pdf/stream` to leverage range requests for large files.
- Page count is read on the server (when possible) and exposed via `/api/pdf/info` for quick UI display.
