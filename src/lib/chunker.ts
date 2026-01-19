/**
 * Splits a large text file into batches of lines for sequential processing.
 * Filters empty lines and preserves task structure.
 */

export interface Batch {
    lines: string[];
    index: number;
    total: number;
}

export function splitIntoBatches(text: string, linesPerBatch: number = 50): Batch[] {
    // Split text into lines and filter out empty/whitespace-only lines
    const lines = text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);

    if (lines.length === 0) {
        return [];
    }

    const batches: Batch[] = [];
    const totalBatches = Math.ceil(lines.length / linesPerBatch);

    for (let i = 0; i < lines.length; i += linesPerBatch) {
        const batchLines = lines.slice(i, i + linesPerBatch);
        batches.push({
            lines: batchLines,
            index: batches.length,
            total: totalBatches,
        });
    }

    return batches;
}

/**
 * Estimates the total number of batches for a given file size
 */
export function estimateBatches(charCount: number, avgCharsPerLine: number = 50, linesPerBatch: number = 50): number {
    const estimatedLines = Math.ceil(charCount / avgCharsPerLine);
    return Math.ceil(estimatedLines / linesPerBatch);
}
