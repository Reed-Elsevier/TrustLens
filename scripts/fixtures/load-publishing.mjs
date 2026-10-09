import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);

// Direct route tests use the existing TypeScript dependency and resolve the app's @/ alias.
export function loadPublishingModules() {
  const resolve = Module._resolveFilename;
  const previousTsLoader = require.extensions[".ts"];
  Module._resolveFilename = function (request, parent, ...rest) {
    const target = request.startsWith("@/") ? path.join(root, request.slice(2)) : request;
    return resolve.call(this, target, parent, ...rest);
  };
  require.extensions[".ts"] = function (module, filename) {
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    });
    module._compile(output.outputText, filename);
  };
  try {
    return {
      ringsRoute: require(path.join(root, "app", "api", "publishing", "rings", "route.ts")),
      riskRoute: require(path.join(root, "app", "api", "publishing", "risk", "route.ts")),
      detailRoute: require(path.join(root, "app", "api", "publishing", "risk", "[manuscriptId]", "route.ts")),
      explainRoute: require(path.join(root, "app", "api", "publishing", "explain", "route.ts")),
      queries: require(path.join(root, "lib", "publishing", "queries.ts")),
      rings: require(path.join(root, "lib", "publishing", "rings.ts")),
      risk: require(path.join(root, "lib", "publishing", "risk.ts")),
      explain: require(path.join(root, "lib", "publishing", "explain.ts")),
      http: require(path.join(root, "lib", "publishing", "http.ts")),
      claude: require(path.join(root, "lib", "claude.ts")),
      config: require(path.join(root, "lib", "publishing", "config.ts")),
    };
  } finally {
    Module._resolveFilename = resolve;
    if (previousTsLoader) require.extensions[".ts"] = previousTsLoader;
    else delete require.extensions[".ts"];
  }
}
