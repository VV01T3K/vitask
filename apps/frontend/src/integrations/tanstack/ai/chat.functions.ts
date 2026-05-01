import { createServerFn } from "@tanstack/react-start";

import { getDemoChatSnapshot } from "#/integrations/durable-streams/chat.server";

export const getDemoChatSnapshotFn = createServerFn({
  method: "GET",
  strict: { output: false },
}).handler(() => getDemoChatSnapshot());
