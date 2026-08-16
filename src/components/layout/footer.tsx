"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { translateList } from "@/i18n";

export function DisclaimerBar() {
  const { t } = useI18n();
  return (
    <div className="border-b border-line bg-surface-3/60">
      <div className="mx-auto flex max-w-[1600px] items-start gap-2 px-4 py-1.5">
        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-ink-3" aria-hidden />
        <p className="text-[11px] leading-snug text-ink-2">{t("app.disclaimer")}</p>
      </div>
    </div>
  );
}

export function Footer() {
  const { t, lang } = useI18n();
  return (
    <footer className="mt-8 border-t border-line bg-surface">
      <div className="mx-auto max-w-[1600px] px-4 py-6">
        <p className="text-[11px] font-medium text-ink-2">{t("app.disclaimer")}</p>
        <p className="mt-2 text-[11px] text-ink-3">
          {t("footer.builtAs")} · {t("footer.notPrediction")}
        </p>
        <div className="mt-4 grid gap-1 border-t border-line pt-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            {t("data.attributionTitle")}
          </h2>
          <ul className="grid gap-x-6 gap-y-0.5 text-[11px] text-ink-3 sm:grid-cols-2">
            {translateList(lang, "data.attribution").map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex items-center gap-4 text-[11px] text-ink-3">
          <Link href="/methodology" className="hover:text-ink-2">
            {t("nav.methodology")}
          </Link>
          <Link href="/data" className="hover:text-ink-2">
            {t("nav.data")}
          </Link>
          <span>{t("app.methodologyVersion")}</span>
        </div>
      </div>
    </footer>
  );
}
