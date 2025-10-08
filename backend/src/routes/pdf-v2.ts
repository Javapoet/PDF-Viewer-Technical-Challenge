console.log('routes/pdf-v2.ts');

import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parseRange } from '../utils/range.js';
import { PDFDocument } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('routes/pdf-v2.ts: __filename = ', __filename);
console.log('routes/pdf-v2.ts: __dirname = ', __dirname);

const router = express.Router();

const PDF_NAME = 'IRS-Federal-Income-Tax-Guide-2024-Publication-17.pdf';
const PDF_PATH = process.env.PDF_PATH || path.join(__dirname, '..', '..', 'assets', PDF_NAME);
console.log('routes/pdf-v2.ts: PDF_PATH = ', PDF_PATH);

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

const pageCache = new Map<string, Buffer>();

export async function initPdfInfo() {
    console.log('routes/pdf-v2.initPdfInfo()');

    const stat = fs.statSync(pdfInfo.filePath);
    pdfInfo.fileSize = stat.size;
    //pdfInfo.lastModified = stat.mtimeMs;
    //pdfInfo.etag = await computeEtag(pdfInfo.filePath);
    await ensurePageCount();
}

async function computeEtag(filePath: string): Promise<string> {
    console.log('routes/pdf-v2.computeEtag(filePath)', filePath);
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    return await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve('W/"' + hash.digest('hex') + '"'));
        stream.on('error', reject);
    });
}

async function ensurePageCount(): Promise<number | null> {
    console.log('routes/pdf-v2.ensurePageCount()');

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
        console.log('routes/pdf-v2.ensurePageCount(): return ' + pdfInfo.pageCount);
        return pdfInfo.pageCount;
    } catch (err) {
        console.error('Failed to read PDF page count with pdf-lib:', err);
        pdfInfo.pageCount = null;
        console.log('routes/pdf-v2.ensurePageCount(): return null');
        return null;
    }
}

router.get('/info', async (_req, res) => {
    console.log('routes/pdf-v2.ts: router.get(\'/info\', (_req, res)');

    if (!fs.existsSync(pdfInfo.filePath)) return res.status(404).json({ error: 'PDF not found' });
    
    await ensurePageCount();

    return res.json({
        fileName: pdfInfo.fileName,
        fileSize: pdfInfo.fileSize,
        //lastModified: pdfInfo.lastModified,
        //etag: pdfInfo.etag,
        pageCount: pdfInfo.pageCount,
    });
});

router.get('/page/:n', async (req, res) => {
    console.log('routes/pdf-v2.ts: router.get(\'/page/:n\', (_req, res)');

    if (!fs.existsSync(pdfInfo.filePath)) return res.status(404).json({ error: 'PDF not found' });

    const total = await ensurePageCount();
    console.log('total = ', total);
    if (!total) return res.status(500).json({ error: 'Unable to determine page count' });

    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 1 || n > total) {
        return res.status(400).json({ error: 'Invalid page number', totalPages: total });
    }

    /*
    const pageEtag = `${pdfInfo.etag}-p${n}`;
    res.setHeader('ETag', pageEtag);
    res.setHeader('Last-Modified', new Date(pdfInfo.lastModified).toUTCString());
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
        res.setHeader('Cache-Control', 'no-store');
    }
    res.setHeader('Content-Type', 'application/pdf');

    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === pageEtag) {
        return res.status(304).end();
    }

    const cacheKey = `${pdfInfo.etag}|${n}`;
    const cached = pageCache.get(cacheKey);
    if (cached) {
        res.setHeader('Content-Length', String(cached.length));
        return res.end(cached);
    }
    */

    try {
        const srcBytes = fs.readFileSync(pdfInfo.filePath);
        console.log('srcBytes = ', srcBytes);
        const srcDoc = await PDFDocument.load(srcBytes, { updateMetadata: false });
        console.log('srcDoc = ', srcDoc);
        const newDoc = await PDFDocument.create();
        console.log('newDoc = ', newDoc);
        const [copied] = await newDoc.copyPages(srcDoc, [n - 1]);
        console.log('copied = ', copied);
        newDoc.addPage(copied);
        const outBytes = await newDoc.save({ useObjectStreams: true });
        console.log('outBytes = ', outBytes);
        const buf = Buffer.from(outBytes);
        console.log('buf = ', buf);
        //pageCache.set(cacheKey, buf);
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
