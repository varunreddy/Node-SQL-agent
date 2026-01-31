import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";

dotenv.config();

export interface LLMConfig {
    apiKey?: string;
    baseUrl?: string;
    modelName?: string;
    temperature?: number;
}

export function getLLM(options: { jsonMode?: boolean, config?: LLMConfig } = {}): BaseChatModel {
    const modelName = options.config?.modelName || process.env.MODEL_NAME || "gpt-4o";
    const temperature = options.config?.temperature ?? parseFloat(process.env.TEMPERATURE || "0");

    // Ensure empty string is treated as falsy
    let apiKey = options.config?.apiKey || process.env.OPENAI_API_KEY || "";
    let baseUrl = options.config?.baseUrl || process.env.OPENAI_BASE_URL;
    let finalModelName = modelName;

    // Fallback if OpenAI key is missing
    if (!apiKey) {
        if (process.env.GROQ_API_KEY) {
            // console.log("[DEBUG] Using Groq API Key");
            apiKey = process.env.GROQ_API_KEY;
            baseUrl = "https://api.groq.com/openai/v1";
            if (!process.env.MODEL_NAME && !options.config?.modelName) finalModelName = "moonshotai/kimi-k2-instruct-0905";
        } else if (process.env.OPENROUTER_API_KEY) {
            console.log("[DEBUG] Using OpenRouter API Key");
            apiKey = process.env.OPENROUTER_API_KEY;
            baseUrl = "https://openrouter.ai/api/v1";
            if (!process.env.MODEL_NAME && !options.config?.modelName) finalModelName = "openai/gpt-4o";
        }
    }

    if (!apiKey) {
        throw new Error("No API Key found. Please set OPENAI_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY.");
    }

    const config: any = {
        modelName: finalModelName,
        temperature: temperature,
        maxTokens: 1000,
        openAIApiKey: apiKey,
        configuration: {
            baseURL: baseUrl,
            defaultHeaders: {
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Node SQL Agent"
            }
        }
    };

    if (options.jsonMode) {
        config.modelKwargs = { response_format: { type: "json_object" } };
    }

    return new ChatOpenAI(config);
}

// Simple wrapper to strip thinking tags if needed (not fully implemented as JS/TS string manipulation is easy)
export async function invokeLLM(llm: BaseChatModel, prompt: string | BaseMessage[]): Promise<string> {
    const response = await llm.invoke(prompt);
    let content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    // Strip thinking tags if present (e.g. <think>...</think>)
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

    return content.trim();
}
