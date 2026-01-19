/**
 * Model-agnostic AI client wrapper
 * Uses OpenAI SDK but supports swapping to Gemini/Claude via environment
 */

import OpenAI from 'openai';

export type AIProvider = 'openai' | 'gemini' | 'claude' | 'replicate';

interface AIClientConfig {
    apiKey: string;
    provider?: AIProvider;
}

export function createAIClient(config: AIClientConfig): OpenAI {
    const { apiKey, provider = 'openai' } = config;

    // Configure base URL based on provider
    // OpenAI SDK can work with compatible APIs
    const baseURLMap: Record<AIProvider, string | undefined> = {
        openai: undefined, // Uses default
        gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/', // Compatible endpoint
        claude: 'https://api.anthropic.com/v1/', // Note: May need adapter
        replicate: 'https://api.replicate.com/v1/', // Replicate OpenAI-compatible endpoint
    };

    const modelMap: Record<AIProvider, string> = {
        openai: 'gpt-4o-mini',
        gemini: 'gemini-2.0-flash',
        claude: 'claude-3-5-sonnet-latest',
        replicate: 'meta/llama-3.3-70b-instruct',
    };

    return new OpenAI({
        apiKey,
        baseURL: baseURLMap[provider],
        defaultHeaders: provider === 'claude' ? {
            'anthropic-version': '2023-06-01',
        } : undefined,
    });
}

export function getModelForProvider(provider: AIProvider): string {
    const modelMap: Record<AIProvider, string> = {
        openai: 'gpt-4o-mini',
        gemini: 'gemini-2.0-flash',
        claude: 'claude-3-5-sonnet-latest',
        replicate: 'meta/llama-3.3-70b-instruct',
    };
    return modelMap[provider];
}

export const SORT_SYSTEM_PROMPT = `You are an expert organizer. Analyze the given tasks and categorize them.

RULES:
1. Assign each task to an existing bucket if one fits well
2. Create new specific, one-word buckets only when necessary (e.g., 'Health', 'Coding', 'Errands', 'Finance', 'Social')
3. Be consistent - use existing buckets when possible
4. Keep bucket names simple and actionable

Return ONLY a valid JSON object with this exact structure:
{
  "tasks": [
    { "text": "the original task text", "bucket": "BucketName" }
  ]
}

Do not include any explanation or markdown, only the JSON.`;
