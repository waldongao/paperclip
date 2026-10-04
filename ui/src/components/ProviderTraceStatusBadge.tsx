import { i18n } from "@/i18n";
import { t } from "@/i18n";
import type { ProviderTraceMetadata } from "@paperclipai/shared";
import { Bug, CircleOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

export function runRequestedProviderTrace(
  contextSnapshot: Record<string, unknown> | null | undefined,
) {
  if (!contextSnapshot) return false;
  const debug = contextSnapshot.debug;
  return (
    typeof debug === "object" &&
    debug !== null &&
    !Array.isArray(debug) &&
    (debug as Record<string, unknown>).providerTrace === "raw"
  );
}

export function ProviderTraceStatusBadge({
  trace,
  requested = false,
  showOff = false,
  className,
}: {
  trace?: ProviderTraceMetadata | null;
  requested?: boolean;
  showOff?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const status = trace?.status;
  const expired = trace
    ? new Date(trace.expiresAt).getTime() <= Date.now()
    : false;
  const label = expired
    ? t("trace_expired")
    : status === "capturing"
      ? t("raw_tracing_enabled")
      : status === "complete"
        ? t("trace_captured")
        : status === "incomplete"
          ? t("trace_incomplete")
          : status === "truncated"
            ? t("trace_truncated")
            : status === "expired"
              ? t("trace_expired")
              : status === "deleted"
                ? t("trace_deleted")
                : requested
                  ? t("trace_requested")
                  : showOff
                    ? t("trace_off")
                    : null;
  if (!label) return null;
  const warning =
    status === "incomplete" ||
    status === "truncated" ||
    status === "expired" ||
    status === "deleted" ||
    expired;
  const isOff = !trace && !requested && showOff;
  const Icon = isOff ? CircleOff : Bug;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-(length:--text-micro) font-medium",
        isOff || status === "deleted" || status === "expired" || expired
          ? "border-border bg-background text-muted-foreground"
          : warning
            ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
            : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
        className,
      )}
      title={
        trace
          ? t("zhComponents.message_f2c0a2fbb3", { value1: trace.frameCount, value2: trace.byteCount, value3: new Date(trace.expiresAt).toLocaleString(i18n.resolvedLanguage ?? i18n.language) })
          : requested
            ? t("this_run_requested_sensitive_provider_frame_capt")
            : t("raw_provider_frame_capture_was_disabled_for_this")
      }
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
