import { cn } from "@/lib/utils/cn";

interface BadgeProps {
  children: string;
  tone?: "default" | "success" | "warning";
}

const tones = {
  default: "bg-white/10 text-slate-200",
  success: "bg-emerald-400/12 text-emerald-200",
  warning: "bg-amber-300/12 text-amber-100",
};

export function Badge({ children, tone = "default" }: BadgeProps) {
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}
