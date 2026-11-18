import { Sparkle, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function AiBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "font-vitask-mono border-vitask-teal/40 bg-vitask-teal/15 text-vitask-teal inline-flex shrink-0 items-center gap-[3px] rounded-[3px] border px-[5px] py-[1px] text-[11px] leading-tight tracking-[0.06em] not-italic",
        className,
      )}
    >
      <Sparkle aria-hidden="true" size={10} strokeWidth={2.25} />
      AI
    </span>
  );
}

export function SectionLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      className="text-vitask-text-tertiary text-[11px] font-medium tracking-[0.08em] uppercase"
      id={id}
    >
      {children}
    </h2>
  );
}

export function Cursor() {
  return (
    <span aria-hidden="true" className="animate-vitask-blink ml-0.5 inline-block">
      ▍
    </span>
  );
}

export const buttonClass = {
  primary:
    "bg-vitask-accent/15 border-vitask-accent/40 hover:bg-vitask-accent/25 hover:border-vitask-accent text-vitask-accent inline-flex items-center justify-center gap-2 rounded border px-4 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "border-vitask-border text-vitask-text-secondary hover:border-vitask-border-bright hover:text-vitask-text-primary inline-flex items-center justify-center gap-2 rounded border bg-transparent px-4 py-2 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-50",
  icon: "text-vitask-text-secondary hover:text-vitask-text-primary hover:bg-vitask-elevated inline-flex size-8 items-center justify-center rounded border border-transparent transition",
};

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p
      className="border-vitask-coral/30 bg-vitask-coral/10 text-vitask-coral rounded border px-3 py-2 text-xs"
      role="alert"
    >
      {children}
    </p>
  );
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `container`, closes on Escape and gives focus back to the opener on unmount. */
export function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const container = ref.current;
    if (container && !container.contains(document.activeElement)) {
      (
        container.querySelector<HTMLElement>("[autofocus]") ??
        container.querySelector<HTMLElement>(FOCUSABLE)
      )?.focus();
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);
  return ref;
}

export function ModalHeader({
  title,
  id,
  onClose,
}: {
  title: ReactNode;
  id: string;
  onClose: () => void;
}) {
  return (
    <div className="border-vitask-border flex items-center justify-between border-b px-5 py-4">
      <h2
        className="font-vitask-mono text-vitask-text-primary text-sm font-medium tracking-[-0.01em]"
        id={id}
      >
        {title}
      </h2>
      <button aria-label="Close" className={buttonClass.icon} onClick={onClose} type="button">
        <X aria-hidden="true" size={16} />
      </button>
    </div>
  );
}
