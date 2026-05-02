import { createServerFn } from "@tanstack/react-start";

import { getSessionSnapshot } from "#/integrations/durable-streams/session.server";

export const getSessionSnapshotFn = createServerFn({ method: "GET" }).handler(() =>
  getSessionSnapshot(),
);
