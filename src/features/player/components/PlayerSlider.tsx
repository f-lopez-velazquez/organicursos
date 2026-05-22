import { useRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

interface PlayerSliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  onValueCommit?: (value: number) => void;
  valueText?: string;
}

export function PlayerSlider({
  className,
  disabled,
  label,
  max = 100,
  min = 0,
  onBlur,
  onKeyUp,
  onMouseUp,
  onTouchEnd,
  onValueChange,
  onValueCommit,
  step = 1,
  value,
  valueText,
  ...props
}: PlayerSliderProps) {
  const range = Number(max) - Number(min);
  const fillPercent = range > 0 ? Math.max(0, Math.min(100, ((value - Number(min)) / range) * 100)) : 0;
  const pointerActiveRef = useRef(false);

  const commitValue = (rawValue: string) => {
    onValueCommit?.(Number(rawValue));
  };

  return (
    <label className={cn("block", className)}>
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
        <span>{label}</span>
        {valueText ? <span className="text-slate-400">{valueText}</span> : null}
      </div>
      <input
        {...props}
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        className={cn(
          "player-slider mt-2 h-6 w-full cursor-pointer appearance-none rounded-full bg-transparent disabled:cursor-not-allowed disabled:opacity-50",
        )}
        style={{
          background: `linear-gradient(90deg, rgba(91,214,190,0.96) 0%, rgba(79,156,255,0.96) ${fillPercent}%, rgba(255,255,255,0.12) ${fillPercent}%, rgba(255,255,255,0.12) 100%)`,
        }}
        onPointerDown={() => {
          pointerActiveRef.current = true;
        }}
        onPointerUp={(event) => {
          pointerActiveRef.current = false;
          commitValue(event.currentTarget.value);
        }}
        onChange={(event) => {
          onValueChange(Number(event.currentTarget.value));
          if (!pointerActiveRef.current) {
            commitValue(event.currentTarget.value);
          }
        }}
        onMouseUp={(event) => {
          commitValue(event.currentTarget.value);
          onMouseUp?.(event);
        }}
        onTouchEnd={(event) => {
          pointerActiveRef.current = false;
          commitValue(event.currentTarget.value);
          onTouchEnd?.(event);
        }}
        onKeyUp={(event) => {
          commitValue(event.currentTarget.value);
          onKeyUp?.(event);
        }}
        onBlur={(event) => {
          pointerActiveRef.current = false;
          commitValue(event.currentTarget.value);
          onBlur?.(event);
        }}
      />
    </label>
  );
}
