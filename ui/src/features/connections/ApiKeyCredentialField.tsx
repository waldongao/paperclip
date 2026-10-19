import { t } from "@/i18n";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Providers supply only credentials the current user is authorized to use.
 * Values are opaque connection references, never secret values. */
export function ApiKeyCredentialField({ options, connectionId, onConnectionChange, value, onChange,
  disabled, loading, error, providerName, keysUrl, label = "API key" }: {
  options: { id: string; label: string; disabled?: boolean }[];
  connectionId: string | null;
  onConnectionChange(id: string): void;
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  providerName: string;
  keysUrl: string;
  label?: string;
}) {
  const id = useId();
  const choices = connectionId && !options.some(option => option.id === connectionId)
    ? [{ id: connectionId, label: loading ? "Checking saved API key…" : "Previously selected key · unavailable", disabled: true }, ...options] : options;
  return <div className="space-y-2">
    <Label htmlFor={id}>{label}</Label>
    {choices.length > 0 && <select id={id} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      value={connectionId ?? ""} disabled={disabled} onChange={event => onConnectionChange(event.target.value)}>
      {choices.map(option => <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>)}
      <option value="">{t("stability.9b6cc5e19d07", { defaultValue: "Enter a new API key" })}</option>
    </select>}
    {!connectionId && <Input id={choices.length ? `${id}-new` : id} aria-label={choices.length ? t("stability.e520a082286b", { defaultValue: "New API key" }) : undefined}
      type="password" autoComplete="off" value={value} disabled={disabled}
      onChange={event => { onConnectionChange(""); onChange(event.target.value); }} placeholder={t("stability.e5b2daad2984", { value1: providerName, defaultValue: "Paste your {{value1}} API key" })} />}
    {loading && <p role="status" className="text-sm text-muted-foreground">{t("stability.b34650f62297", { defaultValue: "Checking saved API keys…" })}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{t("stability.ca7e37d86596", { defaultValue: "Could not load saved API keys." })}{" "}{error}</p>}
    <a href={keysUrl} target="_blank" rel="noreferrer" className="text-sm underline">{t("stability.13c7b2e12cdd", { defaultValue: "Get an" })}{" "}{providerName}{" "}{t("stability.bdf02cf0dbd1", { defaultValue: "API key ↗" })}</a>
  </div>;
}
