// public/js/app.js  (ES module)

console.log('app.js');

import * as pdfjsLib from '/static/pdfjs/pdf.min.mjs'; // or '/static/pdfjs/pdf.mjs'
pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/pdfjs/pdf.worker.min.mjs'; // or '/static/pdfjs/pdf.worker.mjs'

(async function () {

    const infoRes = await fetch('/api/pdf/info');
    console.log('app.js: infoRes = ', infoRes);

    if (!infoRes.ok) { alert('Failed to load PDF info'); return; }

    const info = await infoRes.json();
    console.log('app.js: info = ', info);

    const totalPages = info.pageCount || 0;
    const version = info.etag || String(info.lastModified || Date.now());

    const pageCountEl = document.getElementById('pageCount');
    const pageInput = document.getElementById('pageInput');
    const firstBtn = document.getElementById('firstBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const lastBtn = document.getElementById('lastBtn');
    const canvas = document.getElementById('pdfCanvas');
    const ctx = canvas.getContext('2d');

    pageCountEl.textContent = String(totalPages);
    let currentPage = 1;
    let currentDoc = null;

    async function loadAndRender(pageNumber) {
        console.log('app.loadAndRender('+pageNumber+')');

        currentPage = Math.min(Math.max(1, pageNumber), totalPages);
        pageInput.value = String(currentPage);

        try { if (currentDoc) await currentDoc.destroy(); } catch {}

        const pageUrl = `/api/pdf/page/${currentPage}?v=${encodeURIComponent(version)}`;
        const loadingTask = pdfjsLib.getDocument({
            url: pageUrl,
            disableRange: true,
            disableStream: true,
        });

        currentDoc = await loadingTask.promise;
        const page = await currentDoc.getPage(1);

        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;
    }

    pageInput.addEventListener('change', () => {
        const n = parseInt(pageInput.value, 10);
        if (!Number.isNaN(n)) loadAndRender(n);
    });
    firstBtn.addEventListener('click', () => loadAndRender(1));
    prevBtn.addEventListener('click', () => loadAndRender(currentPage - 1));
    nextBtn.addEventListener('click', () => loadAndRender(currentPage + 1));
    lastBtn.addEventListener('click', () => loadAndRender(totalPages));

    await loadAndRender(1);
})();
