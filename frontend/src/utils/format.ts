export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes)) return '-';
    const units = ['B','KB','MB','GB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(i === 0 ? 0 : v < 10 ? 2 : 1)} ${units[i]}`;
}

export function formatDate(ms: number): string {
    if (!ms) return '-';
    try {
        const d = new Date(ms);
        return d.toLocaleString();
    } catch {
        return '-';
    }
}
