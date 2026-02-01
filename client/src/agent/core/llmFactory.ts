import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage } from "@langchain/core/messages";
// Browser-safe environment variable access
const getEnv = (key: string): string => {
    // @ts-ignore - Vite specific
    return import.meta.env?.[`VITE_${key}`] || "";
};

export interface LLMConfig {
    provider?: 'openai' | 'anthropic' | 'gemini';
    apiKey?: string;
    baseUrl?: string;
    modelName?: string;
    temperature?: number;
    maxTokens?: number;
}

export function getLLM(options: { jsonMode?: boolean, config?: LLMConfig } = {}): BaseChatModel {
    const provider = options.config?.provider || 'openai';
    const modelName = options.config?.modelName || getEnv("MODEL_NAME") || (provider === 'openai' ? "gpt-4o" : provider === 'anthropic' ? "claude-3-5-sonnet-20240620" : "gemini-1.5-pro");
    const temperature = options.config?.temperature ?? parseFloat(getEnv("TEMPERATURE") || "0");
    const apiKey = (options.config?.apiKey || (provider === 'openai' ? getEnv("OPENAI_API_KEY") : provider === 'anthropic' ? getEnv("ANTHROPIC_API_KEY") : provider === 'gemini' ? getEnv("GOOGLE_API_KEY") : "") || "").trim();

    if (!apiKey) {
        throw new Error(`API Key for ${provider} is missing. Please provide it in the UI, or set it in your .env file.`);
    }

    console.log(`[LLM Factory] Initializing ${provider} with model ${modelName}. Key present: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);

    if (provider === 'anthropic') {
        return new ChatAnthropic({
            modelName,
            temperature,
            maxTokens: options.config?.maxTokens,
            anthropicApiKey: apiKey,
            ...(options.jsonMode ? { modelOptions: { response_format: { type: "json_object" } } } : {}) // Note: LangChain Anthropic handle this differently sometimes
        });
    }

    if (provider === 'gemini') {
        return new ChatGoogleGenerativeAI({
            model: modelName,
            temperature,
            maxOutputTokens: options.config?.maxTokens,
            apiKey,
            ...(options.jsonMode ? { responseMimeType: "application/json" } : {})
        });
    }

    // Default: OpenAI or Compatible
    const baseUrl = options.config?.baseUrl || getEnv("OPENAI_BASE_URL");
    return new ChatOpenAI({
        modelName,
        temperature,
        maxTokens: options.config?.maxTokens,
        apiKey: apiKey,
        configuration: {
            baseURL: baseUrl,
            defaultHeaders: {
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Node SQL Agent"
            }
        },
        ...(options.jsonMode ? { modelKwargs: { response_format: { type: "json_object" } } } : {})
    });
}

export async function invokeLLM(llm: BaseChatModel, prompt: string | BaseMessage[]): Promise<string> {
    const response = await llm.invoke(prompt);
    let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // Strip thinking tags if present (e.g. <think>...</think>)
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

    return content.trim();
}
