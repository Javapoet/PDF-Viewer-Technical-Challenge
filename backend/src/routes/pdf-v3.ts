console.log('routes/pdf-v3.ts');

import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parseRange } from '../utils/range.js';
import { PDFDocument } from 'pdf-lib';

/*
 * Create a Least Recently Used (LRU) cache for stor
 */
let srcBytesCache: { etag: string; buf: Buffer } | null = null; // Full doc bytes (per ETag)
let srcDocCache: { etag: string; doc: PDFDocument } | null = null; // Parsed PDFDocument (per ETag)

/*
 * A simple Least Recently Used cache for individual pages
 */
class LeastRecentlyUsedCache<V> {
    private map = new Map<string, V>();
    constructor(private max = 64) {}
    get(k: string) {
        const v = this.map.get(k);
        if (v !== undefined) {
            this.map.delete(k);
            this.map.set(k, v);
        }
        return v;
    }
    set(k: string, v: V) {
        if (this.map.has(k)) this.map.delete(k);
        this.map.set(k, v);
        if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    }
}
const pageCache = new LeastRecentlyUsedCache<Buffer>(64);
const inflightPages = new Map<string, Promise<Buffer>>(); // De-dup in-flight page builds

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('routes/pdf-v3.ts: __filename = ', __filename);
console.log('routes/pdf-v3.ts: __dirname = ', __dirname);

const router = express.Router();

const PDF_NAME = 'IRS-Federal-Income-Tax-Guide-2024-Publication-17.pdf';
const PDF_PATH = process.env.PDF_PATH || path.join(__dirname, '..', '..', 'assets', PDF_NAME);
console.log('routes/pdf-v3.ts: PDF_PATH = ', PDF_PATH);

type PdfInfo = {
    filePath: string;
    fileName: string;
    fileSize: number;
    lastModified: number;
    etag: string;
    pageCount: number | null;
};

let pdfInfo: PdfInfo = {
    filePath: path.resolve(PDF_PATH),
    fileName: path.basename(PDF_PATH),
    fileSize: 0,
    lastModified: 0,
    etag: '',
    pageCount: null,
};
console.log('routes/pdf.ts: pdfInfo = ', pdfInfo);

//const pageCache = new Map<string, Buffer>();

export async function initPdfInfo() {
    console.log('routes/pdf-v3.initPdfInfo()');

    const stat = fs.statSync(pdfInfo.filePath);
    pdfInfo.fileSize = stat.size;
    pdfInfo.lastModified = stat.mtimeMs;
    pdfInfo.etag = await computeEtag(pdfInfo.filePath);
    console.log('routes/pdf-v3.initPdfInfo(): pdfInfo.etag = ', pdfInfo.etag);

    // Compute pageCount once
    try {
        const doc = await getSourceDoc();
        console.log('routes/pdf-v3.initPdfInfo(): doc = ', typeof doc);
        pdfInfo.pageCount = doc.getPageCount();
        console.log('routes/pdf-v3.initPdfInfo(): pdfInfo.pageCount = ', pdfInfo.pageCount);
    } catch {
        pdfInfo.pageCount = null;
    }

    // 🔥 Warm page 1 for instant TTFP (best-effort)
    if (pdfInfo.pageCount && pdfInfo.pageCount > 0) {
        const key = `${pdfInfo.etag}|1`;
        console.log('routes/pdf-v3.initPdfInfo(): key = ', key);
        if (!pageCache.get(key)) {
            void buildSinglePagePdf(1).then((buf) => pageCache.set(key, buf)).catch(() => {});
        }
    }
}

async function buildSinglePagePdf(n: number): Promise<Buffer> {
    console.log('routes/pdf-v3.buildSinglePagePdf(' + n + ')');

    const key = `${pdfInfo.etag}|${n}`;
    console.log('key = ', key);
    const cached = pageCache.get(key);
    console.log('cached = ', cached ? cached.length : cached);
    if (cached) {
        console.info('Return the cached page from the `pageCache`.');
        return cached;
    }

    // de-dup in-flight work
    const existing = inflightPages.get(key);
    if (existing) return existing;

    const p = (async () => {
        const srcDoc = await getSourceDoc();
        console.log('srcDoc = ', typeof srcDoc);
        const outDoc = await PDFDocument.create();
        console.log('outDoc = ', typeof outDoc);
        const [ copied ] = await outDoc.copyPages(srcDoc, [n - 1]);
        outDoc.addPage(copied);
        const outBytes = await outDoc.save({ useObjectStreams: true });
        console.log('outBytes = ', outBytes.length);
        const buf = Buffer.from(outBytes);
        //console.log('buf = ', buf);
        pageCache.set(key, buf);
        return buf;
    })();

    inflightPages.set(key, p);

    try {
        const buf = await p;
        return buf;
    } finally {
        inflightPages.delete(key);
    }
}


async function computeEtag(filePath: string): Promise<string> {
    console.log('routes/pdf-v3.computeEtag(filePath)', filePath);
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    return await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve('W/"' + hash.digest('hex') + '"'));
        stream.on('error', reject);
    });
}

async function getSourceBytes(): Promise<Buffer> {
    console.log('routes/pdf-v3.getSourceBytes()');

    if (srcBytesCache?.etag === pdfInfo.etag && srcBytesCache.buf) {
        console.info('Return the source bytes from the `srcBytesCache`.');
        return srcBytesCache.buf;
    }

    console.info('Load the source bytes from disk.');
    const buf = fs.readFileSync(pdfInfo.filePath); // use async if you prefer
    srcBytesCache = { etag: pdfInfo.etag, buf };
    return buf;
}

async function getSourceDoc(): Promise<PDFDocument> {
    console.log('routes/pdf-v3.getSourceDoc()');

    if (srcDocCache?.etag === pdfInfo.etag && srcDocCache.doc) {
        console.info('Return the source doc from the `srcDocCache`.');
        return srcDocCache.doc;
    }

    console.info('Get the source bytes from the `srcBytesCache`.');
    const buf = await getSourceBytes();
    console.info('Create the source doc from the source bytes.');
    const doc = await PDFDocument.load(buf, { updateMetadata: false });
    srcDocCache = { etag: pdfInfo.etag, doc };
    return doc;
}

async function ensurePageCount(): Promise<number | null> {
    console.log('routes/pdf-v3.ensurePageCount()');

    if (pdfInfo.pageCount != null) {
        console.log('pdfInfo.pageCount = ', pdfInfo.pageCount);
        return pdfInfo.pageCount;
    }

    try {
        const bytes = fs.readFileSync(pdfInfo.filePath);
        console.log('bytes = ', bytes);
        const doc = await PDFDocument.load(bytes, { updateMetadata: false });
        console.log('doc = ', doc);
        pdfInfo.pageCount = doc.getPageCount();
        console.log('pdfInfo.pageCount = ', pdfInfo.pageCount);
        console.log('routes/pdf-v3.ensurePageCount(): return ' + pdfInfo.pageCount);
        return pdfInfo.pageCount;
    } catch (err) {
        console.error('Failed to read PDF page count with pdf-lib:', err);
        pdfInfo.pageCount = null;
        console.log('routes/pdf-v3.ensurePageCount(): return null');
        return null;
    }
}

router.get('/info', async (_req, res) => {
    //console.log('routes/pdf-v3.ts: router.get(\'/info\', (_req, res)');
    console.log('routes/pdf-v3.info(_req, res)');

    if (!fs.existsSync(pdfInfo.filePath)) return res.status(404).json({ error: 'PDF not found' });
    
    //await ensurePageCount();

    return res.json({
        fileName: pdfInfo.fileName,
        fileSize: pdfInfo.fileSize,
        lastModified: pdfInfo.lastModified,
        etag: pdfInfo.etag,
        pageCount: pdfInfo.pageCount,
    });
});

router.get('/page/:n', async (req, res) => {
    //console.log('routes/pdf-v3.ts: router.get(\'/page/:n\', (_req, res)');
    console.log('routes/pdf-v3.page(_req, res)', req.params.n);

    if (!fs.existsSync(pdfInfo.filePath)) return res.status(404).json({ error: 'PDF not found' });

    /*
    const total = await ensurePageCount();
    console.log('total = ', total);
    if (!total) return res.status(500).json({ error: 'Unable to determine page count' });
    */

    const n = Number(req.params.n);

    if (
        !Number.isInteger(n)
        //|| n < 1
        //|| n > total
    ) {
        return res.status(400).json({ error: 'Invalid page number', totalPages: total });
    }

    const pageEtag = `${pdfInfo.etag}-p${n}`;
    res.setHeader('ETag', pageEtag);
    res.setHeader('Last-Modified', new Date(pdfInfo.lastModified).toUTCString());

    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
        /*
         * no-store tells the browser do not cache at all, so it won’t send If-None-Match on the next request → you’ll always see 200.
         */
        //res.setHeader('Cache-Control', 'no-store');

        /*
         * Use no-cache (or max-age=0, must-revalidate)
         * no-cache tells the browser “you may cache, but always revalidate”, which triggers If-None-Match and gives you 304 when the ETag matches.
         */
        res.setHeader('Cache-Control', 'no-cache');  
    }

    res.setHeader('Content-Type', 'application/pdf');

    const ifNoneMatch = req.headers['if-none-match'];
    //if (ifNoneMatch && ifNoneMatch === pageEtag) {
    if (ifNoneMatch) {
        console.log('ifNoneMatch = ', ifNoneMatch);
        console.log('pageEtag    = ', pageEtag);
        if (ifNoneMatch === pageEtag) {
            console.info('Return HTTP Status Code 304.');
            return res.status(304).end();
        }
    }

    try {
        const buf = await buildSinglePagePdf(n);
        console.log('buf.length = ', buf.length);
        res.setHeader('Content-Length', String(buf.length));
        return res.end(buf);
    } catch (err) {
        console.error('Failed to extract page', n, err);
        return res.status(500).json({ error: 'Failed to extract page' });
    }
});

router.get('/stream', (req, res) => {

    if (!fs.existsSync(pdfInfo.filePath)) return res.status(404).json({ error: 'PDF not found' });

    const stat = fs.statSync(pdfInfo.filePath);
    const fileSize = stat.size;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('ETag', pdfInfo.etag);
    res.setHeader('Last-Modified', new Date(pdfInfo.lastModified).toUTCString());
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
        res.setHeader('Cache-Control', 'no-store');
    }

    const ifNoneMatch = req.headers['if-none-match'];
    const ifModifiedSince = req.headers['if-modified-since'];
    if (
             (ifNoneMatch && ifNoneMatch === pdfInfo.etag)
          || (ifModifiedSince && new Date(ifModifiedSince).getTime() >= pdfInfo.lastModified)
    ) {
        return res.status(304).end();
    }

    const rangeHeader = req.headers.range as string | undefined;
    const range = parseRange(rangeHeader, fileSize);

    if (range) {
        const { start, end } = range;
        const chunkSize = end - start + 1;
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunkSize.toString());
        const stream = fs.createReadStream(pdfInfo.filePath, { start, end });
        stream.on('error', (err) => {
            console.error(err);
            if (!res.headersSent) res.status(500);
            res.end();
        });
        stream.pipe(res);
    } else {
        res.setHeader('Content-Length', fileSize.toString());
        const stream = fs.createReadStream(pdfInfo.filePath);
        stream.on('error', (err) => {
            console.error(err);
            if (!res.headersSent) res.status(500);
            res.end();
        });
        stream.pipe(res);
    }
});

export default router;
