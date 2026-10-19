import type {
  WorkspaceOperation,
  WorkspaceReadiness,
  WorkspaceReadinessState,
  WorkspaceRuntimeService,
} from "@paperclipai/shared";
import { t } from "@/i18n";
import { getDisplayLabel } from "./display-labels";

/**
 * Derives the workspace access state the UI shows (PAP-17572).
 *
 * The board cannot read a cloned workspace's protected health directly, so state
 * comes from three server-side facts it *can* see: the live runtime rows, the
 * workspace operation log, and the readiness the control plane reported when it
 * last tried to mint a login handoff.
 *
 * Every state carries one concrete next action. The failure this replaces was a
 * generic "Load failed" (or worse, a green badge) that told an operator nothing
 * about whether to wait, start, repair, or read a log.
 */

export type WorkspaceAccessActionKind =
  | "open"
  | "start"
  | "repair"
  | "view_logs"
  /** Nothing to do but wait for a running operation. */
  | "wait";

export type WorkspaceAccessAction = {
  kind: WorkspaceAccessActionKind;
  label: string;
};

export type WorkspaceAccessNotice = {
  title: string;
  description: string;
  action: WorkspaceAccessAction;
};

export type WorkspaceAccessDisplayState = WorkspaceReadinessState | "stopped";

export type WorkspaceAccessState = {
  state: WorkspaceAccessDisplayState;
  title: string;
  description: string;
  action: WorkspaceAccessAction;
  /** True when a password-independent handoff is the expected way in. */
  handoffAvailable: boolean;
  /** A non-blocking historical failure that is still useful to inspect. */
  secondaryNotice?: WorkspaceAccessNotice;
};

/** What the control plane said the last time a handoff was requested. */
export type WorkspaceLoginHandoffFailureInfo = {
  reason: string;
  detail?: string | null;
  readiness?: WorkspaceReadiness | null;
};

function latestOperation(operations: WorkspaceOperation[], phase: WorkspaceOperation["phase"]) {
  return operations.find((operation) => operation.phase === phase) ?? null;
}

function describeSeedPhase(readiness: WorkspaceReadiness | null | undefined): string | null {
  if (!readiness?.failurePhase && !readiness?.seedPhase) return null;
  return readiness.failurePhase ?? readiness.seedPhase ?? null;
}

function timestampMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function failedRepairNotice(repair: WorkspaceOperation): WorkspaceAccessNotice {
  const phase = typeof repair.metadata?.repairPhase === "string" ? repair.metadata.repairPhase : null;
  return {
    title: t("repair_failed"),
    description: phase
      ? t("zhSupport.repairStoppedPhase", { phase: getDisplayLabel(phase).toLocaleLowerCase() })
      : t("the_repair_stopped_before_the_workspace_became_u"),
    action: { kind: "view_logs", label: t("view_repair_log") },
  };
}

function failedProvisionNotice(provision: WorkspaceOperation): WorkspaceAccessNotice {
  const phase = typeof provision.metadata?.seedFailurePhase === "string"
    ? provision.metadata.seedFailurePhase
    : null;
  return {
    title: t("database_provisioning_failed"),
    description: phase
      ? t("zhSupport.cloneEarlierFailure", { phase: getDisplayLabel(phase).toLocaleLowerCase() })
      : t("an_earlier_clone_attempt_failed_but_the_workspac"),
    action: { kind: "view_logs", label: t("view_provisioning_log") },
  };
}

const HANDOFF_REASON_COPY: Record<string, string> = {
  handoff_not_configured:
    t("this_instance_has_no_workspace_login_handoff_con"),
  no_board_identity:
    t("your_session_has_no_cloned_user_to_sign_in_as_so"),
  runtime_not_running: t("no_healthy_runtime_service_is_publishing_a_url_f"),
  runtime_url_unusable: t("the_runtime_row_is_publishing_a_url_paperclip_ca"),
  workspace_not_ready: t("the_cloned_database_is_not_ready_to_accept_a_log"),
};

const READINESS_FAILURE_COPY: Record<string, string> = {
  database_unreachable: t("the_isolated_database_is_not_answering"),
  clone_data_missing: t("the_clone_restored_no_organization_or_issue_rows"),
  clone_data_unreadable: t("the_cloned_product_tables_could_not_be_read"),
  cloned_membership_missing: t("no_cloned_user_has_an_active_organization_member"),
  cloned_identity_unreadable: t("the_cloned_identity_tables_could_not_be_read"),
  auth_handoff_not_configured: t("the_workspace_was_started_without_a_login_handof"),
  seed_manifest_unreadable: t("the_seed_manifest_is_unreadable_so_the_restore_c"),
};

/**
 * Human cause for a readiness rejection, preferring the specific recorded phase
 * over a generic sentence so the copy names what to fix.
 */
export function describeWorkspaceReadinessCause(
  failure: WorkspaceLoginHandoffFailureInfo | null | undefined,
): string | null {
  if (!failure) return null;
  const phase = describeSeedPhase(failure.readiness);
  if (phase && READINESS_FAILURE_COPY[phase]) return READINESS_FAILURE_COPY[phase];
  if (phase) return t("zhSupport.lastPhase", { phase: getDisplayLabel(phase).toLocaleLowerCase() });
  if (failure.detail && READINESS_FAILURE_COPY[failure.detail]) return READINESS_FAILURE_COPY[failure.detail];
  return HANDOFF_REASON_COPY[failure.reason] ?? null;
}

export function resolveWorkspaceAccessState(input: {
  runtimeServices: WorkspaceRuntimeService[] | null | undefined;
  operations: WorkspaceOperation[] | null | undefined;
  handoffFailure?: WorkspaceLoginHandoffFailureInfo | null;
}): WorkspaceAccessState {
  const operations = input.operations ?? [];
  const runtimeServices = input.runtimeServices ?? [];
  const repair = latestOperation(operations, "workspace_repair");
  const provision =
    latestOperation(operations, "workspace_seed")
    ?? latestOperation(operations, "workspace_runtime_provision")
    ?? latestOperation(operations, "workspace_provision");
  const failure = input.handoffFailure ?? null;
  const cause = describeWorkspaceReadinessCause(failure);
  const handoffAvailable = failure?.reason !== "handoff_not_configured" && failure?.reason !== "no_board_identity";
  const servingService = runtimeServices.find(
    (service) => service.status === "running" && service.healthStatus === "healthy" && service.url,
  );
  const startingService = runtimeServices.find(
    (service) => service.status === "provisioning" || service.status === "starting",
  );
  const repairFinishedAt = timestampMs(repair?.finishedAt);
  const servingServiceStartedAt = timestampMs(servingService?.startedAt);
  const provisionFinishedAt = timestampMs(provision?.finishedAt);
  const readinessConfirmsServing = Boolean(servingService && failure?.readiness?.state === "ready");
  const runtimeStartedAfterRepair = repairFinishedAt !== null
    && servingServiceStartedAt !== null
    && repairFinishedAt < servingServiceStartedAt;
  const repairFailureWasSuperseded = repair?.status === "failed" && Boolean(
    servingService
    && (readinessConfirmsServing || runtimeStartedAfterRepair),
  );
  const successfulRepairFinishedAt = repair?.status === "succeeded"
    ? timestampMs(repair.finishedAt)
    : null;
  // A failed seed is historical once the workspace is demonstrably serving,
  // or once a later repair has replaced and revalidated that database.
  const provisionFailureWasSuperseded = provision?.status === "failed" && Boolean(
    servingService
    || (
      provisionFinishedAt !== null
      && successfulRepairFinishedAt !== null
      && provisionFinishedAt < successfulRepairFinishedAt
    ),
  );
  const secondaryNotice = repair?.status === "failed" && repairFailureWasSuperseded
    ? failedRepairNotice(repair)
    : provision?.status === "failed" && provisionFailureWasSuperseded
      ? failedProvisionNotice(provision)
      : undefined;

  // A live repair outranks everything: it is already changing the answer.
  if (repair?.status === "running") {
    const phase = typeof repair.metadata?.repairPhase === "string" ? repair.metadata.repairPhase : null;
    return {
      state: "repairing",
      title: t("repairing_workspace_database"),
      description: phase
        ? t("zhSupport.repairPhase", { phase: getDisplayLabel(phase).toLocaleLowerCase() })
        : t("only_the_isolated_database_is_replaced_the_git_w"),
      action: { kind: "wait", label: t("repair_in_progress") },
      handoffAvailable,
    };
  }
  if (repair?.status === "failed" && !repairFailureWasSuperseded) {
    const notice = failedRepairNotice(repair);
    return {
      state: "failed",
      ...notice,
      handoffAvailable,
    };
  }

  if (provision?.status === "running") {
    return {
      state: "provisioning",
      title: t("provisioning_database"),
      description: t("restoring_the_isolated_database_clone_for_this_w"),
      action: { kind: "wait", label: t("provisioning_c9d0ab") },
      handoffAvailable,
    };
  }
  if (provision?.status === "failed" && !provisionFailureWasSuperseded) {
    const seedPhase = typeof provision.metadata?.seedFailurePhase === "string"
      ? provision.metadata.seedFailurePhase
      : null;
    return {
      state: "failed",
      title: t("database_provisioning_failed"),
      description: seedPhase
        ? t("zhSupport.cloneFailedPhase", { phase: getDisplayLabel(seedPhase).toLocaleLowerCase() })
        : t("the_clone_did_not_finish_so_this_workspace_has_n"),
      action: { kind: "repair", label: t("repair_workspace") },
      handoffAvailable,
    };
  }

  // Readiness the control plane actually observed beats anything inferred from
  // runtime rows, because it is the only signal that looked inside the clone.
  const staleNotReadyFailure = failure?.reason === "workspace_not_ready" && readinessConfirmsServing;
  if (failure && !staleNotReadyFailure) {
    if (failure.reason === "runtime_not_running" && !servingService && !startingService) {
      return {
        state: "stopped",
        title: t("workspace_is_not_running"),
        description: t("start_the_workspace_runtime_to_publish_its_board"),
        action: { kind: "start", label: t("start_workspace") },
        handoffAvailable,
      };
    }
    if (failure.reason === "workspace_not_ready" || failure.reason === "runtime_url_unusable") {
      const readinessState = failure.readiness?.state;
      const validating = readinessState === "validating" || readinessState === "provisioning";
      return {
        state: validating ? "validating" : "degraded",
        title: validating ? t("validating_clone") : t("workspace_is_degraded"),
        description: [
          cause ?? t("the_workspace_is_serving_but_its_clone_did_not_p"),
          validating ? t("paperclip_is_still_confirming_the_clone") : t("one_bounded_repair_replaces_the_isolated_databas"),
        ].join(" "),
        action: validating
          ? { kind: "wait", label: t("validating") }
          : { kind: "repair", label: t("repair_workspace") },
        handoffAvailable,
      };
    }
    if (!handoffAvailable) {
      return {
        state: servingService ? "ready" : "degraded",
        title: servingService ? t("ready_snapshot_local_sign_in") : t("workspace_is_degraded"),
        description: cause ?? t("opening_the_board_will_ask_for_the_credentials_c"),
        action: servingService
          ? { kind: "open", label: t("open_workspace") }
          : { kind: "start", label: t("start_workspace") },
        handoffAvailable: false,
        secondaryNotice,
      };
    }
  }

  if (startingService) {
    return {
      state: "provisioning",
      title: t("workspace_is_starting"),
      description: t("paperclip_is_starting_the_workspace_runtime_and"),
      action: { kind: "wait", label: t("starting_workspace") },
      handoffAvailable,
    };
  }

  if (servingService) {
    return {
      state: "ready",
      title: t("ready"),
      description: t("opening_the_workspace_signs_you_in_to_the_cloned"),
      action: { kind: "open", label: t("open_workspace") },
      handoffAvailable,
      secondaryNotice,
    };
  }

  const unhealthyService = runtimeServices.find(
    (service) => service.status === "running" && service.healthStatus !== "healthy",
  );
  if (unhealthyService) {
    return {
      state: "degraded",
      title: t("workspace_is_degraded"),
      description: cause
        ?? t("the_runtime_is_up_but_did_not_report_a_usable_da"),
      action: { kind: "repair", label: t("repair_workspace") },
      handoffAvailable,
    };
  }

  return {
    state: "stopped",
    title: t("workspace_is_not_running"),
    description: t("start_the_workspace_runtime_to_publish_its_board"),
    action: { kind: "start", label: t("start_workspace") },
    handoffAvailable,
  };
}
