import { t } from "@/i18n";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toolsApi } from "@/api/tools";
import { useAccountIdentity } from "@/api/companies-query";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ToolConnection } from "@paperclipai/shared";

export function ArcadeDiscoverySetup({ connection, onClose }: { connection: ToolConnection; onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [userId, setUserId] = useState("");
  const queries = useQueryClient();
  const { userId: viewingUserId, settled } = useAccountIdentity();
  const save = useMutation({ mutationFn: async () => {
      const result = await toolsApi.configureArcadeDiscovery(connection.id, { apiKey: apiKey.trim(), userId: userId.trim() });
      queries.setQueryData(queryKeys.tools.aggregatorApps(connection.id, viewingUserId), result);
    },
    onSuccess: onClose,
  });
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>{t("stability.23ac5c937740", { defaultValue: "Sync Arcade accounts" })}</DialogTitle>
      <DialogDescription>{t("stability.36795551b266", { defaultValue: "See apps available through “" })}{connection.name}{t("stability.04a2658d2baa", { defaultValue: "”. Your gateway works without account sync." })}</DialogDescription>
    </DialogHeader>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      <div className="space-y-2"><Label htmlFor="arcade-discovery-key">{t("stability.6bfda6e1d64d", { defaultValue: "Project API key" })}</Label>
        <p className="text-xs text-muted-foreground">{t("stability.4aaf49fcd2a0", { defaultValue: "Create a key in" })}{" "}<a className="underline" href="https://app.arcade.dev" target="_blank" rel="noopener noreferrer">{t("stability.df79c0f30f3a", { defaultValue: "Arcade" })}</a>{" "}{t("stability.807cb762b7b1", { defaultValue: "for the same project as this gateway. The key is stored securely and used only for account sync." })}</p>
        <Input id="arcade-discovery-key" type="password" autoComplete="off" required value={apiKey} onChange={event => setApiKey(event.target.value)} />
      </div>
      <div className="space-y-2"><Label htmlFor="arcade-discovery-user">{t("stability.d06ee405ceb6", { defaultValue: "Arcade user ID" })}</Label>
        <p className="text-xs text-muted-foreground">{t("stability.40f288af06d9", { defaultValue: "Use the end-user ID configured for this gateway’s sign-in. This may differ from your email address." })}</p>
        <Input id="arcade-discovery-user" autoComplete="off" required value={userId} onChange={event => setUserId(event.target.value)} />
      </div>
      {save.isError ? <p role="alert" className="text-sm text-destructive">{save.error instanceof Error ? save.error.message : t("stability.a3341ab863e4", { defaultValue: "Couldn’t save account sync. Try again." })}</p> : null}
      <DialogFooter className="sm:justify-between"><Button type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" disabled={!settled || save.isPending || !apiKey.trim() || !userId.trim()}>{save.isPending ? t("saving_56a228") : t("stability.61cc3801ba49", { defaultValue: "Save and sync" })}</Button>
      </DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
