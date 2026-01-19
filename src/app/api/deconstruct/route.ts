import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

const DECONSTRUCT_PROMPT = `You are a productivity expert. Break down the given task into 2-3 KEY MILESTONES, each with 2-3 actionable baby steps.

STRUCTURE:
- Each MILESTONE is a significant checkpoint (the "what")
- Each STEP under a milestone takes MAX 3 minutes (the "how")
- Include the "why" for each milestone

RULES:
1. Maximum 3 milestones per task
2. Maximum 3 steps per milestone
3. Steps must be specific and actionable (start with a verb)
4. Milestones should feel like achievements when completed

Return ONLY valid JSON:
{
  "milestones": [
    {
      "title": "Milestone 1 title",
      "why": "Brief reason this milestone matters",
      "steps": ["Step 1", "Step 2", "Step 3"]
    }
  ]
}`;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
                    temperature: 0.3,
                    top_p: 0.9,
                    max_tokens: 1500,
                }
            })) {
                output += String(event);
            }
            return output;
        } catch (error) {
            if (attempt < maxRetries) {
                console.log(`Attempt ${attempt} failed, retrying...`);
                await delay(attempt * 3000);
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
        const { task, context } = body;

        if (!task) {
            return NextResponse.json({ error: 'No task provided' }, { status: 400 });
        }

        const apiKey = process.env.REPLICATE_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
        }

        const contextInfo = context ? `\nContext/Category: ${context}` : '';
        const userPrompt = `${DECONSTRUCT_PROMPT}\n\nTask to break down:${contextInfo}\n"${task}"`;

        const replicate = new Replicate({ auth: apiKey });
        const output = await callReplicateWithRetry(replicate, userPrompt);

        console.log('Deconstruct output length:', output.length);

        // Extract JSON
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return NextResponse.json({ error: 'Failed to parse response' }, { status: 500 });
        }

        const parsed = JSON.parse(jsonMatch[0]);

        // Support both old "steps" format and new "milestones" format
        if (parsed.milestones && Array.isArray(parsed.milestones)) {
            return NextResponse.json({ milestones: parsed.milestones });
        }

        // Fallback: convert flat steps to single milestone
        if (parsed.steps && Array.isArray(parsed.steps)) {
            return NextResponse.json({
                milestones: [{
                    title: "Complete task",
                    why: "Get it done",
                    steps: parsed.steps.slice(0, 3)
                }]
            });
        }

        return NextResponse.json({ error: 'Invalid response structure' }, { status: 500 });
    } catch (error) {
        console.error('Deconstruct error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Processing failed' },
            { status: 500 }
        );
    }
}
