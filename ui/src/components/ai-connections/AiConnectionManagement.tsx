import { t } from "@/i18n";
import { Button } from "@/components/ui/button";

export function AiConnectionLegacyNotice({
  onAdopt,
  readOnly = false,
}: {
  onAdopt: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">{t("stability.c836e59bd188", { defaultValue: "Existing authentication — not managed by Connections" })}</h3>
      <p className="text-sm text-muted-foreground">{t("stability.c88eb326a567", { defaultValue: "This agent keeps its current authentication until you choose and test a managed connection. Confirm the account and who may use it before adopting." })}</p>
      {!readOnly && (
        <Button variant="outline" className="self-start" onClick={onAdopt}>{t("stability.7efd0256f59b", { defaultValue: "Choose a managed connection" })}</Button>
      )}
    </div>
  );
}
