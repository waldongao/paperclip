import { t } from "@/i18n";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Globe, Paperclip } from "lucide-react";
import { Link, useParams } from "@/lib/router";
import type { McpConnection, McpConnectionRequest } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CompanyPatternIcon } from "@/components/CompanyPatternIcon";
import { api } from "../api/client";

// Bundle known-origin icons so opening consent never contacts a client-selected site.
// Client-supplied names never select branding.
function ClientOrigin({ origin }: { origin: string }) {
  const [failed, setFailed] = useState(false);
  let favicon: string | undefined;
  try {
    const url = new URL(origin);
    if (url.origin === "https://claude.ai") favicon = "/brands/claude-color.svg";
    else if (["https://chatgpt.com", "https://chat.openai.com", "https://openai.com"].includes(url.origin)) favicon = "/brands/codex-color.svg";
  } catch { /* An unavailable origin keeps the neutral site icon. */ }
  return <div className="flex items-center gap-2 text-sm text-muted-foreground">
    {favicon && !failed ? <img src={favicon} alt="" className="size-4 shrink-0 object-contain" referrerPolicy="no-referrer" crossOrigin="anonymous" onError={() => setFailed(true)} /> : <Globe className="size-4 shrink-0" aria-hidden="true" />}
    <bdi className="min-w-0 break-all">{origin}</bdi>
  </div>;
}

export function McpConnectPage() {
  const { id = "" } = useParams();
  return <McpConnectRequest key={id} id={id} />;
}

export function McpDevicePage({ initialCode }: { initialCode?: string } = {}) {
  const [code, setCode] = useState(initialCode ?? new URLSearchParams(window.location.search).get("user_code") ?? "");
  const [submitted, setSubmitted] = useState(code);
  if (submitted) return <McpConnectRequest key={submitted} id={submitted} device onEditCode={() => setSubmitted("")} />;
  return <div className="mx-auto max-w-xl py-10"><Card className="space-y-4 p-6"><div className="flex items-center gap-3"><Paperclip className="size-8 shrink-0" /><h1 className="min-w-0 text-xl font-semibold">{t("stability.189c8f18ab31", { defaultValue: "Connect your assistant to Paperclip" })}</h1></div>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); setSubmitted(code.trim()); }}>
      <label htmlFor="device-code" className="text-sm">{t("stability.c2b988430ea1", { defaultValue: "Enter the code shown by your assistant" })}</label>
      <Input id="device-code" autoComplete="off" value={code} onChange={event => setCode(event.target.value)} required maxLength={12} />
      <div className="flex justify-end"><Button type="submit">{t("continue")}</Button></div>
    </form></Card></div>;
}

function McpConnectRequest({ id, device = false, onEditCode }: { id: string; device?: boolean; onEditCode?: () => void }) {
  const [companyId, setCompanyId] = useState("");
  const [writeEnabled, setWriteEnabled] = useState(true);
  const [deviceResult, setDeviceResult] = useState<"approved" | "denied" | null>(null);
  const request = useQuery({ queryKey: [device ? "mcp-device" : "mcp-request", id], queryFn: () => api.get<McpConnectionRequest>(device ? `/mcp/device?user_code=${encodeURIComponent(id)}` : `/mcp/requests/${encodeURIComponent(id)}`), retry: false });
  const data = request.data;
  const selectedCompanyId = data?.requestedCompanyId ?? (companyId || data?.companies[0]?.id || "");
  // Pin the default once loaded so a refetch cannot silently switch organizations.
  useEffect(() => {
    if (!companyId && !data?.requestedCompanyId && data?.companies[0]) setCompanyId(data.companies[0].id);
  }, [companyId, data]);
  const clientName = data?.clientName.trim();
  const assistantName = clientName && !/^(assistant|mcp client)$/i.test(clientName) ? clientName : "your assistant";
  const clientOrigin = data?.clientOrigin || data?.redirectOrigin;
  const company = data?.companies.find((item) => item.id === selectedCompanyId);
  const allowWrites = Boolean(data?.requestedWrite && company?.canWrite && writeEnabled);
  const consent = useMutation({
    mutationFn: (decision: "approve" | "deny") => api.post<{ redirectUrl?: string; status?: "approved" | "denied" }>(device ? "/mcp/device/consent" : `/mcp/requests/${encodeURIComponent(id)}/consent`, { decision, companyId: selectedCompanyId || undefined, allowWrites: decision === "approve" && allowWrites, ...(device ? { userCode: id } : {}) }),
    onSuccess: ({ redirectUrl, status }) => { if (device && status) setDeviceResult(status); else if (redirectUrl) window.location.assign(redirectUrl); },
  });
  if (deviceResult) return <div className="mx-auto max-w-xl py-10"><Card className="block space-y-4 p-6"><Paperclip className="size-8" /><h1 className="text-xl font-semibold">{deviceResult === "approved" ? t("stability.8759bb4f2773", { defaultValue: "Access approved" }) : t("connection_declined")}</h1><p className="text-sm">{deviceResult === "approved" ? t("stability.7c9f3f7410b9", { defaultValue: "Return to your assistant. It will finish connecting automatically." }) : t("stability.70f5a1191331", { defaultValue: "No access was granted. You can start a new connection from your assistant." })}</p><Button variant="outline" asChild><Link to="/">{t("stability.2ec6bc4661e8", { defaultValue: "Back to Paperclip" })}</Link></Button></Card></div>;
  const returnPath = device ? `/mcp-device?user_code=${encodeURIComponent(id)}` : `/mcp-connect/${id}`;
  return <div className="mx-auto max-w-xl py-10">
    <Card className="block space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Paperclip className="size-8 shrink-0 text-foreground" role="img" aria-label="Paperclip" />
        <h1 className="min-w-0 break-words text-xl font-semibold">{t("connect")}{" "}<bdi>{assistantName}</bdi>{" "}{t("stability.162c702d2a11", { defaultValue: "to Paperclip" })}</h1>
      </div>
      {clientOrigin && <ClientOrigin key={clientOrigin} origin={clientOrigin} />}
      {!device && data?.redirectOrigin && data.redirectOrigin !== clientOrigin && <ClientOrigin key={data.redirectOrigin} origin={data.redirectOrigin} />}
      {device && <p className="text-sm">{t("stability.b04f1b1eaf03", { defaultValue: "Confirm this matches the code shown by your assistant:" })}{" "}<strong className="font-mono">{id.toUpperCase()}</strong></p>}
      {request.isPending && <p className="text-sm text-muted-foreground">{t("stability.a28dee5744ac", { defaultValue: "Loading connection request…" })}</p>}
      {request.error && <p className="text-sm text-destructive">{request.error.message}{" "}{t("stability.da3e04d8c5f9", { defaultValue: "Start a new connection from your assistant." })}</p>}
      {device && request.error && <Button variant="outline" onClick={onEditCode}>{t("stability.1412ee4d2644", { defaultValue: "Enter a different code" })}</Button>}
      {data && <>
        {data.requiresSignIn ? <Button asChild><Link to={`/auth?next=${encodeURIComponent(returnPath)}`}>{t("sign_in_create_account")}</Link></Button> : <>
          {data.requestedCompanyId ? <div className="flex items-center gap-4 rounded-md border border-border p-4">
            {company && <CompanyPatternIcon companyName={company.name} logoUrl={company.logoUrl} className="size-14 shrink-0 rounded-lg text-xl" />}
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">{t("nav.sections.organization")}</p>
              {company ? <p className="break-words text-lg font-semibold">{company.name}</p> : <p className="text-sm text-destructive">{t("stability.91dc63db8b72", { defaultValue: "The selected organization is no longer available to this account. Cancel and reconnect from your assistant to choose an organization you can access." })}</p>}
            </div>
          </div> : <fieldset className="space-y-2" disabled={consent.isPending}>
            <legend className="mb-2 text-sm font-medium">{t("nav.sections.organization")}</legend>
            {data.companies.map((item) => <label key={item.id} className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
              <input type="radio" name="company" aria-label={item.name} value={item.id} checked={selectedCompanyId === item.id} onChange={() => setCompanyId(item.id)} />
              <CompanyPatternIcon companyName={item.name} logoUrl={item.logoUrl} className="size-12 shrink-0 rounded-lg" />
              <span className="min-w-0 break-words font-medium">{item.name}</span>
            </label>)}
            {!data.companies.length && <p className="text-sm text-muted-foreground">{t("stability.0ee0d54d7600", { defaultValue: "This account has no available organizations. Ask an organization owner to add you, then reconnect from your assistant." })}</p>}
          </fieldset>}
          <p className="text-sm">{t("stability.78b4e6343288", { defaultValue: "Read all of your Paperclip data" })}</p>
          {data.requestedWrite && <label htmlFor="mcp-allow-writes" className="flex items-start gap-3 text-sm leading-6">
            <span className="flex h-6 shrink-0 items-center">
              <Checkbox id="mcp-allow-writes" checked={allowWrites} disabled={!company?.canWrite || consent.isPending} onCheckedChange={(checked) => setWriteEnabled(checked === true)} />
            </span>
            <span>{t("stability.1f2d06dc1887", { defaultValue: "Allow write access and creating tasks as me" })}</span>
          </label>}
          {company && !company.canWrite && <p className="text-sm text-muted-foreground">{t("stability.16d5b8bdba1a", { defaultValue: "Your role in this organization is read-only." })}</p>}
          {consent.error && <p className="text-sm text-destructive">{consent.error.message}</p>}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={consent.isPending} onClick={() => consent.mutate("deny")}>{t("common.cancel")}</Button>
            <Button className="h-auto min-h-10 min-w-0 shrink whitespace-normal" disabled={!company || consent.isPending} onClick={() => consent.mutate("approve")}>{consent.isPending ? t("stability.72021eb70e91", { defaultValue: "Connecting…" }) : t("stability.e0b013f5f6d0", { defaultValue: "Connect organization" })}</Button>
          </div>
        </>}
      </>}
    </Card>
  </div>;
}

export function AssistantConnectionsPage() {
  const connections = useQuery({ queryKey: ["mcp-connections"], queryFn: () => api.get<McpConnection[]>("/mcp/connections"), retry: false });
  const revoke = useMutation({ mutationFn: (id: string) => api.delete(`/mcp/connections/${id}`), onSuccess: () => { void connections.refetch(); } });
  return <div className="mx-auto max-w-xl space-y-4 py-10">
    <h1 className="text-xl font-semibold">{t("stability.59fbcc06c1e7", { defaultValue: "Assistant connections" })}</h1>
    <p className="text-sm text-muted-foreground">{t("stability.45be9a4d5011", { defaultValue: "Revoking a connection stops its future tool calls. Work already delegated continues under your organization’s normal controls." })}</p>
    {connections.isPending && <p className="text-sm">{t("stability.8aa3f4352701", { defaultValue: "Loading connections…" })}</p>}
    {(connections.error || revoke.error) && <p className="text-sm text-destructive">{(connections.error ?? revoke.error)?.message}</p>}
    {connections.data?.length === 0 && <p className="text-sm">{t("stability.333dda0091b2", { defaultValue: "No assistant connections." })}</p>}
    {connections.data?.map((connection) => <Card key={connection.id} className="block space-y-2 p-4">
      <h2 className="font-medium">{connection.clientName}</h2>
      <p className="text-sm text-muted-foreground">{t("stability.5300e286a517", { defaultValue: "Organization:" })}{" "}{connection.companyName}</p>
      <p className="text-sm">{connection.scopes.includes("paperclip:write") ? t("stability.70e0d7db990d", { defaultValue: "Read, create tasks and comment" }) : t("read_only_601dcc")}</p>
      {connection.revokedAt ? <p className="text-sm text-muted-foreground">{t("revoked")}</p> : <Button variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate(connection.id)}>{t("stability.473c85193bdf", { defaultValue: "Revoke connection" })}</Button>}
    </Card>)}
    <Link className="text-sm underline" to="/">{t("stability.2ec6bc4661e8", { defaultValue: "Back to Paperclip" })}</Link>
  </div>;
}
