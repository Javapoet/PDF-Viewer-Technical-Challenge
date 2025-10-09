# React Frontend – Streamed PDF Viewer (Deliverable 1)

A single-page **React + Vite + TypeScript** app that renders one PDF page at a time using PDF.js (ESM), with nav controls, metadata, skeleton shimmer, and friendly error handling.

## Dev

```bash
npm install
npm run dev
```

- Ensure the backend is running at <http://localhost:3000>. Vite proxies `/api` and `/static/pdfjs` to it.
- The backend proxy is already configured in vite.config.ts.

Load <http://localhost:5173> to view the app.

## Build

```bash
npm run build
npm run preview
```

## Files of note

- src/components/PdfViewer.tsx — page-by-page rendering, skeletons, prefetch, error handling
- src/App.tsx — gets /api/pdf/info, shows metadata, hosts the viewer
- src/styles.css — minimal modern styling + shimmer
- vite.config.ts — dev proxy for /api and /static/pdfjs