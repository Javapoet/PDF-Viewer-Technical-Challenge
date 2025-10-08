import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.mjs'
import React from 'react'

/*
 * Define a type for the PDF docuemnt information
 */
type Info = {
    fileName: string
    fileSize: number
    lastModified: number
    etag: string
    pageCount: number
}

pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/pdfjs/pdf.worker.min.mjs'

/*
 * Define a type for the props
 */
type Props = {
    info: Info | null
    loadingInfo: boolean
}

type CacheEntry = { data: ArrayBuffer, ts: number }

export default function PdfViewer({ info, loadingInfo }: Props) {

    const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
    const [page, setPage] = React.useState(1)
    const [isRendering, setIsRendering] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [dim, setDim] = React.useState<{w:number,h:number}|null>(null)

    const cacheRef = React.useRef<Map<number, CacheEntry>>(new Map())
    const docRef = React.useRef<any>(null)
    const reqIdRef = React.useRef(0)

    const total = info?.pageCount ?? 0
    const version = info?.etag || String(info?.lastModified || '')

    const clamped = (n: number) => Math.min(Math.max(1, n), total || 1)

    async function prefetch(n: number) {
        if (!info || n < 1 || n > total) return
        if (cacheRef.current.has(n)) return
        try {
          const u = `/api/pdf/page/${n}?v=${encodeURIComponent(version)}`
          const r = await fetch(u, { cache: 'force-cache' })
          if (!r.ok) return
          const buf = await r.arrayBuffer()
          cacheRef.current.set(n, { data: buf, ts: Date.now() })
          for (const k of cacheRef.current.keys()) {
            if (k !== n && k !== page) cacheRef.current.delete(k)
          }
        } catch {}
    }

    async function loadAndRender(n: number) {
        if (!info) return
        const target = clamped(n)
        setError(null)
        setIsRendering(true)
        reqIdRef.current++
        const myReq = reqIdRef.current

        try { if (docRef.current) await docRef.current.destroy() } catch {}

        try {
          let loadingTask: any
          const cached = cacheRef.current.get(target)
          if (cached) {
            loadingTask = pdfjsLib.getDocument({ data: cached.data, disableRange: true, disableStream: true })
          } else {
            const url = `/api/pdf/page/${target}?v=${encodeURIComponent(version)}`
            loadingTask = pdfjsLib.getDocument({ url, disableRange: true, disableStream: true })
          }

          const pdfDoc = await loadingTask.promise
          if (myReq !== reqIdRef.current) return
          docRef.current = pdfDoc

          const pdfPage = await pdfDoc.getPage(1)
          const scale = 1.5
          const viewport = pdfPage.getViewport({ scale })
          setDim({ w: viewport.width, h: viewport.height })

          const canvas = canvasRef.current!
          const ctx = canvas.getContext('2d')!
          canvas.width = viewport.width
          canvas.height = viewport.height

          await pdfPage.render({ canvasContext: ctx, viewport }).promise
          if (myReq !== reqIdRef.current) return
          setPage(target)

          void prefetch(target + 1)
        } catch (e: any) {
          if (myReq !== reqIdRef.current) return
          setError(e?.message || 'Failed to render page')
        } finally {
          if (myReq === reqIdRef.current) setIsRendering(false)
        }
    }

    React.useEffect(() => {
      if (!loadingInfo && info?.pageCount) {
        void loadAndRender(1)
      }
      return () => { try { if (docRef.current) docRef.current.destroy() } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadingInfo])

    React.useEffect(() => {
        function onKey(e: KeyboardEvent) {
          if (!info) return
          if (e.key === 'ArrowRight') void loadAndRender(page + 1)
          if (e.key === 'ArrowLeft') void loadAndRender(page - 1)
          if (e.key === 'Home') void loadAndRender(1)
          if (e.key === 'End') void loadAndRender(total)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [info, page, total])

    const disabled = !info || total <= 1

    return (
        <div className="viewer">
            <div className="toolbar">
              <button onClick={() => loadAndRender(1)} disabled={disabled || page === 1}>⏮ First</button>
              <button onClick={() => loadAndRender(page - 1)} disabled={disabled || page <= 1}>◀ Prev</button>
              <span>Page&nbsp;</span>
              <input
                type="number" min={1} max={total || 1}
                value={page}
                onChange={(e) => {
                  const v = Number(e.target.value || 1)
                  const t = clamped(v)
                  if (t !== page) void loadAndRender(t)
                }}
              />
              <span>&nbsp;/ {total || '—'}</span>
              <button onClick={() => loadAndRender(page + 1)} disabled={disabled || page >= total}>Next ▶</button>
              <button onClick={() => loadAndRender(total)} disabled={disabled || page === total}>Last ⏭</button>
              <span className="small" style={{marginLeft:'auto'}}>{isRendering ? 'Rendering…' : ''}</span>
            </div>

            <div className="canvasWrap" style={{ minHeight: dim ? `${dim.h}px` : '70vh' }}>
              <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
              {isRendering && <div className="skeleton" />}
            </div>

            {error && (
              <div className="error">
                <div>⚠️ {error}</div>
                <button onClick={() => loadAndRender(page)}>Retry</button>
              </div>
            )}
        </div>
    )
}
