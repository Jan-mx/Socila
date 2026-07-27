export interface ShowcaseLlmRuntimeDependencies<Config, Client, Stream> {
  getConfig: () => Config;
  createClient: (config: Config) => Client;
  setupStream: () => Stream;
}

export interface ShowcaseLlmRuntime<Config, Client, Stream> {
  fallbackOnly: boolean;
  config: Config | null;
  client: Client | null;
  stream: Stream | null;
}

export function createShowcaseLlmRuntime<Config, Client, Stream>(
  fallbackOnly: boolean,
  dependencies: ShowcaseLlmRuntimeDependencies<Config, Client, Stream>,
): ShowcaseLlmRuntime<Config, Client, Stream> {
  if (fallbackOnly) {
    return { fallbackOnly: true, config: null, client: null, stream: null };
  }

  const config = dependencies.getConfig();
  return {
    fallbackOnly: false,
    config,
    client: dependencies.createClient(config),
    stream: dependencies.setupStream(),
  };
}
