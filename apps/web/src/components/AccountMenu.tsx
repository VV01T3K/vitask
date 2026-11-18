import { CloudUpload, KeyRound, Loader2, LogOut, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";

import { authClient, reloadWorkspace } from "../state/auth.ts";
import { buttonClass, cx, ErrorText, useDialogFocus } from "./ui.tsx";

type Busy = "create" | "sign-in" | "add" | "sign-out" | null;
type AuthResult = { error: { message?: string; code?: string } | null };

function MenuButton({
  icon,
  busy,
  children,
  onClick,
  variant = "secondary",
  disabled,
}: {
  icon: ReactNode;
  busy: boolean;
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
  disabled: boolean;
}) {
  return (
    <button
      aria-busy={busy}
      className={cx(buttonClass[variant], "w-full justify-start")}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {busy ? <Loader2 aria-hidden="true" className="animate-spin" size={14} /> : icon}
      {children}
    </button>
  );
}

/** The header's account control: save the anonymous workspace to an account, or manage the signed-in one. */
export function AccountMenu() {
  const session = authClient.useSession();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const user = session.data?.user;
  if (session.isPending && !session.data) return null;

  return (
    <div className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cx(
          "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors",
          user
            ? "border-vitask-border bg-vitask-surface text-vitask-text-secondary hover:border-vitask-border-bright hover:bg-vitask-elevated hover:text-vitask-text-primary"
            : "border-vitask-accent/40 bg-vitask-accent/15 text-vitask-accent hover:border-vitask-accent hover:bg-vitask-accent/25",
        )}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        {user ? (
          <UserRound aria-hidden="true" size={14} />
        ) : (
          <CloudUpload aria-hidden="true" size={14} />
        )}
        <span className={user ? "sr-only sm:not-sr-only" : undefined}>
          {user ? "Account" : "Save workspace"}
        </span>
      </button>
      {open ? (
        <AccountPanel
          onClose={() => setOpen(false)}
          signedIn={user !== undefined}
          triggerRef={triggerRef}
        />
      ) : null}
    </div>
  );
}

function AccountPanel({
  signedIn,
  onClose,
  triggerRef,
}: {
  signedIn: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const panel = useDialogFocus(onClose);
  const titleId = useId();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  // A click outside closes the panel (the trigger toggles it itself).
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [onClose, panel, triggerRef]);

  async function run(
    kind: Exclude<Busy, null>,
    action: () => Promise<AuthResult>,
    after?: () => void,
  ) {
    setBusy(kind);
    setError(null);
    try {
      const result = await action();
      if (result.error) {
        setError(result.error.message || "That did not work. Try again.");
        return;
      }
      after?.();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <div
      aria-labelledby={titleId}
      className="bg-vitask-surface border-vitask-border-bright fixed inset-x-4 top-[60px] z-[90] rounded-lg border p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] sm:absolute sm:inset-x-auto sm:top-[calc(100%+8px)] sm:right-0 sm:w-[340px]"
      ref={panel}
      role="dialog"
    >
      {signedIn ? (
        <div className="flex flex-col gap-3">
          <div>
            <h2
              className="font-vitask-mono text-vitask-text-primary text-sm font-medium tracking-[-0.01em]"
              id={titleId}
            >
              Signed in
            </h2>
            <p className="text-vitask-text-tertiary mt-1 text-xs leading-relaxed">
              Your workspace is saved to your account. Sign in with your passkey on any device that
              has it to open it here.
            </p>
          </div>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <MenuButton
            busy={busy === "add"}
            disabled={disabled}
            icon={<KeyRound aria-hidden="true" size={14} />}
            onClick={() =>
              void run(
                "add",
                () => authClient.passkey.addPasskey({ name: "vitask" }),
                () => toast.success("Passkey added. You can sign in with it now."),
              )
            }
          >
            Add a passkey
          </MenuButton>
          <MenuButton
            busy={busy === "sign-out"}
            disabled={disabled}
            icon={<LogOut aria-hidden="true" size={14} />}
            onClick={() => void run("sign-out", () => authClient.signOut(), reloadWorkspace)}
          >
            Sign out
          </MenuButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <h2
              className="font-vitask-mono text-vitask-text-primary text-sm font-medium tracking-[-0.01em]"
              id={titleId}
            >
              Save your workspace
            </h2>
            <p className="text-vitask-text-tertiary mt-1 text-xs leading-relaxed">
              Right now your tasks live in this browser only. Create an account to keep them and
              open them on any device. Everything here comes with you.
            </p>
          </div>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <MenuButton
            busy={busy === "create"}
            disabled={disabled}
            icon={<KeyRound aria-hidden="true" size={14} />}
            onClick={() =>
              void run(
                "create",
                () => authClient.passkey.addPasskey({ name: "vitask", createSession: true }),
                () => toast.success("Workspace saved to your new account."),
              )
            }
            variant="primary"
          >
            Create account with a passkey
          </MenuButton>
          <div className="border-vitask-border mt-1 flex flex-col gap-2 border-t pt-3">
            <p className="text-vitask-text-secondary text-[13px] font-medium">
              Already have an account?
            </p>
            <MenuButton
              busy={busy === "sign-in"}
              disabled={disabled}
              icon={<KeyRound aria-hidden="true" size={14} />}
              onClick={() =>
                void run("sign-in", () => authClient.signIn.passkey(), reloadWorkspace)
              }
            >
              Sign in with a passkey
            </MenuButton>
            <p className="text-vitask-text-tertiary text-xs leading-relaxed">
              Signing in opens your account&apos;s workspace. What&apos;s here now stays in this
              browser and is not merged into it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
