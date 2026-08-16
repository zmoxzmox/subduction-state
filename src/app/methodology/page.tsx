"use client";

import { useI18n } from "@/i18n/provider";
import { translateList } from "@/i18n";
import { CANONICAL_WEIGHTS, METRIC_IDS } from "@/scoring/weights";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPRESSION_ANCHORS } from "@/scoring/quiescence";
import { GNSS_Z_ANCHORS } from "@/scoring/gnss";
import { ACTIVATION_ANCHORS } from "@/scoring/activation";

export default function MethodologyPage() {
  const { t, lang } = useI18n();

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {t("methodology.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          {t("methodology.intro")}
        </p>
        <p className="mt-1 text-[11px] text-ink-3">{t("app.methodologyVersion")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("methodology.what.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2 text-sm leading-relaxed text-ink-2">
          <p>{t("methodology.what.body")}</p>
          <p>{t("methodology.what.structural")}</p>
        </CardBody>
      </Card>

      <Card className="border-[color-mix(in_srgb,var(--status-critical)_30%,transparent)]">
        <CardHeader>
          <CardTitle>{t("methodology.not.title")}</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-ink-2">
            {translateList(lang, "methodology.not.items").map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("methodology.weights.title")}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-3 text-xs leading-relaxed text-ink-3">
            {t("methodology.weights.note")}
          </p>
          <table className="w-full text-xs">
            <tbody>
              {METRIC_IDS.map((id) => (
                <tr key={id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 text-ink">{t(`metrics.${id}.fullName`)}</td>
                  <td className="py-2 pr-3 flex-1 text-[11px] leading-snug text-ink-3">
                    {t(`metrics.${id}.description`)}
                  </td>
                  <td className="w-14 py-2 text-right font-semibold text-ink tnum">
                    {CANONICAL_WEIGHTS[id]}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-line-2 font-semibold">
                <td className="py-2 text-ink" colSpan={2}>
                  Σ
                </td>
                <td className="py-2 text-right text-ink tnum">
                  {METRIC_IDS.reduce((s, id) => s + CANONICAL_WEIGHTS[id], 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("methodology.math.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-2">
          {(
            [
              "knownContribution",
              "observed",
              "range",
              "neutral",
              "coverage",
            ] as const
          ).map((k) => (
            <p key={k} className="rounded-md bg-surface-3/60 px-3 py-1.5 font-mono text-[11px] text-ink-2">
              {t(`methodology.math.${k}`)}
            </p>
          ))}
          <p className="pt-1 text-[11px] leading-relaxed text-ink-3">
            {t("methodology.math.note")}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("methodology.missing.title")}</CardTitle>
        </CardHeader>
        <CardBody className="text-sm leading-relaxed text-ink-2">
          {t("methodology.missing.body")}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("methodology.comparison.title")}</CardTitle>
        </CardHeader>
        <CardBody className="text-sm leading-relaxed text-ink-2">
          {t("methodology.comparison.body")}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("methodology.correlation.title")}</CardTitle>
        </CardHeader>
        <CardBody className="text-sm leading-relaxed text-ink-2">
          {t("methodology.correlation.body")}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("methodology.declustering.title")}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm leading-relaxed text-ink-2">
          {t("methodology.declustering.body")}
          <div className="grid gap-3 sm:grid-cols-3">
            <AnchorTable
              title={t("metrics.recentQuiescence.name")}
              rows={SUPPRESSION_ANCHORS.map(
                ([s, v]) => [`${Math.round(s * 100)}%`, `${v}`] as const,
              )}
            />
            <AnchorTable
              title={t("metrics.interfaceActivation.name")}
              rows={ACTIVATION_ANCHORS.slice(1).map(
                ([p, v]) => [`p${p}`, `${v}`] as const,
              )}
            />
            <AnchorTable
              title={t("metrics.gnssTransient.name")}
              rows={GNSS_Z_ANCHORS.map(([z, v]) => [`z = ${z}`, `${v}`] as const)}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("methodology.provenance.title")}</CardTitle>
        </CardHeader>
        <CardBody className="text-sm leading-relaxed text-ink-2">
          {t("methodology.provenance.body")}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("methodology.future.title")}</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-ink-2">
            {translateList(lang, "methodology.future.items").map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function AnchorTable({
  title,
  rows,
}: {
  title: string;
  rows: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-2 p-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
        {title}
      </div>
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="text-ink-2">
              <td className="py-0.5 pr-2 tnum">{r[0]}</td>
              <td className="py-0.5 text-right tnum">→ {r[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
