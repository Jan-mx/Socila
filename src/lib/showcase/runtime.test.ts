import { describe, expect, it, vi } from "vitest";

type RuntimeModule = {
  createShowcaseLlmRuntime?: <Config, Client, Stream>(
    fallbackOnly: boolean,
    dependencies: {
      getConfig: () => Config;
      createClient: (config: Config) => Client;
      setupStream: () => Stream;
    },
  ) => {
    fallbackOnly: boolean;
    config: Config | null;
    client: Client | null;
    stream: Stream | null;
  };
};

async function runtime(): Promise<Required<RuntimeModule>> {
  const runtimeModule = await import("./runtime").catch(() => ({} as RuntimeModule));
  expect(runtimeModule.createShowcaseLlmRuntime).toBeTypeOf("function");
  return runtimeModule as Required<RuntimeModule>;
}

describe("showcase LLM runtime", () => {
  it("skips OpenAI configuration, client, and stream setup in fallback-only mode", async () => {
    const { createShowcaseLlmRuntime } = await runtime();
    const getConfig = vi.fn(() => ({ apiKey: "key", baseURL: "url", model: "model" }));
    const createClient = vi.fn(() => ({ provider: "openai" }));
    const setupStream = vi.fn(() => vi.fn());

    const selected = createShowcaseLlmRuntime(true, { getConfig, createClient, setupStream });

    expect(selected).toEqual({ fallbackOnly: true, config: null, client: null, stream: null });
    expect(getConfig).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(setupStream).not.toHaveBeenCalled();
  });

  it("sets up the configured LLM runtime outside fallback-only mode", async () => {
    const { createShowcaseLlmRuntime } = await runtime();
    const config = { apiKey: "key", baseURL: "url", model: "model" };
    const client = { provider: "openai" };
    const stream = vi.fn();
    const getConfig = vi.fn(() => config);
    const createClient = vi.fn(() => client);
    const setupStream = vi.fn(() => stream);

    const selected = createShowcaseLlmRuntime(false, { getConfig, createClient, setupStream });

    expect(selected).toEqual({ fallbackOnly: false, config, client, stream });
    expect(getConfig).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith(config);
    expect(setupStream).toHaveBeenCalledOnce();
  });
});
