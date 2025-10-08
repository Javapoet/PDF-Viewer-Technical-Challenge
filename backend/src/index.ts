// src/index.ts
console.log('index.ts');

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import {
    fileURLToPath
} from 'url'; // turns that URL into a normal filesystem path so you can use path.*
import {
    createRequire // gives you a require() you can use inside ESM specifically to do things like require.resolve(...)
} from 'module';
import pdfRouter, { initPdfInfo } from './routes/pdf.js';

/*
 * Creates `__dirname`` and `require()`` in an ESM world.
 *
 * This project uses "type": "module" (.ts compiled to ESM), thus classic Node globals like __filename, __dirname, and require() don’t exist.
 * These 3 lines of code recreate those abilities in an ESM-safe way.
 * - import.meta.url is the URL of the current module (e.g., file:///.../dist/index.js)
 * - fileURLToPath() turns that URL into a normal filesystem path so you can use path.*
 * - createRequire() gives you a require() you can use inside ESM specifically to do things like require.resolve(...)
 */
const __filename = fileURLToPath(import.meta.url);  // convert module URL → real file path
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);  // make a CJS-like require() that works in ESM

const app = express();
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// Frontend
app.use('/', express.static(path.join(__dirname, '..', 'public')));

/*
 * Mount the PDF libraries for an ESM build so that requests for `/static/pdfjs/pdf.min.mjs` or `/static/pdfjs/pdf.worker.min.mjs` will be served straight from the `node_modules/pdfjs-dist/build`.
 *
 * We want to serve the PDF files from `node_modules/pdfjs-dist/build/…` regardless of where they are installed in the file system.
 * So, we find where pdfjs-dist lives on disk by calling `require.resolve('pkg/path')` which asks Node to resolve the installed file for us and returns the absolute path to that file as Node would import it.
 */
let pdfBuildDir: string;
try { // try `pdf.min.mjs` first, if that file doesn’t exist, fallback to `pdf.mjs`
    const p = require.resolve('pdfjs-dist/build/pdf.min.mjs');
    pdfBuildDir = path.dirname(p); // trims the filename so we get the whole `/node_modules/pdfjs-dist/build` directory
} catch {
    const p = require.resolve('pdfjs-dist/build/pdf.mjs');
    pdfBuildDir = path.dirname(p);
}
console.log('index.ts: pdfBuildDir = ', pdfBuildDir);

/*
 * PDF Libraries - mount the `pdfBuildDir` as a static route in Express:
 *
 * - maxAge: '1y' - Cache-Control: public, max-age=31536000
 * - immutable: true → the immutable directive tells the browser the file never changes at that URL
 */
app.use('/static/pdfjs', express.static(pdfBuildDir, { immutable: true, maxAge: '1y' }));

/*
 * The PDF Paging API
 */
app.use('/api/pdf', pdfRouter);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const PORT = Number(process.env.PORT) || 3000;

(async () => {
    await initPdfInfo(); // (keep the “Option A” version that doesn’t use pdfjs in Node)
    app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
})();
