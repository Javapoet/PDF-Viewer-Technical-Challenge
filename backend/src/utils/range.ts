export type Range = { start: number; end: number } | null;

export function parseRange(rangeHeader: string | undefined, fileSize: number): Range {
    console.log('utils/range.parseRange(rangeHeader, fileSize)', rangeHeader, fileSize);

    if (!rangeHeader) return null;

    // Expected: bytes=start-end
    const matches = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!matches) return null;

    let start = matches[1] === '' ? NaN : parseInt(matches[1], 10);
    let end = matches[2] === '' ? NaN : parseInt(matches[2], 10);
    console.log(`start = ${ start }`);
    console.log(`end = ${ end }`);

    if (Number.isNaN(start) && Number.isNaN(end)) return null;

    if (Number.isNaN(start)) {
        // suffix range - last 'end' bytes
        const suffixLength = end;
        if (suffixLength <= 0) return null;
        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
    } else if (Number.isNaN(end)) {
        end = fileSize - 1;
    }

    if (start < 0 || end < 0 || start > end || end >= fileSize) return null;

    console.log(`start = ${ start }`);
    console.log(`end = ${ end }`);

    return { start, end };
}
