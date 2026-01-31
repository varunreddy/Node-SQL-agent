import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";

dotenv.config();

export interface LLMConfig {
    provider?: 'openai' | 'anthropic' | 'gemini';
    apiKey?: string;
    baseUrl?: string;
    modelName?: string;
    temperature?: number;
}

export function getLLM(options: { jsonMode?: boolean, config?: LLMConfig } = {}): BaseChatModel {
    const provider = options.config?.provider || 'openai';
    const modelName = options.config?.modelName || process.env.MODEL_NAME || (provider === 'openai' ? "gpt-4o" : provider === 'anthropic' ? "claude-3-5-sonnet-20240620" : "gemini-1.5-pro");
    const temperature = options.config?.temperature ?? parseFloat(process.env.TEMPERATURE || "0");
    const apiKey = options.config?.apiKey || (provider === 'openai' ? process.env.OPENAI_API_KEY : provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.GOOGLE_API_KEY) || "";

    if (!apiKey && !options.config?.baseUrl) {
        // Fallback for demo/default if no key provided
        if (process.env.GROQ_API_KEY) {
            return new ChatOpenAI({
                modelName: options.config?.modelName || "llama-3.1-70b-versatile",
                temperature,
                openAIApiKey: process.env.GROQ_API_KEY,
                configuration: { baseURL: "https://api.groq.com/openai/v1" },
                ...(options.jsonMode ? { modelKwargs: { response_format: { type: "json_object" } } } : {})
            });
        }
        throw new Error(`API Key for ${provider} is missing.`);
    }

    if (provider === 'anthropic') {
        return new ChatAnthropic({
            modelName,
            temperature,
            anthropicApiKey: apiKey,
            ...(options.jsonMode ? { modelOptions: { response_format: { type: "json_object" } } } : {}) // Note: LangChain Anthropic handle this differently sometimes
        });
    }

    if (provider === 'gemini') {
        return new ChatGoogleGenerativeAI({
            modelName,
            temperature,
            apiKey,
            ...(options.jsonMode ? { responseMimeType: "application/json" } : {})
        });
    }

    // Default: OpenAI or Compatible
    const baseUrl = options.config?.baseUrl || process.env.OPENAI_BASE_URL;
    return new ChatOpenAI({
        modelName,
        temperature,
        openAIApiKey: apiKey,
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
