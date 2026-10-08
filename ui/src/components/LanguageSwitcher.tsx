import { useState } from "react";
import { Check, Languages } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useLocale, useTranslation } from "@/i18n";
import { localeLabel } from "@/i18n/locales";

type LanguageSwitcherVariant = "select" | "menu-action";

interface LanguageSwitcherProps {
  className?: string;
  /** Applied to the dropdown trigger so a `<Label htmlFor>` can target it. */
  id?: string;
  /**
   * `select` (default): labelled dropdown — for settings pages and any form-like
   * surface.
   *
   * `menu-action`: full-width disclosure row matching the surrounding
   * `MenuAction` rows in `SidebarAccountMenu`. It expands in place rather than
   * opening a dropdown so no portal is nested inside the account popover.
   */
  variant?: LanguageSwitcherVariant;
  /** Called after the locale changes, so a popover can dismiss itself. */
  onAfterChange?: () => void;
}

/**
 * Canonical language picker. Both the account menu and profile settings render
 * through this component so the option list and switch behaviour stay in sync.
 */
export function LanguageSwitcher({ className, id, variant = "select", onAfterChange }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const { locale, setLocale, availableLocales } = useLocale();
  const [expanded, setExpanded] = useState(false);

  function handleSelect(next: string) {
    if (next !== locale && !setLocale(next)) return;
    setExpanded(false);
    onAfterChange?.();
  }

  if (variant === "menu-action") {
    return (
      <div className={className}>
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent/60"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-label={t("settings.language.change", { defaultValue: "Change language" })}
        >
          <span className="mt-0.5 rounded-lg border border-border bg-background/70 p-2 text-muted-foreground">
            <Languages className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              {t("settings.language.label", { defaultValue: "Language" })}
            </span>
            <span className="block text-xs text-muted-foreground">{localeLabel(locale)}</span>
          </span>
        </button>
        {expanded ? (
          <ul className="mt-1 space-y-0.5 pl-12 pr-3 pb-2">
            {availableLocales.map((option) => (
              <li key={option}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent/60",
                    option === locale ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                  onClick={() => handleSelect(option)}
                  aria-current={option === locale}
                >
                  <span className="min-w-0 truncate">{localeLabel(option)}</span>
                  {option === locale ? <Check className="size-4 shrink-0" /> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <Select value={locale} onValueChange={handleSelect}>
      <SelectTrigger id={id} className={cn("w-full", className)} aria-label={t("settings.language.label", { defaultValue: "Language" })}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {availableLocales.map((option) => (
          <SelectItem key={option} value={option}>
            {localeLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
