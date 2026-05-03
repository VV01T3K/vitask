import { createServerFn } from "@tanstack/react-start";

import { getSessionSnapshot } from "./session.server";

export const getSessionSnapshotFn = createServerFn({ method: "GET" }).handler(() =>
  getSessionSnapshot(),
);
