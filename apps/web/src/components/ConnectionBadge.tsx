import { useNow } from "../hooks/useNow.ts";
import { useAppState, useClient } from "../state/client.tsx";
import { cx } from "./ui.tsx";

/** Live / reconnecting / offline, always visible in the header. */
export function ConnectionBadge() {
  const connection = useAppState((state) => state.connection);
  const { socket } = useClient();
  const now = useNow(1000);

  const label =
    connection.status === "open"
      ? "live"
      : connection.status === "connecting"
        ? "connecting"
        : connection.status === "offline"
          ? "offline"
          : `reconnecting${connection.retryAt > now ? ` ${Math.ceil((connection.retryAt - now) / 1000)}s` : "…"}`;
  const tone =
    connection.status === "open"
      ? "bg-vitask-green"
      : connection.status === "offline"
        ? "bg-vitask-coral"
        : "bg-vitask-amber";

  return (
    <span className="flex items-center gap-2" role="status">
      <span
        className={cx(
          "font-vitask-mono text-vitask-text-tertiary inline-flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase",
        )}
        title={
          connection.status === "open"
            ? "Connected: changes arrive live"
            : "Changes will sync when the connection is back"
        }
      >
        <span aria-hidden="true" className={cx("inline-block size-1.5 rounded-full", tone)} />
        {label}
      </span>
      {connection.status === "reconnecting" ? (
        <button
          className="text-vitask-accent text-[11px] underline-offset-2 hover:underline"
          onClick={() => socket.retryNow()}
          type="button"
        >
          retry now
        </button>
      ) : null}
    </span>
  );
}
