/**
 * Type definitions for the FlowState Sorter application
 */

export interface Task {
    id: string;
    text: string;
    bucket: string;
}

export interface Bucket {
    name: string;
    tasks: Task[];
}

export interface SortRequest {
    batch: string[];
    existingBuckets: string[];
    apiKey: string;
    provider?: 'openai' | 'gemini' | 'claude';
}

export interface SortResponse {
    tasks: Array<{
        text: string;
        bucket: string;
    }>;
}

export interface ProcessingState {
    isProcessing: boolean;
    currentBatch: number;
    totalBatches: number;
    error: string | null;
}
