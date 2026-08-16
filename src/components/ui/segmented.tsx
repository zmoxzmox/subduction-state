"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Accessible segmented control (radiogroup pattern). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  size = "md",
}: {
  options: Array<{ value: T; label: string; ariaLabel?: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex rounded-md border border-line bg-surface-3 p-0.5",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={selected}
            aria-label={opt.ariaLabel ?? opt.label}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-[5px] font-medium transition-colors",
              size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
              selected
                ? "bg-surface-2 text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                : "text-ink-3 hover:text-ink",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
