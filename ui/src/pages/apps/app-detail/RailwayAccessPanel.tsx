import { t } from "@/i18n";
import { useEffect, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConfigureRailwaySsh, ConnectionGrantsResponse, RailwaySshSetup, ToolConnection } from "@paperclipai/shared";
import { toolsApi } from "@/api/tools";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function RailwayAccessPanel({ connection, grants }: { connection: ToolConnection; grants?: ConnectionGrantsResponse }) {
  const queryClient = useQueryClient();
  const id = useId();
  const setup = connection.config?.railwaySsh as RailwaySshSetup | null | undefined;
  const owned = (grants?.grants ?? []).filter((grant) => grant.kind !== "user" || grant.subjectUserId === grants?.currentUserId);
  const eligible = owned.filter((grant) => grant.status === "active");
  const [selectedGrant, setSelectedGrant] = useState("");
  const [knownHosts, setKnownHosts] = useState(setup?.knownHosts ?? "");
  useEffect(() => { setKnownHosts(setup?.knownHosts ?? ""); }, [setup?.knownHosts]);
  const grantId = setup?.grantId ?? (selectedGrant || eligible[0]?.id);
  const canConfigure = grants?.capabilities.canConfigure && connection.status === "active" && eligible.some((grant) => grant.id === grantId);
  const canRemove = grants?.capabilities.canConfigure && owned.some((grant) => grant.id === setup?.grantId);
  const mutation = useMutation({
    mutationFn: (input: ConfigureRailwaySsh) => toolsApi.configureRailwaySsh(connection.id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tools.connection(connection.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.tools.connectionGrants(connection.id) });
    },
  });
  return <section className="space-y-4" aria-labelledby={`${id}-title`}>
    <div className="space-y-2">
      <h2 id={`${id}-title`} className="text-lg font-semibold">{t("stability.b60e1bb15d4f", { defaultValue: "Railway operations" })}</h2>
      <p className="text-sm text-muted-foreground">
        {typeof connection.config?.railwayApiMessage === "string" ? connection.config?.railwayApiMessage : t("stability.9155fa8241da", { defaultValue: "Refresh actions after connecting to check service, log, and deployment access." })}
      </p>
    </div>
    <div className="space-y-2">
      <h3 className="font-medium">{t("stability.c77387d45b51", { defaultValue: "Container access" })}</h3>
      <p className="text-sm text-muted-foreground">{t("stability.288d71ed9c94", { defaultValue: "To allow Paperclip direct SSH access to Railway containers, you can optionally generate an SSH key pair." })}{" "}<a className="underline" href="https://docs.railway.com/cli/ssh" target="_blank" rel="noreferrer">{t("stability.b6144c820c19", { defaultValue: "Railway SSH documentation" })}</a></p>
    </div>
    {!canConfigure && <p className="text-sm text-muted-foreground">{t("stability.cd2c32b454f7", { defaultValue: "The connection manager and authorization owner can configure container access." })}</p>}
    {(canConfigure || canRemove) && grantId && <>
      {!setup && eligible.length > 1 && <div className="space-y-2">
        <Label htmlFor={`${id}-grant`}>{t("authorization")}</Label>
        <select id={`${id}-grant`} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={grantId} onChange={(event) => setSelectedGrant(event.target.value)}>
          {eligible.map((grant) => <option key={grant.id} value={grant.id}>{grant.kind === "organization" ? t("stability.8d29b60d1e2c", { defaultValue: "Shared account" }) : grant.kind === "user" ? t("stability.b53181a4d853", { defaultValue: "My account" }) : t("stability.dd7e3e4ba9f0", { defaultValue: "Agent account" })}</option>)}
        </select>
      </div>}
      {!setup && <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "prepare", grantId })}>{t("stability.9ee96d897993", { defaultValue: "Generate SSH key pair" })}</Button>}
      {setup && <>
        <div className="space-y-2">
          <Label htmlFor={`${id}-public`}>{t("stability.4ee252fb736e", { defaultValue: "Public key" })}</Label>
          <Textarea id={`${id}-public`} readOnly value={setup.publicKey} className="font-mono text-xs" />
          <p className="text-sm text-muted-foreground">{t("stability.f5c16083a2e1", { defaultValue: "Register this public key in the Railway account used by this authorization. The private key stays in Paperclip’s vault." })}{" "}<a className="underline" href="https://docs.railway.com/cli/ssh#manage-ssh-keys" target="_blank" rel="noreferrer">{t("stability.c078b6c2bf47", { defaultValue: "Railway key setup" })}</a></p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-host`}>{t("stability.74d7e1c06134", { defaultValue: "Verified Railway host key" })}</Label>
          <Textarea id={`${id}-host`} value={knownHosts} onChange={(event) => setKnownHosts(event.target.value)} placeholder={t("stability.38c969c4ae4d", { defaultValue: "ssh.railway.com ssh-ed25519 …" })} className="font-mono text-xs" />
          <p className="text-sm text-muted-foreground">{t("stability.f6c5671367f8", { defaultValue: "Paste the ssh.railway.com line from a known_hosts entry you have independently verified. Paperclip refuses untrusted or changed host keys." })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canConfigure || mutation.isPending || !knownHosts.trim()} onClick={() => mutation.mutate({ action: "enable", grantId, knownHosts })}>{setup.enabled ? t("stability.b299b53adeec", { defaultValue: "Update trusted host key" }) : t("stability.7e7d11eaafcb", { defaultValue: "Enable container access" })}</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "remove", grantId })}>{t("stability.c21f62dee1df", { defaultValue: "Remove container key" })}</Button>
        </div>
        <p className="text-sm text-muted-foreground">{setup.enabled ? t("stability.780066ab54f6", { defaultValue: "Container access is enabled for this authorization." }) : t("stability.be1388e896b3", { defaultValue: "Register the public key and verify the host key before enabling access." })}{" "}{t("stability.f2e513ffbcad", { defaultValue: "Removing the key stops new Paperclip connections. Also remove its public key from Railway." })}</p>
      </>}
    </>}
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error instanceof Error ? mutation.error.message : t("stability.a8d256f59d5e", { defaultValue: "Container access could not be updated." })}</p>}
  </section>;
}
