import React from 'react'
import PdfViewer from './components/PdfViewer'
import { formatBytes, formatDate } from './utils/format'

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

export default function App() {

    const [info, setInfo] = React.useState<Info | null>(null)
    const [err, setErr] = React.useState<string | null>(null)
    const [loading, setLoading] = React.useState(true)

    async function fetchInfo() {
        setLoading(true); setErr(null)
        try {
            const r = await fetch('/api/pdf/info')
            if (!r.ok) throw new Error(`Info error ${r.status}`)
            const j = await r.json()
            setInfo(j)
        } catch (e: any) {
            setErr(e?.message || 'Failed to fetch metadata')
        } finally {
            setLoading(false)
        }
    }

    React.useEffect(() => { fetchInfo() }, [])

    return (
        <div className="app">

            <div className="header">
                <div className="title">React PDF Page Viewer</div>
                <div className="meta">React + Vite + PDF.js</div>
            </div>

            <div className="card">
                <div style = {{
                    display:'flex'
                    , justifyContent:'space-between'
                    , alignItems:'baseline'
                    , gap:12
                }}>
                    <div><strong>Document:</strong> {info?.fileName ?? (loading ? 'Loading…' : '—')}</div>
                    <div className="small">
                        Pages: { info?.pageCount ?? '—' } • Size: { info ? formatBytes(info.fileSize) : '—' } • Updated: { info ? formatDate(info.lastModified) : '—' }
                    </div>
                </div>

                <hr className="hr" />

                {
                    err
                    && (
                        <div className="error">
                            <div>⚠️ { err }</div>
                            <button onClick = { fetchInfo }>Retry</button>
                        </div>
                    )
                }

                <PdfViewer info = { info } loadingInfo = { loading } />
            </div>
        </div>
    )
}
