import { t } from "@/i18n";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  chatEndpointsApi,
  type ChatEndpoint,
  type ChatEndpointSetupAction,
} from "@/api/chatEndpoints";
import { sanitizedSetupErrorMessage } from "./chat-setup-error";

export function PhotonConnectStep({
  endpoint,
  agentName,
  repairing,
  pending,
  onAction,
}: {
  endpoint: ChatEndpoint;
  agentName: string;
  repairing: boolean;
  pending: boolean;
  onAction(
    action: ChatEndpointSetupAction,
    values?: Record<string, string>,
  ): void;
}) {
  const [projectId, setProjectId] = useState(endpoint.providerAccountId ?? "");
  const [projectSecret, setProjectSecret] = useState("");
  const [lineId, setLineId] = useState("");
  const inspection = useMutation({
    mutationFn: () =>
      chatEndpointsApi.inspectPhoton(endpoint.id, {
        projectId: projectId.trim(),
        projectSecret,
      }),
    onSuccess: (result) => {
      const eligible = result.lines.filter((line) => line.eligible);
      setLineId(eligible.length === 1 ? eligible[0].lineId : "");
    },
  });
  const resetInspection = () => {
    inspection.reset();
    setLineId("");
  };
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-xl font-bold">{t("stability.32def631882d", { defaultValue: "Connect iMessage Photon" })}</h1>
        <p className="text-sm text-muted-foreground">{t("connect")}{" "}{agentName}{" "}{t("stability.35f258988a84", { defaultValue: "to Photon Cloud. Pro supports direct messages through a shared line. Dedicated numbers also support individually enabled groups." })}</p>
        <p className="text-sm">
          <a
            className="underline"
            href="https://app.photon.codes/"
            target="_blank"
            rel="noreferrer"
          >{t("stability.5da11f56acd1", { defaultValue: "Photon dashboard" })}</a>
          {" · "}
          <a
            className="underline"
            href="https://photon.codes/docs/spectrum-ts/providers/imessage/connection-and-routing"
            target="_blank"
            rel="noreferrer"
          >{t("stability.d3a4d1f056e9", { defaultValue: "Photon line setup" })}</a>
        </p>
      </div>
      {repairing && (
        <p className="text-sm text-muted-foreground">{t("stability.2f29d282c271", { defaultValue: "Reconnect keeps this project and" })}{" "}
          {endpoint.photonAllocation === "shared" ? t("stability.10e5a47f3124", { defaultValue: "shared DM allocation" }) : endpoint.botExternalId ?? t("stability.4475cb1eb371", { defaultValue: "dedicated number" })}. Leave the secret blank
          to reuse the saved connection.
        </p>
      )}
      <label className="grid gap-2 text-sm font-medium">{t("stability.e511470b21a9", { defaultValue: "Project ID" })}<Input
          value={projectId}
          autoComplete="off"
          disabled={pending || inspection.isPending || !!endpoint.botExternalId}
          onChange={(event) => {
            setProjectId(event.target.value);
            resetInspection();
          }}
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">{t("stability.e34f019ab722", { defaultValue: "Project secret" })}<Input
          type="password"
          value={projectSecret}
          autoComplete="new-password"
          disabled={pending || inspection.isPending}
          onChange={(event) => {
            setProjectSecret(event.target.value);
            resetInspection();
          }}
        />
      </label>
      <Button
        variant="outline"
        disabled={
          pending || inspection.isPending || !projectId.trim() || !projectSecret
        }
        onClick={() => inspection.mutate()}
      >
        {inspection.isPending ? t("stability.7906bcc6abf2", { defaultValue: "Inspecting Photon…" }) : t("stability.f3ed326355f7", { defaultValue: "Inspect Photon project" })}
      </Button>
      {inspection.isError && (
        <p role="alert" className="text-sm text-destructive">
          {sanitizedSetupErrorMessage(inspection.error, { projectSecret })}
        </p>
      )}
      {inspection.data && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">
            {inspection.data.allocation === "shared" ? t("stability.d71f88aca39b", { defaultValue: "Shared DMs" }) : t("stability.4c9a8c79d51d", { defaultValue: "Dedicated numbers" })}{" "}{t("zhComponents.text_af10ef20dd")}{" "}{inspection.data.projectName}
          </legend>
          {!inspection.data.eligible && (
            <p role="alert" className="text-sm text-destructive">
              {inspection.data.allocation === "shared"
                ? t("stability.2dd07c3fceb3", { defaultValue: "This shared project already belongs to another channel. Use a separate Photon project for each agent." })
                : t("stability.56febe59a76f", { defaultValue: "No eligible dedicated number is available. Check the line allocation in Photon and existing Paperclip channels." })}
            </p>
          )}
          {inspection.data.allocation === "shared" && inspection.data.eligible && (
            <p className="text-sm text-muted-foreground">{t("stability.9cc8aad14f01", { defaultValue: "Direct messages only. Enroll each test sender in your Photon project's Users page, then use the number Photon assigns to that sender. Paperclip identity linking is still required. Groups cannot be enabled on this channel." })}</p>
          )}
          {inspection.data.lines.map((line) => (
            <label
              key={line.lineId}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="photon-line"
                value={line.lineId}
                checked={lineId === line.lineId}
                disabled={
                  !line.eligible ||
                  pending ||
                  (!!endpoint.botExternalId &&
                    endpoint.botExternalId !== line.phoneNumber)
                }
                onChange={() => setLineId(line.lineId)}
              />
              <span>
                {line.phoneNumber}
                {line.unavailableReason ? ` — ${line.unavailableReason}` : ""}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <div>
        <Button
          disabled={
            pending ||
            inspection.isPending ||
            (!(inspection.data?.eligible && (inspection.data.allocation === "shared" || lineId)) && !(repairing && !projectSecret))
          }
          onClick={() =>
            onAction(
              repairing ? "reconnect" : "configure",
              inspection.data?.eligible && inspection.data.allocation === "shared"
                ? { projectId: projectId.trim(), projectSecret, allocation: "shared" }
                : lineId
                ? { projectId: projectId.trim(), projectSecret, lineId, allocation: "dedicated" }
                : undefined,
            )
          }
        >
          {pending
            ? t("stability.72021eb70e91", { defaultValue: "Connecting…" })
            : repairing
              ? t("stability.7d2393455d5a", { defaultValue: "Reconnect Photon" })
              : inspection.data?.allocation === "shared" ? t("stability.889e1116011f", { defaultValue: "Connect shared DMs" }) : t("stability.1a1bb17ba8a7", { defaultValue: "Connect selected number" })}
        </Button>
      </div>
    </div>
  );
}
