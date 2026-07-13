import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "playwright") {
    return {
      shortCircuit: true,
      url: pathToFileURL(resolvePath("node_modules/playwright/index.mjs")).href
    };
  }
  return nextResolve(specifier, context);
}
