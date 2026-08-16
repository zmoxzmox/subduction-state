"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Styled native select — reliable accessibility for free. */
export function Select({
  className,
  children,
  ariaLabel,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { ariaLabel: string }) {
  return (
    <select
      aria-label={ariaLabel}
      className={cn(
        "h-8 rounded-md border border-line-2 bg-surface px-2 text-xs text-ink",
        "focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2">
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-line-2 bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
      <span className="text-xs text-ink-2">{label}</span>
    </label>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  id,
  formatValue,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  id: string;
  formatValue?: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3
          [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-surface
          [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow"
      />
      <span className="w-12 text-right text-xs font-medium text-ink tnum">
        {formatValue ? formatValue(value) : value}
      </span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded bg-surface-3", className)}
      aria-hidden
    />
  );
}

export function Tooltip({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 w-max max-w-56 -translate-x-1/2",
          "rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] leading-snug text-ink-2 shadow-lg",
          "opacity-0 transition-opacity group-hover/tooltip:opacity-100",
          "group-focus-within/tooltip:opacity-100",
        )}
      >
        {content}
      </span>
    </span>
  );
}
