"use client";

import { useI18n } from "@/i18n/provider";
import { translateList } from "@/i18n";
import { useDataHealth } from "@/lib/queries";
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import type { DataHealth } from "@/types";

export default function DataPage() {
  const { t, lang, formatDate, formatTime } = useI18n();
  const { data, isPending } = useDataHealth();

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {t("data.title")}
        </h1>
        <p className="mt-1 text-xs text-ink-3">{t("data.subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("data.title")}</CardTitle>
          {data && (
            <span className="text-[11px] text-ink-3 tnum">
              {t("common.observed")} {formatTime(data.checkedAt)}
            </span>
          )}
        </CardHeader>
        <CardBody className="p-0">
          {isPending ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <div className="thin-scroll overflow-x-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-3">
                    <th className="px-4 py-2 font-medium">{t("data.table.source")}</th>
                    <th className="px-2 py-2 font-medium">{t("data.table.status")}</th>
                    <th className="px-2 py-2 font-medium">{t("data.table.mode")}</th>
                    <th className="px-2 py-2 font-medium">{t("data.table.lastFetch")}</th>
                    <th className="px-2 py-2 font-medium">{t("data.table.latestObservation")}</th>
                    <th className="px-2 py-2 font-medium">{t("data.table.cache")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.health ?? []).map((h: DataHealth) => (
                    <tr key={h.source} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 text-ink">
                        {h.source}
                        {h.message && (
                          <span className="block text-[10px] leading-snug text-ink-3">
                            {h.message}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <StatusCell status={h.status} label={t(`data.status.${h.status}`)} />
                      </td>
                      <td className="px-2 py-2 text-ink-3">
                        {h.mode === "fixture" ? (
                          <Badge tone="warning">{t("common.fixtureData")}</Badge>
                        ) : (
                          h.mode
                        )}
                      </td>
                      <td className="px-2 py-2 text-ink-3 tnum">
                        {h.lastFetch ? formatTime(h.lastFetch) : "—"}
                      </td>
                      <td className="px-2 py-2 text-ink-3 tnum">
                        {h.latestObservation ? formatDate(h.latestObservation) : "—"}
                      </td>
                      <td className="px-2 py-2 text-ink-3">
                        {data?.policies.find((p) => p.source === h.source)?.cache ?? "—"}
                      </td>
                    </tr>
                  ))}
                  {data?.policies
                    .filter((p) => !(data.health ?? []).some((h) => h.source === p.source))
                    .map((p) => (
                      <tr key={p.source} className="border-b border-line last:border-0">
                        <td className="px-4 py-2 text-ink">{p.source}</td>
                        <td className="px-2 py-2" colSpan={2}>
                          <StatusCell status="unknown" label={t("data.status.unknown")} />
                        </td>
                        <td className="px-2 py-2 text-ink-3">—</td>
                        <td className="px-2 py-2 text-ink-3">—</td>
                        <td className="px-2 py-2 text-ink-3">{p.cache}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{t("data.attributionTitle")}</CardTitle>
            <CardDescription className="mt-0.5">{t("data.gemNote")}</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <ul className="space-y-1 text-xs leading-relaxed text-ink-2">
            {translateList(lang, "data.attribution").map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function StatusCell({ status, label }: { status: string; label: string }) {
  const icons: Record<string, React.ReactNode> = {
    healthy: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />,
    stale: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
    failed: <XCircle className="h-3.5 w-3.5" aria-hidden />,
    unknown: <HelpCircle className="h-3.5 w-3.5" aria-hidden />,
  };
  const tones: Record<string, "good" | "warning" | "critical" | "neutral"> = {
    healthy: "good",
    stale: "warning",
    failed: "critical",
    unknown: "neutral",
  };
  return (
    <Badge tone={tones[status] ?? "neutral"}>
      {icons[status]}
      {label}
    </Badge>
  );
}
