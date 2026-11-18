import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

/** Better Auth on the Worker (`/api/auth`): passkeys. The session lives in httpOnly cookies. */
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  plugins: [passkeyClient()],
});

/**
 * Which workspace the app shows depends on who is signed in, so after signing in or out the page starts over: the
 * snapshot and the WebSocket then belong to the new workspace.
 */
export function reloadWorkspace(): void {
  window.location.assign("/dashboard");
}
