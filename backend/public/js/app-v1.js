console.log('app-v1.js');

// public/js/app.js  (ES module)
import * as pdfjsLib from '/static/pdfjs/pdf.min.mjs'; // or '/static/pdfjs/pdf.mjs'
pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/pdfjs/pdf.worker.min.mjs'; // or '/static/pdfjs/pdf.worker.mjs'

(async function () {

    const infoRes = await fetch('/api/pdf/info');
    console.log('app-v1.js: infoRes = ', infoRes);
    
    if (!infoRes.ok) { alert('Failed to load PDF info'); return; }

    const info = await infoRes.json();
    console.log('app-v1.js: info = ', info);

    const url = '/api/pdf/stream';
    const loadingTask = pdfjsLib.getDocument({
        url,
        rangeChunkSize: 1 << 20,
        disableRange: false,
        httpHeaders: { 'X-Requested-With': 'pdf-pager-demo' },
    });

    const pdfDoc = await loadingTask.promise;

    const pageCount = pdfDoc.numPages || info.pageCount || 0;

    const pageCountEl = document.getElementById('pageCount');
    const pageInput = document.getElementById('pageInput');
    const firstBtn = document.getElementById('firstBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const lastBtn = document.getElementById('lastBtn');
    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');

    pageCountEl.textContent = String(pageCount);
    let currentPage = 1;

    async function renderPage(pageNumber) {
        console.log('app-v1.renderPage('+pageNumber+')');
        currentPage = Math.min(Math.max(1, pageNumber), pageCount);
        console.log('currentPage = ', currentPage);
        pageInput.value = String(currentPage);
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
    }

    pageInput.addEventListener('change', () => {
        const n = parseInt(pageInput.value, 10);
        if (!Number.isNaN(n)) renderPage(n);
    });
    firstBtn.addEventListener('click', () => renderPage(1));
    prevBtn.addEventListener('click', () => renderPage(currentPage - 1));
    nextBtn.addEventListener('click', () => renderPage(currentPage + 1));
    lastBtn.addEventListener('click', () => renderPage(pageCount));

    renderPage(1);
})();
