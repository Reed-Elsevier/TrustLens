import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);

// Loads the TypeScript analyzer modules with the existing TypeScript dependency and the app's @/ alias.
export function loadAnalyzeModules() {
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
  const load = (...parts) => require(path.join(root, ...parts));
  try {
    return {
      analyzeRoute: load("app", "api", "analyze", "route.ts"),
      reviewRoute: load("app", "api", "analyze", "review", "route.ts"),
      chatRoute: load("app", "api", "analyze", "chat", "route.ts"),
      service: load("lib", "analyze", "service.ts"),
      pdf: load("lib", "analyze", "pdf.ts"),
      review: load("lib", "analyze", "review.ts"),
      chat: load("lib", "analyze", "chat.ts"),
      store: load("lib", "analyze", "store.ts"),
      structure: load("lib", "analyze", "structure.ts"),
      anomalies: load("lib", "analyze", "anomalies.ts"),
      findings: load("lib", "analyze", "findings.ts"),
      legalScan: load("lib", "analyze", "legalScan.ts"),
      integrity: load("lib", "analyze", "integrity.ts"),
      config: load("lib", "analyze", "config.ts"),
      similarity: load("lib", "text", "similarity.ts"),
      legalConfig: load("lib", "legal", "config.ts"),
      claude: load("lib", "claude.ts"),
    };
  } finally {
    Module._resolveFilename = resolve;
    if (previousTsLoader) require.extensions[".ts"] = previousTsLoader;
    else delete require.extensions[".ts"];
  }
}
