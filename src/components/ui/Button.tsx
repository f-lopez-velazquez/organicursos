import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-atlas-500 text-white shadow-lg shadow-atlas-900/25 hover:bg-atlas-400 hover:shadow-[0_18px_48px_rgba(42,91,180,0.35)] focus-visible:ring-atlas-300",
  secondary:
    "border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:shadow-[0_14px_36px_rgba(0,0,0,0.18)] focus-visible:ring-white/20",
  ghost: "text-slate-200 hover:bg-white/5 focus-visible:ring-white/15",
};

export function Button({
  children,
  className,
  loading = false,
  variant = "primary",
  type = "button",
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      type={type}
      disabled={loading || props.disabled}
      className={cn(
        "interactive-lift inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 active:scale-[0.985] disabled:cursor-wait disabled:opacity-80",
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
}
