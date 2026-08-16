"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Globe2, Moon, Sun } from "lucide-react";
import { useI18n } from "@/i18n/provider";
import { useResearchConfig } from "@/research/config-context";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { useSyncExternalStore } from "react";

/** hydration-safe mounted flag (server snapshot false, client true) */
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function Header() {
  const { t, lang, setLang } = useI18n();
  const pathname = usePathname();
  const { isCustom } = useResearchConfig();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useMounted();

  const nav = [
    { href: "/", label: t("nav.map") },
    { href: "/compare", label: t("nav.compare") },
    { href: "/methodology", label: t("nav.methodology") },
    { href: "/data", label: t("nav.data") },
    { href: "/research", label: t("nav.research") },
  ];

  const cycleTheme = () => {
    const next =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-white"
      >
        {t("nav.skipToContent")}
      </a>
      <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-4 px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2"
          aria-label="Subduction State — home"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6 text-accent"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden
          >
            <path d="M2 15c3-1 5-3 8-3s5 2 8 1 3-2 4-4" strokeLinecap="round" />
            <path d="M2 19c3-1 5-3 8-3s5 2 8 1 3-2 4-4" strokeLinecap="round" opacity="0.45" />
            <path d="M7 4l3 5M12 3l2 6M17 4l1 6" strokeLinecap="round" opacity="0.8" />
          </svg>
          <div className="leading-none">
            <div className="text-[13px] font-bold tracking-[0.08em] text-ink uppercase">
              Subduction State
            </div>
            <div className="hidden text-[10px] text-ink-3 sm:block">
              {t("app.methodologyVersion")}
            </div>
          </div>
        </Link>

        <nav aria-label="Main" className="thin-scroll ml-2 flex flex-1 items-center gap-1 overflow-x-auto">
          {nav.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-accent-soft/50 text-accent-strong dark:text-accent"
                    : "text-ink-2 hover:bg-surface-3 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {isCustom && (
          <span className="hidden rounded border border-[color-mix(in_srgb,var(--viz-5)_40%,transparent)] bg-[color-mix(in_srgb,var(--viz-5)_10%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--viz-5)] md:inline">
            {t("research.customActive")}
          </span>
        )}

        <Segmented
          size="sm"
          ariaLabel={t("nav.language")}
          value={lang}
          onChange={setLang}
          options={[
            { value: "en", label: "EN" },
            { value: "es", label: "ES" },
          ]}
        />

        <button
          onClick={cycleTheme}
          aria-label={`${t("nav.theme")}: ${theme ?? "system"}`}
          title={`${t("nav.theme")}: ${
            theme === "light"
              ? t("nav.themeLight")
              : theme === "dark"
                ? t("nav.themeDark")
                : t("nav.themeSystem")
          }`}
          className="rounded-md p-1.5 text-ink-2 hover:bg-surface-3 hover:text-ink"
        >
          {mounted && resolvedTheme === "dark" ? (
            <Moon className="h-4 w-4" aria-hidden />
          ) : (
            <Sun className="h-4 w-4" aria-hidden />
          )}
          <span className="sr-only">
            <Globe2 className="hidden" aria-hidden />
          </span>
        </button>
      </div>
    </header>
  );
}
