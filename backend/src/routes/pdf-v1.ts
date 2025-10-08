console.log('routes/pdf-v1.ts');

import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parseRange } from '../utils/range.js';

// Use pdfjs-dist in Node to read page count
//import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('routes/pdf-v1.ts: __filename = ', __filename);
console.log('routes/pdf-v1.ts: __dirname = ', __dirname);

const router = express.Router();

const PDF_NAME = 'IRS-Federal-Income-Tax-Guide-2024-Publication-17.pdf';
const PDF_PATH = process.env.PDF_PATH || path.join(__dirname, '..', '..', 'assets', PDF_NAME);
console.log('routes/pdf-v1.ts: PDF_PATH = ', PDF_PATH);

type PdfInfo = {
    filePath: string;
    fileName: string;
    fileSize: number;
    lastModified: number;
    //etag: string;
    pageCount: number | null;
};

let pdfInfo: PdfInfo = {
    filePath: path.resolve(PDF_PATH),
    fileName: path.basename(PDF_PATH),
    fileSize: 0,
    lastModified: 0,
    //etag: '',
    pageCount: null,
};
console.log('routes/pdf-v1.ts: pdfInfo = ', pdfInfo);

/*
 * Get the PDF Info including the pageCount.
 */
/*
export async function initPdfInfo() {
    console.log('routes/pdf.ts: initPdfInfo()');

    const stat = fs.statSync(pdfInfo.filePath);
    pdfInfo.fileSize = stat.size;
    pdfInfo.lastModified = stat.mtimeMs;
    pdfInfo.etag = await computeEtag(pdfInfo.filePath);
    console.log('pdfInfo = ', pdfInfo);

    try {
        // Configure pdfjs to use a fake worker in Node
        // @ts-ignore
        pdfjs.GlobalWorkerOptions.workerSrc = undefined;
        const data = new Uint8Array(fs.readFileSync(pdfInfo.filePath));
        const loadingTask = pdfjs.getDocument({ data });
        const doc = await loadingTask.promise;
        console.log('doc.numPages = ', doc.numPages);

        pdfInfo.pageCount = doc.numPages;

        await doc.destroy();
    } catch (err) {
        console.error('Failed to read PDF page count:', err);
        pdfInfo.pageCount = null;
    }
}
*/

/*
 * Get the PDF Info and leave the front-end clientto get the pageCount.
 */

export async function initPdfInfo() {
    console.log('routes/pdf-v1.initPdfInfo()');

    const stat = fs.statSync(pdfInfo.filePath);
    pdfInfo.fileSize = stat.size;
    //pdfInfo.lastModified = stat.mtimeMs;
    //pdfInfo.etag = await computeEtag(pdfInfo.filePath);

    // Let the client compute pageCount with PDF.js.
    pdfInfo.pageCount = null;
}

async function computeEtag(filePath: string): Promise<string> {
    console.log('routes/pdf-v1.computeEtag(filePath)', filePath);

    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    return await new Promise((resolve, reject) => {
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve('W/"' + hash.digest('hex') + '"'));
        stream.on('error', reject);
    });
}

// JSON metadata
router.get('/info', (_req, res) => {
    console.log('routes/pdf-v1.ts: router.get(\'/info\', (_req, res)');

    if (!fs.existsSync(pdfInfo.filePath)) return res.status(404).json({ error: 'PDF not found' });
    
    return res.json({
        fileName: pdfInfo.fileName,
        fileSize: pdfInfo.fileSize,
        //lastModified: pdfInfo.lastModified,
        //etag: pdfInfo.etag,
        pageCount: pdfInfo.pageCount,
    });
});

// Byte-range capable streaming endpoint
router.get('/stream', (req, res) => {
    console.log('routes/pdf-v1.ts: router.stream(req, res)');

    console.log('pdfInfo.filePath = ', pdfInfo.filePath);

    if (!fs.existsSync(pdfInfo.filePath)) return res.status(404).json({ error: 'PDF not found' });

    const stat = fs.statSync(pdfInfo.filePath);
    const fileSize = stat.size;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'application/pdf');
    /*
    res.setHeader('ETag', pdfInfo.etag);
    res.setHeader('Last-Modified', new Date(pdfInfo.lastModified).toUTCString());
    // Strong cache for a specific file as long as content doesn't change.
    // (If you rotate files, also rotate the path or invalidate etag.)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Conditional requests
    const ifNoneMatch = req.headers['if-none-match'];
    const ifModifiedSince = req.headers['if-modified-since'];
    if (
           (ifNoneMatch && ifNoneMatch === pdfInfo.etag)
        || (ifModifiedSince && new Date(ifModifiedSince).getTime() >= pdfInfo.lastModified)
    ) {
        return res.status(304).end();
    }
    */

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
        // No (valid) Range header, send entire file
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
