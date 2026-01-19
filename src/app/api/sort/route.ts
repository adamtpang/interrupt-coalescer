import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import type { SortResponse } from '@/lib/types';

const SORT_SYSTEM_PROMPT = `Categorize tasks into buckets. Return ONLY valid JSON, no extra text.

Format: {"tasks": [{"text": "task text", "bucket": "BucketName"}]}

Rules:
- Use existing buckets when appropriate
- Bucket names: 1-2 words, actionable
- Group similar tasks together`;

// Try to fix common JSON issues from LLM output
function repairJSON(str: string): string {
    const start = str.indexOf('{');
    const end = str.lastIndexOf('}');
    if (start === -1 || end === -1) return str;

    let json = str.slice(start, end + 1);
    json = json.replace(/,\s*]/g, ']');
    json = json.replace(/,\s*}/g, '}');
    json = json.replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":');

    return json;
}

// Delay helper
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry wrapper for Replicate API calls
async function callReplicateWithRetry(
    replicate: Replicate,
    prompt: string,
    maxRetries: number = 3
): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            let output = "";
            for await (const event of replicate.stream("meta/meta-llama-3-70b-instruct", {
                input: {
                    prompt,
                    temperature: 0.2,
                    top_p: 0.9,
                    max_tokens: 4000,
                }
            })) {
                output += String(event);
            }
            return output;
        } catch (error) {
            const isTimeout = error instanceof Error &&
                (error.message.includes('timeout') || error.message.includes('Timeout') ||
                    error.message.includes('fetch failed') || error.message.includes('ETIMEDOUT'));

            if (isTimeout && attempt < maxRetries) {
                console.log(`Attempt ${attempt} failed (timeout), retrying in ${attempt * 5}s...`);
                await delay(attempt * 5000); // Exponential backoff: 5s, 10s, 15s
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retries exceeded');
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { batch, existingBuckets } = body;

        if (!batch || batch.length === 0) {
            return NextResponse.json({ error: 'No tasks provided' }, { status: 400 });
        }

        const apiKey = process.env.REPLICATE_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        // Build prompt
        const bucketsContext = existingBuckets?.length > 0
            ? `Existing buckets: ${existingBuckets.join(', ')}`
            : '';

        const tasksText = batch.map((task: string, i: number) => `${i + 1}. ${task}`).join('\n');
        const userPrompt = `${SORT_SYSTEM_PROMPT}\n\n${bucketsContext}\n\nTasks:\n${tasksText}`;

        // Call Replicate with retry logic
        const replicate = new Replicate({ auth: apiKey });
        const output = await callReplicateWithRetry(replicate, userPrompt);

        console.log('Raw AI output length:', output.length);

        // Try to extract and repair JSON
        let jsonStr = repairJSON(output);

        let parsedResponse: SortResponse;
        try {
            parsedResponse = JSON.parse(jsonStr);
        } catch (parseError) {
            console.error('JSON parse failed. Raw output:', output.substring(0, 500));

            // Fallback: extract individual task objects via regex
            const taskMatches = output.matchAll(/"text"\s*:\s*"([^"]+)"\s*,\s*"bucket"\s*:\s*"([^"]+)"/g);
            const tasks = Array.from(taskMatches).map(m => ({ text: m[1], bucket: m[2] }));

            if (tasks.length > 0) {
                parsedResponse = { tasks };
            } else {
                return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
            }
        }

        if (!parsedResponse.tasks || !Array.isArray(parsedResponse.tasks)) {
            return NextResponse.json({ error: 'Invalid AI response structure' }, { status: 500 });
        }

        return NextResponse.json(parsedResponse);
    } catch (error) {
        console.error('Sort error:', error);
        const message = error instanceof Error ? error.message : 'Processing failed';
        const isNetwork = message.includes('timeout') || message.includes('fetch failed');

        return NextResponse.json(
            { error: isNetwork ? 'Network timeout - please try again' : message },
            { status: isNetwork ? 503 : 500 }
        );
    }
}
