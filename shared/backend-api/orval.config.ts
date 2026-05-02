import { defineConfig } from "orval";

export default defineConfig({
  backend: {
    input: {
      target: "../../apps/backend/openapi/schema.json",
    },
    output: {
      target: "gen/endpoints",
      schemas: {
        path: "gen/model",
        type: "zod",
      },
      client: "react-query",
      mode: "tags",
      baseUrl: "http://localhost:5107",
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
