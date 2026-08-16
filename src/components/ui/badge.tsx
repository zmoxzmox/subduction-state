import * as React from "react";
import { cn } from "@/lib/utils";
import type { MetricStatus } from "@/types";

/**
 * Evidence badges — part of the app's visual language. Status badges
 * always pair color with a label (never color alone).
 */

const badgeStyles: Record<string, string> = {
  live: "bg-[color-mix(in_srgb,var(--viz-1)_14%,transparent)] text-[var(--viz-1)] border-[color-mix(in_srgb,var(--viz-1)_30%,transparent)]",
  derived:
    "bg-[color-mix(in_srgb,var(--viz-7)_12%,transparent)] text-[var(--viz-7)] border-[color-mix(in_srgb,var(--viz-7)_30%,transparent)]",
  curated:
    "bg-[color-mix(in_srgb,var(--viz-4)_16%,transparent)] text-[color-mix(in_srgb,var(--viz-4)_80%,var(--ink))] border-[color-mix(in_srgb,var(--viz-4)_35%,transparent)]",
  experimental:
    "bg-[color-mix(in_srgb,var(--viz-5)_14%,transparent)] text-[var(--viz-5)] border-[color-mix(in_srgb,var(--viz-5)_30%,transparent)]",
  missing: "bg-surface-3 text-ink-3 border-line-2",
  stale: "bg-[color-mix(in_srgb,var(--viz-2)_14%,transparent)] text-[var(--viz-2)] border-[color-mix(in_srgb,var(--viz-2)_32%,transparent)]",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: MetricStatus | "stale";
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider",
        badgeStyles[status] ?? badgeStyles.missing,
        className,
      )}
    >
      {status === "missing" && (
        <span aria-hidden className="text-ink-3">
          ◌
        </span>
      )}
      {label}
    </span>
  );
}

export function Badge({
  className,
  tone = "neutral",
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "good" | "warning" | "serious" | "critical";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface-3 text-ink-2 border-line-2",
    accent: "bg-accent-soft/40 text-accent-strong dark:text-accent border-accent/30",
    good: "bg-[color-mix(in_srgb,var(--status-good)_14%,transparent)] text-[var(--status-good)] border-[color-mix(in_srgb,var(--status-good)_35%,transparent)]",
    warning:
      "bg-[color-mix(in_srgb,var(--status-warning)_16%,transparent)] text-[color-mix(in_srgb,var(--status-warning)_75%,var(--ink))] border-[color-mix(in_srgb,var(--status-warning)_40%,transparent)]",
    serious:
      "bg-[color-mix(in_srgb,var(--status-serious)_14%,transparent)] text-[var(--status-serious)] border-[color-mix(in_srgb,var(--status-serious)_32%,transparent)]",
    critical:
      "bg-[color-mix(in_srgb,var(--status-critical)_14%,transparent)] text-[var(--status-critical)] border-[color-mix(in_srgb,var(--status-critical)_35%,transparent)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wider",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
