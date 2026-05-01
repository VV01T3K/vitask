// Fixes Orval bug: runtimeValidation generates Foo.parse() but imports Foo with `import type`,
// which TypeScript rejects. Scans gen/endpoints for .gen.ts files and fixes them.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = new URL("./gen/endpoints", import.meta.url).pathname;
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".gen.ts"))
  .map((f) => join(dir, f));

for (const file of files) {
  let content = readFileSync(file, "utf-8");

  // Find schema names used as values (e.g. TaskResponse.parse(...))
  const valueNames = new Set(
    [...content.matchAll(/\b([A-Z][A-Za-z0-9]*)\.parse\(/g)].map((m) => m[1]),
  );
  if (valueNames.size === 0) continue;

  // Match single-line and multi-line `import type { ... } from "...";`
  const importTypeRe = /import type \{([^}]+)\} from (['"][^'"]+['"])\s*;/g;
  let modified = false;

  content = content.replace(importTypeRe, (match, names, from) => {
    const nameList = names.split(",").map((n) => n.trim()).filter(Boolean);
    const valueImports = nameList.filter((n) => valueNames.has(n));
    const typeImports = nameList.filter((n) => !valueNames.has(n));

    if (valueImports.length === 0) return match;

    modified = true;
    const lines = [`import { ${valueImports.join(", ")} } from ${from};`];
    if (typeImports.length > 0) {
      lines.push(`import type { ${typeImports.join(", ")} } from ${from};`);
    }
    return lines.join("\n");
  });

  if (modified) writeFileSync(file, content);
}
