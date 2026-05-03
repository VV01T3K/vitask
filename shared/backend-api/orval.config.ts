import { defineConfig } from "orval";

export default defineConfig({
  backend: {
    input: {
      target: "../../apps/backend/openapi/backend.json",
    },
    output: {
      target: "gen/endpoints",
      schemas: {
        path: "gen/model",
        type: "zod",
      },
      client: "react-query",
      mode: "tags",
      baseUrl: {
        runtime: "API_BASE_URL",
        imports: [{ name: "API_BASE_URL", importPath: "../../api-base" }],
      },
      clean: true,
      indexFiles: true,
      fileExtension: ".gen.ts",
      formatter: "oxfmt",
      override: {
        fetch: {
          forceSuccessResponse: true,
          runtimeValidation: true,
        },
        query: {
          useQuery: false,
          useMutation: true,
          useSuspenseQuery: true,
        },
      },
    },
    hooks: {
      afterAllFilesWrite: {
        command: "node " + new URL("fix-runtime-imports.mjs", import.meta.url).pathname,
        injectGeneratedDirsAndFiles: false,
      },
    },
  },
});
