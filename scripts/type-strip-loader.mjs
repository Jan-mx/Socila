import { existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return resolveTypeScriptFile(pathToFileURL(resolvePath(process.cwd(), "src", specifier.slice(2))).href);
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    ![".ts", ".js", ".mjs", ".cjs", ".json", ".node"].some((extension) => specifier.endsWith(extension))
  ) {
    return resolveTypeScriptFile(new URL(specifier, context.parentURL).href);
  }

  return nextResolve(specifier, context);
}

function resolveTypeScriptFile(extensionlessUrl) {
  for (const candidate of [`${extensionlessUrl}.ts`, `${extensionlessUrl}/index.ts`]) {
    if (existsSync(fileURLToPath(candidate))) {
      return { url: candidate, shortCircuit: true };
    }
  }
  throw new Error(`cannot resolve TypeScript module: ${extensionlessUrl}`);
}
