import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  value: string;
  hint: string;
  className?: string;
}

export function StatCard({ label, value, hint, className }: StatCardProps) {
  return (
    <div className={cn("glass-panel min-w-0 p-5", className)}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-3 truncate text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{hint}</p>
    </div>
  );
}
