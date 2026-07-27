/**
 * OpenAI 运行时配置。
 *
 * 统一支持以下环境变量：
 * - OPENAI_URL（可选，默认官方 API）
 * - OPENAI_API_KEY（必填）
 * - OPENAI_MODEL（必填）
 */

const DEFAULT_OPENAI_URL = "https://api.openai.com/v1";

export interface OpenAIConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

function readRequiredEnv(name: "OPENAI_API_KEY" | "OPENAI_MODEL"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} not set`);
  }
  return value;
}

export function getOpenAIConfig(): OpenAIConfig {
  const apiKey = readRequiredEnv("OPENAI_API_KEY");
  const model = readRequiredEnv("OPENAI_MODEL");
  const baseURL =
    process.env.OPENAI_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    DEFAULT_OPENAI_URL;

  // cr_ 前缀通常是中转网关 key，不应静默回退到官方 OpenAI。
  if (
    apiKey.startsWith("cr_") &&
    !process.env.OPENAI_URL?.trim() &&
    !process.env.OPENAI_BASE_URL?.trim()
  ) {
    throw new Error(
      "OPENAI_URL not set for relay key (cr_). Set OPENAI_URL or OPENAI_BASE_URL.",
    );
  }

  return {
    baseURL,
    apiKey,
    model,
  };
}
