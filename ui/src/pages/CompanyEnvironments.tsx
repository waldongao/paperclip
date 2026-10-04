import { translateDisplayMessage } from "@/i18n/display-message";
import { i18n } from "@/i18n";
import { getDisplayLabel } from "@/lib/display-labels";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Link2, Lock, Play, Plus, RefreshCw, RotateCcw, Terminal, Trash2, X } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTermTerminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  type EnvBinding,
  type Environment,
  type EnvironmentDeleteBlastRadius,
  type EnvironmentProviderCapability,
  type EnvironmentProbeResult,
  type EnvironmentCustomImageSetupSession,
  type JsonSchema,
} from "@paperclipai/shared";
import {
  environmentsApi,
  type EnvironmentCustomImageActiveTemplateDrift,
  type EnvironmentCustomImageConnectionPayload,
  type EnvironmentCustomImageRelinkConflict,
  type EnvironmentCustomImageSetupSessionResult,
  type EnvironmentUpdateResult,
} from "@/api/environments";
import { agentsApi } from "@/api/agents";
import { ApiError } from "@/api/client";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { secretsApi } from "@/api/secrets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  EnvironmentVariablesEditor,
  type EnvironmentVariablesEditorHandle,
} from "@/components/environment-variables-editor";
import { JsonSchemaForm, getDefaultValues, validateJsonSchemaForm } from "@/components/JsonSchemaForm";
import {
  SecretRefHintsContext,
  type SecretRefHint,
  type SecretRefHintsContextValue,
} from "@/components/SecretBindingPicker";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { environmentDisplayLabel, isPlatformManagedEnvironment } from "@/lib/managed-sandbox-environment";
import { queryKeys } from "@/lib/queryKeys";
import { Link, useNavigate, useParams } from "@/lib/router";
import { buildSameOriginWebSocketUrl } from "@/lib/websocket-url";
import {
  Field,
  ToggleField,
} from "../components/agent-config-primitives";
import { t, useTranslation } from "@/i18n";

type EnvironmentFormState = {
  name: string;
  description: string;
  driver: "local" | "ssh" | "sandbox";
  sshHost: string;
  sshPort: string;
  sshUsername: string;
  sshRemoteWorkspacePath: string;
  sshPrivateKey: string;
  sshPrivateKeySecretId: string;
  sshKnownHosts: string;
  sshStrictHostKeyChecking: boolean;
  sandboxProvider: string;
  sandboxConfig: Record<string, unknown>;
  envVars: Record<string, EnvBinding>;
};

type CompanyEnvironmentsMode = "list" | "create" | "edit";

type CompanyEnvironmentsProps = {
  mode?: CompanyEnvironmentsMode;
};

const ENVIRONMENTS_PATH = "/company/settings/instance/environments";

function environmentEditPath(environmentId: string) {
  return `${ENVIRONMENTS_PATH}/${encodeURIComponent(environmentId)}/edit`;
}

// Keep in sync with environmentDeleteBlockMessage in server/src/routes/environments.ts —
// the server enforces these gates with a 409; this copy lets the modal explain
// the block before the user hits it.
function environmentDeleteBlockMessage(impact: EnvironmentDeleteBlastRadius): string | null {
  if (impact.staticReferences.isManagedLocal) {
    return t("cannot_delete_the_managed_local_environment");
  }
  if (impact.staticReferences.isInstanceDefault) {
    return t("cannot_delete_the_current_instance_default_envir");
  }
  if (impact.pendingCleanupLeaseCount > 0) {
    return t("cannot_delete_this_environment_while_a_sandbox_c");
  }
  if (impact.reusableSandboxLeaseCount > 0) {
    return t("cannot_delete_this_environment_while_it_has_a_re");
  }
  return null;
}

function buildEnvironmentPayload(form: EnvironmentFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    driver: form.driver,
    envVars: form.envVars,
    config:
      form.driver === "ssh"
        ? {
            host: form.sshHost.trim(),
            port: Number.parseInt(form.sshPort || "22", 10) || 22,
            username: form.sshUsername.trim(),
            remoteWorkspacePath: form.sshRemoteWorkspacePath.trim(),
            privateKey: form.sshPrivateKey.trim() || null,
            privateKeySecretRef:
              form.sshPrivateKey.trim().length > 0 || !form.sshPrivateKeySecretId
                ? null
                : { type: "secret_ref" as const, secretId: form.sshPrivateKeySecretId, version: "latest" as const },
            knownHosts: form.sshKnownHosts.trim() || null,
            strictHostKeyChecking: form.sshStrictHostKeyChecking,
          }
        : form.driver === "sandbox"
          ? {
              provider: form.sandboxProvider.trim(),
              ...form.sandboxConfig,
            }
          : {},
  } as const;
}

function createEmptyEnvironmentForm(): EnvironmentFormState {
  return {
    name: "",
    description: "",
    driver: "ssh",
    sshHost: "",
    sshPort: "22",
    sshUsername: "",
    sshRemoteWorkspacePath: "",
    sshPrivateKey: "",
    sshPrivateKeySecretId: "",
    sshKnownHosts: "",
    sshStrictHostKeyChecking: true,
    sandboxProvider: "",
    sandboxConfig: {},
    envVars: {},
  };
}

function isLocalEnvironment(environment: Environment | null | undefined) {
  return environment?.driver === "local";
}

function normalizeNonLocalEnvironmentId(
  environmentId: string | null | undefined,
  environments: readonly Environment[],
): string {
  if (!environmentId) return "";
  const environment = environments.find((candidate) => candidate.id === environmentId) ?? null;
  return isLocalEnvironment(environment) ? "" : environmentId;
}

function readSshConfig(environment: Environment) {
  const config = environment.config ?? {};
  return {
    host: typeof config.host === "string" ? config.host : "",
    port:
      typeof config.port === "number"
        ? String(config.port)
        : typeof config.port === "string"
          ? config.port
          : "22",
    username: typeof config.username === "string" ? config.username : "",
    remoteWorkspacePath:
      typeof config.remoteWorkspacePath === "string" ? config.remoteWorkspacePath : "",
    privateKey: "",
    privateKeySecretId:
      config.privateKeySecretRef &&
      typeof config.privateKeySecretRef === "object" &&
      !Array.isArray(config.privateKeySecretRef) &&
      typeof (config.privateKeySecretRef as { secretId?: unknown }).secretId === "string"
        ? String((config.privateKeySecretRef as { secretId: string }).secretId)
        : "",
    knownHosts: typeof config.knownHosts === "string" ? config.knownHosts : "",
    strictHostKeyChecking:
      typeof config.strictHostKeyChecking === "boolean"
        ? config.strictHostKeyChecking
        : true,
  };
}

function readSandboxConfig(environment: Environment) {
  const config = environment.config ?? {};
  const { provider: rawProvider, ...providerConfig } = config;
  return {
    provider: typeof rawProvider === "string" && rawProvider.trim().length > 0
      ? rawProvider
      : "fake",
    config: providerConfig,
  };
}

function createEnvironmentFormFromEnvironment(environment: Environment): EnvironmentFormState {
  if (environment.driver === "ssh") {
    const ssh = readSshConfig(environment);
    return {
      ...createEmptyEnvironmentForm(),
      name: environment.name,
      description: environment.description ?? "",
      driver: "ssh",
      sshHost: ssh.host,
      sshPort: ssh.port,
      sshUsername: ssh.username,
      sshRemoteWorkspacePath: ssh.remoteWorkspacePath,
      sshPrivateKey: ssh.privateKey,
      sshPrivateKeySecretId: ssh.privateKeySecretId,
      sshKnownHosts: ssh.knownHosts,
      sshStrictHostKeyChecking: ssh.strictHostKeyChecking,
      envVars: environment.envVars ?? {},
    };
  }

  if (environment.driver === "sandbox") {
    const sandbox = readSandboxConfig(environment);
    return {
      ...createEmptyEnvironmentForm(),
      name: environment.name,
      description: environment.description ?? "",
      driver: "sandbox",
      sandboxProvider: sandbox.provider,
      sandboxConfig: sandbox.config,
      envVars: environment.envVars ?? {},
    };
  }

  return {
    ...createEmptyEnvironmentForm(),
    name: environment.name,
    description: environment.description ?? "",
    driver: "local",
    envVars: environment.envVars ?? {},
  };
}

const DISCARD_ENVIRONMENT_CHANGES_MESSAGE = t("discard_unsaved_environment_changes");

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJsonStringify(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/** Payload-level fingerprint so cosmetic form state (whitespace, key order) is not "unsaved". */
function environmentFormKey(form: EnvironmentFormState): string {
  return stableJsonStringify(buildEnvironmentPayload(form));
}

function normalizeJsonSchema(schema: unknown): JsonSchema | null {
  return schema && typeof schema === "object" && !Array.isArray(schema)
    ? schema as JsonSchema
    : null;
}

function summarizeSandboxConfig(config: Record<string, unknown>): string | null {
  for (const key of ["template", "image", "region", "workspacePath"]) {
    const value = config[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

const ACTIVE_CUSTOM_IMAGE_SETUP_STATUSES = new Set<EnvironmentCustomImageSetupSession["status"]>([
  "starting",
  "waiting_for_user",
  "capturing",
]);

function isActiveCustomImageSetupSession(session: EnvironmentCustomImageSetupSession | null | undefined) {
  return Boolean(session && ACTIVE_CUSTOM_IMAGE_SETUP_STATUSES.has(session.status));
}

function readEnvironmentSandboxProvider(environment: Environment): string | null {
  return environment.driver === "sandbox" && typeof environment.config.provider === "string"
    ? environment.config.provider
    : null;
}

function formatDateTime(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString(i18n.resolvedLanguage ?? i18n.language);
}

function formatShortId(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 12)}…`;
}

function formatBootSourceDriftValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "none";
  return JSON.stringify(value);
}

/**
 * Builds the drift summary for a `boot_source_drift` overview. It names each
 * changed boot-source field with its `from` and `to` values (example: "snapshot
 * `a` -> `b`"). It uses only value-bearing paths; an excluded path carries the
 * name only, so the summary omits it. Returns `null` when no value-bearing path
 * is present, so the banner keeps the generic text.
 */
function formatBootSourceDriftSummary(
  drift: EnvironmentCustomImageActiveTemplateDrift | null | undefined,
): string | null {
  if (!drift || drift.classification !== "boot_source_drift") return null;
  const parts = drift.driftedPaths
    .filter((entry) => "from" in entry || "to" in entry)
    .map(
      (entry) =>
        `${entry.path} \`${formatBootSourceDriftValue(entry.from)}\` -> \`${formatBootSourceDriftValue(entry.to)}\``,
    );
  if (parts.length === 0) return null;
  return t("zhPages.4e16fa027919", { value: parts.join("; ") });
}

function readConnectionCommand(payload: EnvironmentCustomImageConnectionPayload | null | undefined): string | null {
  return typeof payload?.command === "string" && payload.command.trim().length > 0
    ? payload.command
    : null;
}

function setupConnectionFallbackMessage(input: {
  payload: EnvironmentCustomImageConnectionPayload | null;
  refreshError: unknown;
  isLoading: boolean;
}): string | null {
  if (input.refreshError) {
    return t("setup_connection_details_could_not_be_refreshed");
  }
  if (input.isLoading) return null;
  if (!input.payload) {
    return t("connection_details_are_not_available_yet_you_can");
  }
  if (input.payload.type !== "ssh") {
    return t("browser_terminal_is_not_available_for_this_provi");
  }
  if (!readConnectionCommand(input.payload)) {
    return t("connection_details_are_not_available_yet_you_can");
  }
  return null;
}

const CUSTOM_IMAGE_TERMINAL_COLS = 100;
const CUSTOM_IMAGE_TERMINAL_ROWS = 28;
const CUSTOM_IMAGE_TERMINAL_SCROLLBACK_ROWS = 5_000;
const CUSTOM_IMAGE_TERMINAL_FONT_FAMILY = [
  t("meslolgs_nf"),
  t("meslolgs_nerd_font_mono"),
  t("caskaydiacove_nerd_font_mono"),
  t("caskaydiamono_nerd_font"),
  t("jetbrainsmono_nerd_font"),
  t("firacode_nerd_font_mono"),
  t("symbols_nerd_font_mono"),
  t("menlo"),
  t("monaco"),
  t("consolas"),
  t("liberation_mono"),
  "monospace",
].join(", ");

type CustomImageTerminalConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error";

function appendTerminalQuery(path: string, params: Record<string, string | number>) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
  ).toString()}`;
}

function parseTerminalFrame(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function customImageTerminalStatusCopy(state: CustomImageTerminalConnectionState) {
  switch (state) {
    case "connecting":
      return t("connecting_c1f3b7");
    case "connected":
      return t("connected");
    case "closed":
      return t("closed");
    case "error":
      return t("connection_failed");
    case "idle":
    default:
      return t("ready_to_connect");
  }
}

function customImageTerminalCloseReasonCopy(reason: unknown) {
  if (
    reason !== "expired"
    && reason !== "ssh_closed"
    && reason !== "server_shutdown"
    && reason !== "setup_finished"
    && reason !== "setup_cancelled"
  ) {
    return typeof reason === "string" && reason.trim() ? t("terminal_closed") : null;
  }

  switch (reason) {
    case "expired":
      return t("setup_session_expired");
    case "ssh_closed":
      return t("ssh_session_closed");
    case "server_shutdown":
      return t("terminal_server_shut_down");
    case "setup_finished":
      return t("setup_session_finished");
    case "setup_cancelled":
      return t("setup_session_cancelled");
    default:
      return null;
  }
}

function EnvironmentCustomImageBrowserTerminal({
  autoConnect = false,
  sessionId,
}: {
  autoConnect?: boolean;
  sessionId: string;
}) {
  const { t } = useTranslation();
  const [connectionState, setConnectionState] = useState<CustomImageTerminalConnectionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const terminalElementRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const terminalInputDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const autoConnectAttemptedSessionRef = useRef<string | null>(null);
  const lastSentResizeRef = useRef<{ cols: number; rows: number } | null>(null);

  const closeSocket = useCallback((reason = "operator_closed") => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
      socket.close(1000, reason);
    }
  }, []);

  const getTerminalDimensions = useCallback(() => {
    const terminal = xtermRef.current;
    return {
      cols: terminal?.cols || CUSTOM_IMAGE_TERMINAL_COLS,
      rows: terminal?.rows || CUSTOM_IMAGE_TERMINAL_ROWS,
    };
  }, []);

  const sendTerminalResize = useCallback((force = false) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const dimensions = getTerminalDimensions();
    const previous = lastSentResizeRef.current;
    if (!force && previous?.cols === dimensions.cols && previous.rows === dimensions.rows) return;

    lastSentResizeRef.current = dimensions;
    socket.send(JSON.stringify({
      type: "resize",
      cols: dimensions.cols,
      rows: dimensions.rows,
    }));
  }, [getTerminalDimensions]);

  const fitTerminal = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    if (!fitAddon || !xtermRef.current) return;
    try {
      fitAddon.fit();
      sendTerminalResize();
    } catch {
      // The fit addon can throw during hidden/dialog layout transitions. The
      // next ResizeObserver tick or reconnect will retry with stable dimensions.
    }
  }, [sendTerminalResize]);

  const requestFitTerminal = useCallback(() => {
    if (fitFrameRef.current !== null) {
      window.cancelAnimationFrame(fitFrameRef.current);
    }
    fitFrameRef.current = window.requestAnimationFrame(() => {
      fitFrameRef.current = null;
      fitTerminal();
    });
  }, [fitTerminal]);

  const sendTerminalInput = useCallback((data: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "input", data }));
  }, []);

  const resetTerminalScreen = useCallback(() => {
    const terminal = xtermRef.current;
    if (!terminal) return;
    terminal.reset();
    terminal.clear();
  }, []);

  useEffect(() => {
    const element = terminalElementRef.current;
    if (!element || xtermRef.current) return undefined;

    const terminal = new XTermTerminal({
      allowTransparency: true,
      cols: CUSTOM_IMAGE_TERMINAL_COLS,
      rows: CUSTOM_IMAGE_TERMINAL_ROWS,
      convertEol: false,
      cursorBlink: true,
      cursorInactiveStyle: "bar",
      cursorStyle: "bar",
      cursorWidth: 2,
      customGlyphs: true,
      fontFamily: CUSTOM_IMAGE_TERMINAL_FONT_FAMILY,
      fontSize: 12,
      letterSpacing: 0,
      lineHeight: 1.35,
      scrollback: CUSTOM_IMAGE_TERMINAL_SCROLLBACK_ROWS,
      theme: {
        // token-extraction: allowlisted — xterm.js terminal theme config; functional third-party option object, not a rendered CSS value.
        background: "#0a0a0a",
        foreground: "#f5f5f5",
        cursor: "#22d3ee",
        cursorAccent: "#020617",
        selectionBackground: "#2563eb55",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(element);

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    terminalInputDisposableRef.current = terminal.onData(sendTerminalInput);

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => requestFitTerminal());
      resizeObserver.observe(element);
      resizeObserverRef.current = resizeObserver;
    }

    terminal.focus();
    requestFitTerminal();
    const fitTimeouts = [50, 250].map((delay) => window.setTimeout(fitTerminal, delay));
    const fontsReady = "fonts" in document
      ? (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready
      : null;
    if (fontsReady) {
      void fontsReady.then(() => fitTerminal());
    }

    return () => {
      if (fitFrameRef.current !== null) {
        window.cancelAnimationFrame(fitFrameRef.current);
        fitFrameRef.current = null;
      }
      for (const timeoutId of fitTimeouts) {
        window.clearTimeout(timeoutId);
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      terminalInputDisposableRef.current?.dispose();
      terminalInputDisposableRef.current = null;
      fitAddonRef.current = null;
      xtermRef.current = null;
      terminal.dispose();
    };
  }, [fitTerminal, requestFitTerminal, sendTerminalInput]);

  useEffect(() => () => closeSocket("component_unmounted"), [closeSocket]);

  useEffect(() => {
    closeSocket("session_changed");
    autoConnectAttemptedSessionRef.current = null;
    lastSentResizeRef.current = null;
    setConnectionState("idle");
    setErrorMessage(null);
    resetTerminalScreen();
  }, [closeSocket, resetTerminalScreen, sessionId]);

  useEffect(() => {
    if (connectionState === "connected") {
      xtermRef.current?.focus();
    }
  }, [connectionState]);

  const connectTerminal = useCallback(async () => {
    if (typeof WebSocket === "undefined") {
      setConnectionState("error");
      setErrorMessage(t("browser_terminal_is_unavailable_in_this_browser"));
      return;
    }

    closeSocket("reconnect");
    setConnectionState("connecting");
    lastSentResizeRef.current = null;
    setErrorMessage(null);
    resetTerminalScreen();
    xtermRef.current?.focus();

    try {
      fitTerminal();
      const dimensions = getTerminalDimensions();
      const terminalToken = await environmentsApi.createCustomImageTerminalSessionToken(sessionId, {});
      const websocketPath = appendTerminalQuery(terminalToken.websocketPath, {
        cols: dimensions.cols,
        rows: dimensions.rows,
      });
      const socket = new WebSocket(buildSameOriginWebSocketUrl(websocketPath));
      socketRef.current = socket;

      socket.onopen = () => {
        if (socketRef.current !== socket) return;
        xtermRef.current?.focus();
        socket.send(JSON.stringify({ type: "auth", token: terminalToken.token }));
        sendTerminalResize(true);
      };

      socket.onmessage = (message) => {
        if (socketRef.current !== socket) return;
        const raw = typeof message.data === "string" ? message.data : "";
        const frame = raw ? parseTerminalFrame(raw) : null;
        if (!frame) return;

        if (frame.type === "ready") {
          setConnectionState("connected");
          xtermRef.current?.focus();
          return;
        }

        if (frame.type === "output" && typeof frame.data === "string") {
          xtermRef.current?.write(frame.data as string);
          return;
        }

        if (frame.type === "error") {
          setConnectionState("error");
          setErrorMessage(typeof frame.message === "string" ? frame.message : t("terminal_connection_failed"));
          return;
        }

        if (frame.type === "closed") {
          setConnectionState("closed");
          setErrorMessage(customImageTerminalCloseReasonCopy(frame.reason));
        }
      };

      socket.onclose = () => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        setConnectionState((current) => current === "connected" || current === "connecting" ? "closed" : current);
      };

      socket.onerror = () => {
        if (socketRef.current !== socket) return;
        setConnectionState("error");
        setErrorMessage(t("terminal_websocket_connection_failed"));
      };
    } catch (error) {
      setConnectionState("error");
      setErrorMessage(error instanceof Error ? error.message : t("terminal_session_could_not_be_opened"));
    }
  }, [closeSocket, fitTerminal, getTerminalDimensions, resetTerminalScreen, sendTerminalResize, sessionId]);

  useEffect(() => {
    if (!autoConnect || connectionState !== "idle") return;
    if (autoConnectAttemptedSessionRef.current === sessionId) return;
    const timeoutId = window.setTimeout(() => {
      autoConnectAttemptedSessionRef.current = sessionId;
      void connectTerminal();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [autoConnect, connectTerminal, connectionState, sessionId]);

  const disconnectTerminal = useCallback(() => {
    closeSocket("operator_closed");
    setConnectionState("closed");
  }, [closeSocket]);

  const terminalInteractive = connectionState === "connected";

  return (
    <div className="mt-3 rounded-md border border-border/70 bg-background" data-testid={`custom-image-terminal-${sessionId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{t("browser_terminal")}</span>
          <span className="text-muted-foreground">{customImageTerminalStatusCopy(connectionState)}</span>
        </div>
        <div className="flex items-center gap-2">
          {terminalInteractive ? (
            <Button size="sm" variant="ghost" onClick={disconnectTerminal}>
              {t("disconnect")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void connectTerminal()}
              disabled={connectionState === "connecting"}
            >
              <Terminal className="mr-1.5 h-3.5 w-3.5" />
              {connectionState === "closed" || connectionState === "error" ? t("reconnect") : t("open_terminal")}
            </Button>
          )}
        </div>
      </div>
      <div className="bg-neutral-950 p-2 focus-within:ring-2 focus-within:ring-ring">
        <div
          ref={terminalElementRef}
          data-testid={`custom-image-terminal-screen-${sessionId}`}
          aria-label={t("custom_image_browser_terminal")}
          role="application"
          tabIndex={0}
          onFocus={() => xtermRef.current?.focus()}
          onClick={() => xtermRef.current?.focus()}
          className="h-(--sz-18rem) w-full overflow-hidden bg-neutral-950 outline-none sm:h-(--sz-22rem) [&_.xterm-cursor-bar]:!border-l-2 [&_.xterm-cursor-bar]:!border-l-cyan-300 [&_.xterm-cursor-layer_.xterm-cursor]:!bg-cyan-300 [&_.xterm-helper-textarea]:!opacity-0 [&_.xterm-screen]:focus:outline-none [&_.xterm-viewport]:!overflow-y-auto [&_.xterm]:h-full"
        />
      </div>
      {errorMessage ? (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-destructive">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}

function capabilityState(capability: EnvironmentProviderCapability | null | undefined) {
  if (!capability || capability.status !== "supported" || !capability.supportsInteractiveSetup) {
    return {
      kind: "unsupported" as const,
      label: t("unsupported_provider"),
      reason: t("this_provider_does_not_advertise_interactive_tem"),
    };
  }

  if (!capability.supportsTemplateCapture) {
    return {
      kind: "capture_unavailable" as const,
      label: t("setup_capture_unavailable"),
      reason: t("this_provider_advertises_setup_but_image_capture"),
    };
  }

  return {
    kind: "supported" as const,
    label: t("template_setup"),
    reason: null,
  };
}

function sessionStatusCopy(status: EnvironmentCustomImageSetupSession["status"]) {
  switch (status) {
    case "starting":
      return t("setup_starting");
    case "waiting_for_user":
      return t("setup_running");
    case "capturing":
      return t("capturing_template");
    case "promoted":
      return t("template_captured");
    case "cancelled":
      return t("setup_cancelled");
    case "timed_out":
      return t("setup_expired");
    case "failed":
      return t("setup_failed");
    default:
      return t("setup_status");
  }
}

// The operator declined the drift confirmation prompt. It is not a failure, so
// the relink mutation stays quiet instead of showing an error toast.
class RelinkConfirmationDeclined extends Error {
  constructor() {
    super(t("relink_confirmation_declined"));
    this.name = "RelinkConfirmationDeclined";
  }
}

function formatRelinkDriftValue(value: unknown): string {
  if (value === null || value === undefined) return t("none_3c6b18");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// Turns the sanitized 409 drift body into the operator warning. Value-bearing
// drift shows the changed field; an unclassified result warns that the snapshot
// will override the current base image.
function relinkDriftWarning(conflict: EnvironmentCustomImageRelinkConflict): string {
  if (conflict.classification === "boot_source_drift") {
    const valued = conflict.driftedPaths.find(
      (entry) => entry.from !== undefined || entry.to !== undefined,
    );
    if (valued) {
      return t("zhPages.12b51ea95178", { path: valued.path, detail: formatRelinkDriftValue(valued.from), extra: formatRelinkDriftValue(valued.to) });
    }
    return t("the_base_image_changed_since_this_image_was_capt");
  }
  return t("the_server_cannot_verify_the_boot_source_the_sna");
}

function EnvironmentImageTemplatePanel({
  environment,
  companyId,
  providerCapability,
  providerDisplayName,
}: {
  environment: Environment;
  companyId: string;
  providerCapability: EnvironmentProviderCapability | null | undefined;
  providerDisplayName: string;
}) {
  const { t } = useTranslation();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const state = capabilityState(providerCapability);
  const overviewKey = queryKeys.environments.customImageTemplate(environment.id);

  const overviewQuery = useQuery({
    queryKey: overviewKey,
    queryFn: () => environmentsApi.customImageTemplate(environment.id, companyId),
    enabled: state.kind === "supported",
    retry: false,
  });

  const activeSessionId = overviewQuery.data?.activeSession?.id ?? null;
  const sessionQuery = useQuery({
    queryKey: activeSessionId
      ? queryKeys.environments.customImageSetupSession(activeSessionId)
      : ["environment-custom-image-setup-sessions", "none", environment.id],
    queryFn: () => environmentsApi.customImageSetupSession(activeSessionId!),
    enabled: Boolean(activeSessionId && isActiveCustomImageSetupSession(overviewQuery.data?.activeSession)),
    retry: false,
  });

  function setSessionResult(result: EnvironmentCustomImageSetupSessionResult) {
    queryClient.setQueryData(
      queryKeys.environments.customImageSetupSession(result.session.id),
      result,
    );
  }

  function invalidateOverview() {
    void queryClient.invalidateQueries({ queryKey: overviewKey });
  }

  const startSetupMutation = useMutation({
    mutationFn: (input: { templateId?: string | null } = {}) =>
      environmentsApi.startCustomImageSetupSession(
        environment.id,
        companyId,
        { templateId: input.templateId ?? null },
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(overviewKey, (current: typeof overviewQuery.data) => ({
        activeTemplate: current?.activeTemplate ?? null,
        activeSession: result.session,
        latestSession: result.session,
      }));
      setSessionResult(result);
      pushToast({
        title: t("setup_session_started"),
        body: t("connect_details_are_available_while_the_session"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("failed_to_start_setup"),
        body: error instanceof Error ? error.message : t("setup_session_could_not_be_started"),
        tone: "error",
      });
    },
  });

  const finishSetupMutation = useMutation({
    mutationFn: (sessionId: string) => environmentsApi.finishCustomImageSetupSession(sessionId, {}),
    onSuccess: (result) => {
      queryClient.setQueryData(overviewKey, {
        activeTemplate: result.template,
        activeSession: null,
        latestSession: result.session,
      });
      setSessionResult({ session: result.session, connectionPayload: null });
      invalidateOverview();
      pushToast({
        title: t("template_captured"),
        body: t("future_runs_can_use_the_promoted_template"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("failed_to_capture_template"),
        body: error instanceof Error ? error.message : t("template_capture_failed"),
        tone: "error",
      });
    },
  });

  const cancelSetupMutation = useMutation({
    mutationFn: (sessionId: string) =>
      environmentsApi.cancelCustomImageSetupSession(sessionId, { reason: t("operator_cancelled") }),
    onSuccess: (session) => {
      queryClient.setQueryData(overviewKey, (current: typeof overviewQuery.data) => ({
        activeTemplate: current?.activeTemplate ?? null,
        activeSession: null,
        latestSession: session,
      }));
      setSessionResult({ session, connectionPayload: null });
      invalidateOverview();
      pushToast({
        title: t("setup_cancelled"),
        body: t("the_active_template_was_not_changed"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("failed_to_cancel_setup"),
        body: error instanceof Error ? error.message : t("setup_session_could_not_be_cancelled"),
        tone: "error",
      });
    },
  });

  const rollbackTemplateMutation = useMutation({
    mutationFn: () => environmentsApi.rollbackCustomImageTemplate(environment.id, companyId),
    onSuccess: (result) => {
      queryClient.setQueryData(overviewKey, (current: typeof overviewQuery.data) => ({
        activeTemplate: result.activeTemplate,
        activeSession: null,
        latestSession: current?.latestSession ?? null,
      }));
      invalidateOverview();
      pushToast({
        title: t("template_rolled_back"),
        body: t("future_runs_will_use_the_previous_template"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("failed_to_roll_back_template"),
        body: error instanceof Error ? error.message : t("rollback_failed"),
        tone: "error",
      });
    },
  });

  const relinkTemplateMutation = useMutation({
    // The route is called without the flag first. A 409 carries the sanitized
    // drift detail; the operator must confirm before the flagged retry.
    mutationFn: async () => {
      try {
        return await environmentsApi.relinkCustomImageTemplate(environment.id, companyId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const conflict = (error.body as { details?: EnvironmentCustomImageRelinkConflict } | null)?.details;
          const warning = conflict ? relinkDriftWarning(conflict) : error.message;
          if (!window.confirm(t("zhPages.c626dc0206df", { warning: warning }))) {
            throw new RelinkConfirmationDeclined();
          }
          return await environmentsApi.relinkCustomImageTemplate(environment.id, companyId, {
            confirmBootSourceDrift: true,
          });
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(overviewKey, (current: typeof overviewQuery.data) => ({
        activeTemplate: result.template,
        activeTemplateMatchesConfig: true,
        activeSession: current?.activeSession ?? null,
        latestSession: current?.latestSession ?? null,
      }));
      invalidateOverview();
      pushToast({
        title: t("template_relinked"),
        body: t("runs_use_the_captured_image_again"),
        tone: "success",
      });
    },
    onError: (error) => {
      if (error instanceof RelinkConfirmationDeclined) return;
      pushToast({
        title: t("failed_to_relink_template"),
        body: error instanceof Error ? error.message : t("relink_failed"),
        tone: "error",
      });
    },
  });

  const disableTemplateMutation = useMutation({
    mutationFn: () => environmentsApi.disableCustomImageTemplate(environment.id, companyId),
    onSuccess: (template) => {
      queryClient.setQueryData(overviewKey, (current: typeof overviewQuery.data) => ({
        activeTemplate: null,
        activeSession: null,
        latestSession: current?.latestSession ?? null,
      }));
      invalidateOverview();
      pushToast({
        title: t("template_disabled"),
        body: t("future_runs_will_use_the_base_provider_configura"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("failed_to_disable_template"),
        body: error instanceof Error ? error.message : t("disable_failed_dfcb63"),
        tone: "error",
      });
    },
  });

  if (state.kind !== "supported") {
    return (
      <div className="mt-3 border-t border-border/60 pt-3 text-xs" data-testid={`custom-image-template-state-${environment.id}`}>
        <div className="font-medium text-foreground">{state.label}</div>
        <div className="mt-1 text-muted-foreground">{translateDisplayMessage(state.reason ?? "")}</div>
      </div>
    );
  }

  if (overviewQuery.isLoading) {
    return (
      <div className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
        {t("loading_template_setup")}
      </div>
    );
  }

  if (overviewQuery.isError) {
    return (
      <div className="mt-3 border-t border-border/60 pt-3 text-xs text-destructive">
        {overviewQuery.error instanceof Error ? overviewQuery.error.message : t("template_setup_could_not_be_loaded")}
      </div>
    );
  }

  const overview = overviewQuery.data;
  const activeTemplate = overview?.activeTemplate ?? null;
  const refreshedSession = sessionQuery.data?.session ?? null;
  const session = refreshedSession ?? overview?.activeSession ?? null;
  const latestSession = !isActiveCustomImageSetupSession(session)
    ? session ?? overview?.latestSession ?? null
    : overview?.latestSession ?? null;
  const connectionPayload = session?.status === "waiting_for_user"
    ? sessionQuery.data?.connectionPayload ?? null
    : null;
  const connectionCommand = readConnectionCommand(connectionPayload);
  const connectionFallbackMessage = session?.status === "waiting_for_user"
    ? setupConnectionFallbackMessage({
        payload: connectionPayload,
        refreshError: sessionQuery.isError ? sessionQuery.error : null,
        isLoading: sessionQuery.isLoading,
      })
    : null;
  const sessionExpiresAt = formatDateTime(connectionPayload?.expiresAt ?? session?.expiresAt ?? null);
  const capturedAt = formatDateTime(activeTemplate?.capturedAt ?? activeTemplate?.createdAt ?? null);
  const lastUsedAt = formatDateTime(activeTemplate?.lastUsedAt ?? null);
  const isMutating =
    startSetupMutation.isPending ||
    finishSetupMutation.isPending ||
    cancelSetupMutation.isPending ||
    relinkTemplateMutation.isPending ||
    rollbackTemplateMutation.isPending ||
    disableTemplateMutation.isPending;

  if (session && isActiveCustomImageSetupSession(session)) {
    const isCapturing = session.status === "capturing";
    return (
      <div className="mt-3 border-t border-border/60 pt-3" data-testid={`custom-image-template-state-${environment.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-medium">{sessionStatusCopy(session.status)}</div>
            <div className="text-xs text-muted-foreground">
              {providerDisplayName}{sessionExpiresAt ? t("zhPages.1a3d8ebfd0b6", { sessionExpiresAt: sessionExpiresAt }) : ""}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => finishSetupMutation.mutate(session.id)}
              disabled={isMutating || session.status !== "waiting_for_user"}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              {t("finished")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => cancelSetupMutation.mutate(session.id)}
              disabled={isMutating}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              {t("cancel")}
            </Button>
          </div>
        </div>
        {isCapturing ? (
          <div className="mt-2 text-xs text-muted-foreground">
            {t("capture_is_in_progress_if_this_state_remains_aft")}
          </div>
        ) : null}
        {session.status === "waiting_for_user" && connectionPayload?.type === "ssh" ? (
          <EnvironmentCustomImageBrowserTerminal autoConnect sessionId={session.id} />
        ) : null}
        {session.status === "waiting_for_user" && connectionCommand ? (
          <details className="mt-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium text-foreground">
              {t("ssh_command_fallback")}
            </summary>
            <code className="mt-2 block overflow-x-auto whitespace-nowrap text-(length:--text-micro) leading-5">
              {connectionCommand}
            </code>
          </details>
        ) : null}
        {session.status === "waiting_for_user" && connectionFallbackMessage ? (
          <div className="mt-2 text-xs text-muted-foreground">
            {connectionFallbackMessage}
          </div>
        ) : null}
        {session.failureReason ? (
          <div className="mt-2 text-xs text-destructive">{session.failureReason}</div>
        ) : null}
      </div>
    );
  }

  if (activeTemplate) {
    const templateRef = activeTemplate.templateRef?.trim() || null;
    const templateOutOfSync = overview?.activeTemplateMatchesConfig === false;
    const bootSourceDriftSummary = formatBootSourceDriftSummary(overview?.activeTemplateDrift);
    return (
      <div className="mt-3 border-t border-border/60 pt-3" data-testid={`custom-image-template-state-${environment.id}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-xs font-medium">{t("active_template")}</div>
            <div className="text-xs text-muted-foreground">
              {providerDisplayName} · {getDisplayLabel(activeTemplate.templateKind, "raw")}
              {" · "}
              <span
                className="break-all font-mono text-foreground"
                title={templateRef
                  ? t("zhPages.26cc99efcc3a", { templateKind: getDisplayLabel(activeTemplate.templateKind, "raw"), templateRef: templateRef, id: activeTemplate.id })
                  : activeTemplate.id}
              >
                {templateRef ?? t("zhPages.f221d012d23b", { value: formatShortId(activeTemplate.id) })}
              </span>
              {capturedAt ? t("zhPages.bafb7dfb2ef4", { capturedAt: capturedAt }) : ""}
              {lastUsedAt ? t("zhPages.05c568af8045", { lastUsedAt: lastUsedAt }) : ""}
            </div>
            {templateOutOfSync ? (
              <div
                className="text-xs text-destructive"
                data-testid={`custom-image-template-out-of-sync-${environment.id}`}
              >
                {bootSourceDriftSummary
                  ? t("zhPages.3a3e5954afad", { bootSourceDriftSummary: bootSourceDriftSummary })
                  : t("not_in_use_the_environment_configuration_changed")}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => startSetupMutation.mutate({ templateId: activeTemplate.id })}
              disabled={isMutating}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t("refresh")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => relinkTemplateMutation.mutate()}
              disabled={isMutating}
              data-testid={`custom-image-template-relink-${environment.id}`}
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              {t("relink")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => rollbackTemplateMutation.mutate()}
              disabled={isMutating}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {t("rollback")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => disableTemplateMutation.mutate()}
              disabled={isMutating}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              {t("disable")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-border/60 pt-3" data-testid={`custom-image-template-state-${environment.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-medium">{t("not_configured")}</div>
          <div className="text-xs text-muted-foreground">
            {latestSession
              ? sessionStatusCopy(latestSession.status)
              : t("zhPages.36e46b31b619", { providerDisplayName: providerDisplayName })}
          </div>
          {latestSession?.failureReason ? (
            <div className="text-xs text-destructive">{latestSession.failureReason}</div>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => startSetupMutation.mutate({ templateId: null })}
          disabled={isMutating}
        >
          <Play className="mr-1.5 h-3.5 w-3.5" />
          {t("configure_image")}
        </Button>
      </div>
    </div>
  );
}

export function CompanyEnvironments({ mode = "list" }: CompanyEnvironmentsProps) {
  const { t } = useTranslation();
  const { environmentId: routeEnvironmentId } = useParams<{ environmentId?: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const isEnvironmentFormPage = mode === "create" || mode === "edit";
  const editingEnvironmentId = mode === "edit" ? routeEnvironmentId ?? null : null;
  const [environmentForm, setEnvironmentForm] = useState<EnvironmentFormState>(createEmptyEnvironmentForm);
  const environmentVariablesEditorRef = useRef<EnvironmentVariablesEditorHandle | null>(null);
  const initializedFormKeyRef = useRef<string | null>(null);
  // Fingerprint of the form as initialized; null until the form page has loaded its data.
  const [environmentFormBaselineKey, setEnvironmentFormBaselineKey] = useState<string | null>(null);
  const [environmentVariablesDirty, setEnvironmentVariablesDirty] = useState(false);
  const [probeResults, setProbeResults] = useState<Record<string, EnvironmentProbeResult | null>>({});
  const [testingEnvironmentId, setTestingEnvironmentId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // "" means "inherit the instance default", mirroring the agent config form's
  // environment override select.
  const [reassignEnvironmentTargetId, setReassignEnvironmentTargetId] = useState("");
  const environmentHasUnsavedChanges =
    isEnvironmentFormPage &&
    (environmentVariablesDirty ||
      (environmentFormBaselineKey !== null && environmentFormKey(environmentForm) !== environmentFormBaselineKey));

  useEffect(() => {
    const crumbs = [
      { label: t("settings_"), href: "/company/settings" },
      isEnvironmentFormPage
        ? { label: t("environments"), href: ENVIRONMENTS_PATH }
        : { label: t("environments") },
    ];
    if (mode === "create") crumbs.push({ label: t("add_environment") });
    if (mode === "edit") crumbs.push({ label: t("edit_environment") });
    setBreadcrumbs(crumbs);
  }, [isEnvironmentFormPage, mode, setBreadcrumbs]);

  const { data: instanceSettings } = useQuery({
    queryKey: queryKeys.instance.settings,
    queryFn: () => instanceSettingsApi.get(),
    retry: false,
  });

  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
    retry: false,
  });
  const environmentsEnabled = experimentalSettings?.enableEnvironments === true;
  const managedSandboxOnly = experimentalSettings?.enableManagedSandboxOnly === true;

  const { data: environments } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.environments.list(selectedCompanyId) : ["environments", "none"],
    queryFn: () => environmentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && environmentsEnabled,
  });
  const savedEnvironments = environments ?? [];
  // Delete preflight: the blast radius names what still references the
  // environment, and the agent list identifies which of this company's agents
  // need reassignment. Both only load while the delete dialog is open.
  const deleteBlastRadiusQuery = useQuery({
    queryKey: editingEnvironmentId
      ? ["environment-delete-blast-radius", editingEnvironmentId]
      : ["environment-delete-blast-radius", "none"],
    queryFn: () => environmentsApi.deleteBlastRadius(editingEnvironmentId!),
    enabled: deleteDialogOpen && Boolean(editingEnvironmentId),
    retry: false,
  });
  const companyAgentsQuery = useQuery({
    queryKey: selectedCompanyId ? queryKeys.agents.list(selectedCompanyId) : ["agents", "none"],
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: deleteDialogOpen && Boolean(selectedCompanyId),
  });
  // Descriptors for the edited environment's secret refs. Environments are
  // instance-scoped while secrets are company-scoped, so a ref may point at
  // a secret this company's picker cannot list; these hints let the picker
  // name it instead of calling it missing.
  const environmentSecretRefsQuery = useQuery({
    queryKey: editingEnvironmentId
      ? ["environment-secret-refs", editingEnvironmentId]
      : ["environment-secret-refs", "none"],
    queryFn: () => environmentsApi.secretRefs(editingEnvironmentId!),
    enabled: Boolean(editingEnvironmentId) && environmentsEnabled,
    retry: false,
  });
  const environmentSecretRefHints = useMemo<SecretRefHintsContextValue>(() => {
    // A new environment has no persisted refs, so the empty map is
    // authoritative. For an existing environment the map is only "ready"
    // once the descriptor request resolved — the picker must not call a
    // reference missing off a pending or failed lookup.
    if (!editingEnvironmentId) return { status: "ready", hints: {} };
    if (environmentSecretRefsQuery.isError) return { status: "error", hints: {} };
    if (!environmentSecretRefsQuery.data) return { status: "loading", hints: {} };
    const hints: Record<string, SecretRefHint> = {};
    for (const ref of environmentSecretRefsQuery.data.refs) {
      hints[ref.secretId] = {
        name: ref.name,
        status: ref.status,
        companyId: ref.companyId,
        companyName: ref.companyName,
      };
    }
    return { status: "ready", hints };
  }, [editingEnvironmentId, environmentSecretRefsQuery.data, environmentSecretRefsQuery.isError]);
  const { data: environmentCapabilities } = useQuery({
    queryKey: selectedCompanyId ? ["environment-capabilities", selectedCompanyId] : ["environment-capabilities", "none"],
    queryFn: () => environmentsApi.capabilities(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && environmentsEnabled,
  });

  const { data: secrets } = useQuery({
    queryKey: selectedCompanyId ? ["company-secrets", selectedCompanyId] : ["company-secrets", "none"],
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const createSecret = useMutation({
    mutationFn: (input: { name: string; value: string }) => {
      if (!selectedCompanyId) throw new Error(t("select_an_organization_to_create_secrets"));
      return secretsApi.create(selectedCompanyId, input);
    },
    onSuccess: async () => {
      if (!selectedCompanyId) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.secrets.list(selectedCompanyId) });
    },
  });

  // Managed (platform-provisioned) environments accept exactly one tenant
  // edit: the env var map. The server's write floor rejects everything
  // else, so this mutation sends an envVars-only PATCH — the one body
  // shape the floor admits.
  const managedEnvironmentEnvVarsMutation = useMutation({
    mutationFn: async (envVars: EnvironmentFormState["envVars"]) => {
      if (!editingEnvironmentId) throw new Error(t("no_environment_selected"));
      return await environmentsApi.update(editingEnvironmentId, { envVars }, selectedCompanyId);
    },
    onSuccess: async (environment) => {
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.environments.list(selectedCompanyId),
        });
      }
      initializedFormKeyRef.current = null;
      setEnvironmentForm(createEmptyEnvironmentForm());
      setEnvironmentFormBaselineKey(null);
      setEnvironmentVariablesDirty(false);
      navigate(ENVIRONMENTS_PATH, { replace: true });
      pushToast({
        title: t("environment_variables_updated"),
        body: t("zhPages.cd3f44229b8f", { name: environment.name }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("failed_to_save_environment_variables"),
        body: error instanceof Error ? error.message : t("environment_variables_save_failed"),
        tone: "error",
      });
    },
  });

  const environmentMutation = useMutation({
    mutationFn: async (form: EnvironmentFormState) => {
      const body = buildEnvironmentPayload(form);

      if (editingEnvironmentId) {
        return await environmentsApi.update(editingEnvironmentId, body, selectedCompanyId);
      }

      if (!selectedCompanyId) throw new Error(t("select_a_company_to_create_environments"));
      return await environmentsApi.create(selectedCompanyId!, body);
    },
    onSuccess: async (environment) => {
      const wasEditing = editingEnvironmentId !== null;
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.environments.list(selectedCompanyId),
        });
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.environments.customImageTemplate(environment.id),
      });
      initializedFormKeyRef.current = null;
      setEnvironmentForm(createEmptyEnvironmentForm());
      setEnvironmentFormBaselineKey(null);
      setEnvironmentVariablesDirty(false);
      environmentMutation.reset();
      draftEnvironmentProbeMutation.reset();
      navigate(ENVIRONMENTS_PATH, { replace: true });
      pushToast({
        title: wasEditing ? t("environment_updated") : t("environment_created"),
        body: t("zhPages.dc0a71177ecb", { name: environment.name }),
        tone: "success",
      });
      const reconciliation = (environment as EnvironmentUpdateResult).customImageReconciliation;
      if (reconciliation?.action === "relinked") {
        pushToast({
          title: t("custom_image_kept_active"),
          body: t("the_captured_image_was_re_linked_to_the_updated"),
          tone: "info",
        });
      } else if (reconciliation?.action === "detached") {
        pushToast({
          title: t("custom_image_no_longer_applies"),
          body: t("this_change_alters_what_the_captured_image_was_b"),
          tone: "warn",
        });
      }
    },
    onError: (error) => {
      pushToast({
        title: t("failed_to_save_environment"),
        body: error instanceof Error ? error.message : t("environment_save_failed"),
        tone: "error",
      });
    },
  });

  const defaultEnvironmentMutation = useMutation({
    mutationFn: async (defaultEnvironmentId: string | null) =>
      await instanceSettingsApi.update({ defaultEnvironmentId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.settings });
      pushToast({
        title: t("default_environment_updated"),
        body: t("agent_inheritance_now_follows_the_updated_instan"),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("failed_to_update_default_environment"),
        body: error instanceof Error ? error.message : t("default_environment_update_failed"),
        tone: "error",
      });
    },
  });

  const deleteEnvironmentMutation = useMutation({
    mutationFn: async (input: {
      environment: Environment;
      reassignAgentIds: string[];
      reassignTargetId: string | null;
      destroyReusableLeases: boolean;
    }) => {
      // Reassign before deleting: the FK would null the references anyway, but
      // an explicit PATCH records the change in each agent's config history and
      // honors the operator's chosen target instead of the implicit fallback.
      for (const agentId of input.reassignAgentIds) {
        await agentsApi.update(
          agentId,
          { defaultEnvironmentId: input.reassignTargetId },
          selectedCompanyId ?? undefined,
        );
      }
      return input.destroyReusableLeases
        ? await environmentsApi.remove(input.environment.id, { destroyReusableSandboxLeases: true })
        : await environmentsApi.remove(input.environment.id);
    },
    onSuccess: async (environment, input) => {
      if (selectedCompanyId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.environments.list(selectedCompanyId) });
        if (input.reassignAgentIds.length > 0) {
          await queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
        }
      }
      queryClient.removeQueries({ queryKey: ["environment-delete-blast-radius", environment.id] });
      setDeleteDialogOpen(false);
      initializedFormKeyRef.current = null;
      setEnvironmentForm(createEmptyEnvironmentForm());
      setEnvironmentFormBaselineKey(null);
      setEnvironmentVariablesDirty(false);
      navigate(ENVIRONMENTS_PATH, { replace: true });
      const destroyedCount = environment.destroyedReusableSandboxLeaseCount ?? 0;
      pushToast({
        title: t("environment_deleted"),
        body:
          destroyedCount > 0
            ? t("zhPages.100067a1c502", { name: environment.name, detail: destroyedCount === 1 ? t("1_reusable_sandbox") : t("zhPages.37bfac47262b", { destroyedCount: destroyedCount }) })
            : t("zhPages.030ccc56b8be", { name: environment.name }),
        tone: "success",
      });
    },
    onError: async (error, input) => {
      // Agents reassigned before the failure keep their new target; refresh so
      // the dialog reflects the actual remaining usage.
      if (selectedCompanyId && input.reassignAgentIds.length > 0) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId) });
      }
      await queryClient.invalidateQueries({
        queryKey: ["environment-delete-blast-radius", input.environment.id],
      });
      pushToast({
        title: t("failed_to_delete_environment"),
        body: error instanceof Error ? error.message : t("environment_delete_failed"),
        tone: "error",
      });
    },
  });

  const environmentProbeMutation = useMutation({
    mutationFn: async (environmentId: string) => await environmentsApi.probe(environmentId, selectedCompanyId),
    onMutate: (environmentId) => {
      setTestingEnvironmentId(environmentId);
    },
    onSettled: (_probe, _error, environmentId) => {
      setTestingEnvironmentId((current) => (current === environmentId ? null : current));
    },
    onSuccess: (probe, environmentId) => {
      setProbeResults((current) => ({
        ...current,
        [environmentId]: probe,
      }));
      pushToast({
        title: probe.ok ? t("environment_probe_passed") : t("environment_probe_failed"),
        body: probe.summary,
        tone: probe.ok ? "success" : "error",
      });
    },
    onError: (error, environmentId) => {
      const failedEnvironment = (environments ?? []).find((environment) => environment.id === environmentId);
      setProbeResults((current) => ({
        ...current,
        [environmentId]: {
          ok: false,
          driver: failedEnvironment?.driver ?? "local",
          summary: error instanceof Error ? error.message : t("environment_probe_failed_ba28c4"),
          details: null,
        },
      }));
      pushToast({
        title: t("environment_probe_failed"),
        body: error instanceof Error ? error.message : t("environment_probe_failed_ba28c4"),
        tone: "error",
      });
    },
  });

  const draftEnvironmentProbeMutation = useMutation({
    mutationFn: async (form: EnvironmentFormState) => {
      if (!selectedCompanyId) throw new Error(t("select_a_company_to_test_environments"));
      const body = buildEnvironmentPayload(form);
      return await environmentsApi.probeConfig(selectedCompanyId, body);
    },
    onSuccess: (probe) => {
      pushToast({
        title: probe.ok ? t("draft_probe_passed") : t("draft_probe_failed"),
        body: probe.summary,
        tone: probe.ok ? "success" : "error",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("draft_probe_failed"),
        body: error instanceof Error ? error.message : t("environment_probe_failed_ba28c4"),
        tone: "error",
      });
    },
  });

  useEffect(() => {
    initializedFormKeyRef.current = null;
    setEnvironmentForm(createEmptyEnvironmentForm());
    setEnvironmentFormBaselineKey(null);
    setEnvironmentVariablesDirty(false);
    setProbeResults({});
    setTestingEnvironmentId(null);
  }, [selectedCompanyId]);

  const resetEnvironmentMutation = environmentMutation.reset;
  const resetDraftEnvironmentProbeMutation = draftEnvironmentProbeMutation.reset;

  useEffect(() => {
    if (!isEnvironmentFormPage) {
      initializedFormKeyRef.current = null;
      setEnvironmentFormBaselineKey(null);
      setEnvironmentVariablesDirty(false);
      return;
    }

    const formKey = mode === "create"
      ? `create:${selectedCompanyId ?? "none"}`
      : `edit:${selectedCompanyId ?? "none"}:${editingEnvironmentId ?? "missing"}`;

    if (initializedFormKeyRef.current === formKey) return;

    resetEnvironmentMutation();
    resetDraftEnvironmentProbeMutation();

    if (mode === "create") {
      const emptyForm = createEmptyEnvironmentForm();
      setEnvironmentForm(emptyForm);
      setEnvironmentFormBaselineKey(environmentFormKey(emptyForm));
      setEnvironmentVariablesDirty(false);
      initializedFormKeyRef.current = formKey;
      return;
    }

    const environment = editingEnvironmentId
      ? (environments ?? []).find((candidate) => candidate.id === editingEnvironmentId) ?? null
      : null;
    if (!environment) return;

    const nextForm = createEnvironmentFormFromEnvironment(environment);
    setEnvironmentForm(nextForm);
    setEnvironmentFormBaselineKey(environmentFormKey(nextForm));
    setEnvironmentVariablesDirty(false);
    initializedFormKeyRef.current = formKey;
  }, [
    editingEnvironmentId,
    environments,
    isEnvironmentFormPage,
    mode,
    resetDraftEnvironmentProbeMutation,
    resetEnvironmentMutation,
    selectedCompanyId,
  ]);

  function confirmDiscardEnvironmentChanges() {
    return (
      !environmentHasUnsavedChanges ||
      typeof window === "undefined" ||
      window.confirm(DISCARD_ENVIRONMENT_CHANGES_MESSAGE)
    );
  }

  // The form page is routed, so leaving it (tab close, reload, or an in-app
  // link) silently drops the draft. Intercept both exits while dirty.
  useEffect(() => {
    if (!environmentHasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function handleDocumentClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      if (nextUrl.origin !== currentUrl.origin) return;
      if (
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search &&
        nextUrl.hash === currentUrl.hash
      ) {
        return;
      }

      if (window.confirm(DISCARD_ENVIRONMENT_CHANGES_MESSAGE)) return;
      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [environmentHasUnsavedChanges]);

  function closeEnvironmentForm() {
    if (environmentMutation.isPending) return;
    if (!confirmDiscardEnvironmentChanges()) return;
    initializedFormKeyRef.current = null;
    setEnvironmentForm(createEmptyEnvironmentForm());
    setEnvironmentFormBaselineKey(null);
    setEnvironmentVariablesDirty(false);
    environmentMutation.reset();
    draftEnvironmentProbeMutation.reset();
    navigate(ENVIRONMENTS_PATH);
  }

  function flushEnvironmentForm(): EnvironmentFormState {
    const flushedEnvVars = environmentVariablesEditorRef.current?.flushPendingDraft();
    return flushedEnvVars ? { ...environmentForm, envVars: flushedEnvVars } : environmentForm;
  }

  const discoveredPluginSandboxProviders = Object.entries(environmentCapabilities?.sandboxProviders ?? {})
    .filter(([provider, capability]) => provider !== "fake" && capability.supportsRunExecution)
    .map(([provider, capability]) => ({
      provider,
      displayName: capability.displayName || provider,
      description: capability.description,
      configSchema: normalizeJsonSchema(capability.configSchema),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const sandboxCreationEnabled = discoveredPluginSandboxProviders.length > 0;
  const pluginSandboxProviders =
    environmentForm.sandboxProvider.trim().length > 0 &&
    environmentForm.sandboxProvider !== "fake" &&
    !discoveredPluginSandboxProviders.some((provider) => provider.provider === environmentForm.sandboxProvider)
      ? [
          ...discoveredPluginSandboxProviders,
          { provider: environmentForm.sandboxProvider, displayName: environmentForm.sandboxProvider, description: undefined, configSchema: null },
        ]
      : discoveredPluginSandboxProviders;

  const selectedSandboxProvider = pluginSandboxProviders.find(
    (provider) => provider.provider === environmentForm.sandboxProvider,
  ) ?? null;
  const selectedSandboxSchema = selectedSandboxProvider?.configSchema ?? null;
  const sandboxConfigErrors =
    environmentForm.driver === "sandbox" && selectedSandboxSchema
      ? validateJsonSchemaForm(selectedSandboxSchema as any, environmentForm.sandboxConfig)
      : {};

  useEffect(() => {
    if (environmentForm.driver !== "sandbox") return;
    if (environmentForm.sandboxProvider.trim().length > 0 && environmentForm.sandboxProvider !== "fake") return;
    const firstProvider = discoveredPluginSandboxProviders[0]?.provider;
    if (!firstProvider) return;
    const firstSchema = discoveredPluginSandboxProviders[0]?.configSchema;
    setEnvironmentForm((current) => (
      current.driver !== "sandbox" || (current.sandboxProvider.trim().length > 0 && current.sandboxProvider !== "fake")
        ? current
        : {
            ...current,
            sandboxProvider: firstProvider,
            sandboxConfig: firstSchema ? getDefaultValues(firstSchema as any) : {},
          }
    ));
  }, [discoveredPluginSandboxProviders, environmentForm.driver, environmentForm.sandboxProvider]);

  const environmentFormValid =
    environmentForm.name.trim().length > 0 &&
    (environmentForm.driver !== "ssh" ||
      (
        environmentForm.sshHost.trim().length > 0 &&
        environmentForm.sshUsername.trim().length > 0 &&
        environmentForm.sshRemoteWorkspacePath.trim().length > 0
      )) &&
    (environmentForm.driver !== "sandbox" ||
      environmentForm.sandboxProvider.trim().length > 0 &&
      environmentForm.sandboxProvider !== "fake" &&
      Object.keys(sandboxConfigErrors).length === 0);

  const editingEnvironment = editingEnvironmentId
    ? savedEnvironments.find((environment) => environment.id === editingEnvironmentId) ?? null
    : null;
  const editingSandboxProvider = editingEnvironment ? readEnvironmentSandboxProvider(editingEnvironment) : null;
  const editingSandboxCapability = editingSandboxProvider
    ? environmentCapabilities?.sandboxProviders?.[editingSandboxProvider]
    : null;
  const editingSandboxDisplayName = editingSandboxCapability?.displayName ?? editingSandboxProvider ?? "sandbox";
  const nonLocalEnvironments = savedEnvironments.filter((environment) => !isLocalEnvironment(environment));
  const instanceDefaultEnvironmentId = normalizeNonLocalEnvironmentId(
    instanceSettings?.defaultEnvironmentId ?? null,
    savedEnvironments,
  );
  const instanceDefaultEnvironment =
    savedEnvironments.find((environment) => environment.id === instanceDefaultEnvironmentId) ?? null;

  const deleteBlastRadius = deleteBlastRadiusQuery.data ?? null;
  // Reusable sandbox leases are a soft blocker: with explicit consent the
  // delete destroys those sandboxes inline. Any other reason is a hard block.
  const reusableLeaseOnlyBlock =
    deleteBlastRadius !== null &&
    deleteBlastRadius.deleteBlockedReasons.length > 0 &&
    deleteBlastRadius.deleteBlockedReasons.every((reason) => reason === "reusable_sandbox_lease");
  const deleteBlockMessage =
    deleteBlastRadius && !reusableLeaseOnlyBlock ? environmentDeleteBlockMessage(deleteBlastRadius) : null;
  const deleteUsageLoading = deleteBlastRadiusQuery.isPending || companyAgentsQuery.isPending;
  const deleteUsageError = deleteBlastRadiusQuery.isError || companyAgentsQuery.isError;
  // Environments are instance-scoped while the agent list is company-scoped, so
  // this covers only the agents the current company context can reassign.
  // References the list cannot see (other companies, terminated agents) fall
  // back to the instance default via the FK's on-delete-set-null.
  const agentsUsingEnvironment = editingEnvironmentId
    ? (companyAgentsQuery.data ?? []).filter(
        (agent) => agent.status !== "terminated" && agent.defaultEnvironmentId === editingEnvironmentId,
      )
    : [];
  const reassignTargetEnvironments = nonLocalEnvironments.filter(
    (environment) => environment.id !== editingEnvironmentId,
  );
  const deleteImpactNotes: string[] = [];
  if (deleteBlastRadius && !deleteBlockMessage) {
    if (deleteBlastRadius.staticReferences.agentDefaultCount > agentsUsingEnvironment.length) {
      deleteImpactNotes.push(
        t("other_references_to_this_environment_agents_in_o"),
      );
    }
    const selectionCount =
      deleteBlastRadius.staticReferences.executionWorkspaceSelectionCount +
      deleteBlastRadius.staticReferences.issueSelectionCount +
      deleteBlastRadius.staticReferences.projectSelectionCount;
    if (selectionCount > 0) {
      deleteImpactNotes.push(
        t("zhPages.783cb5dd7ee6", { selectionCount: selectionCount , count: selectionCount }),
      );
    }
    if (deleteBlastRadius.staticReferences.secretBindingCount > 0) {
      deleteImpactNotes.push(
        t("zhPages.c7f62b6a2626", { secretBindingCount: deleteBlastRadius.staticReferences.secretBindingCount , count: deleteBlastRadius.staticReferences.secretBindingCount }),
      );
    }
    if (deleteBlastRadius.activeRuntimeUse.hasActiveRuntimeUse) {
      deleteImpactNotes.push(t("active_runs_or_sandbox_leases_currently_resolve"));
    }
  }
  // One row per workspace holding blocking sandbox leases (several leases can
  // share a workspace). A lease whose workspace FK was nulled groups alone.
  const reusableLeaseHolderGroups = (() => {
    const groups = new Map<
      string,
      { workspaceId: string | null; label: string; issueLabels: string[]; leaseCount: number }
    >();
    for (const holder of deleteBlastRadius?.reusableSandboxLeaseHolders ?? []) {
      const key = holder.executionWorkspaceId ?? `lease:${holder.leaseId}`;
      const issueLabel = holder.issueIdentifier ?? holder.issueTitle;
      const existing = groups.get(key);
      if (existing) {
        existing.leaseCount += 1;
        if (issueLabel && !existing.issueLabels.includes(issueLabel)) existing.issueLabels.push(issueLabel);
      } else {
        groups.set(key, {
          workspaceId: holder.executionWorkspaceId,
          label:
            holder.executionWorkspaceName
            ?? holder.issueIdentifier
            ?? holder.issueTitle
            ?? t("workspace_no_longer_on_record"),
          issueLabels: issueLabel ? [issueLabel] : [],
          leaseCount: 1,
        });
      }
    }
    return Array.from(groups.values());
  })();

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">{t("select_an_organization_context_to_manage_environ")}</div>;
  }

  if (!environmentsEnabled) {
    return (
      <div className="max-w-6xl space-y-4">
        <div className="text-sm text-muted-foreground">
          {t("enable_environments_in_instance_experimental_set")}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6" data-testid="instance-settings-environments-section">
      {!isEnvironmentFormPage ? (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex flex-wrap items-center gap-3 text-sm font-medium">
            <span>{t("default_808d7d")}</span>
            <span>
              <select
                aria-label={t("default_environment")}
                className="min-w-(--sz-12rem) max-w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-normal outline-none"
                value={instanceDefaultEnvironmentId}
                onChange={(event) =>
                  defaultEnvironmentMutation.mutate(event.target.value || null)}
                disabled={defaultEnvironmentMutation.isPending}
              >
                {managedSandboxOnly ? (
                  // Managed-sandbox-only instances never execute locally, so
                  // the implicit local fallback is not a legal default. The
                  // placeholder only renders while no default is stamped yet.
                  instanceDefaultEnvironmentId === "" ? (
                    <option value="" disabled>
                      {t("select_environment")}
                    </option>
                  ) : null
                ) : (
                  <option value="">{t("local")}</option>
                )}
                {nonLocalEnvironments.map((environment) => (
                  <option key={environment.id} value={environment.id}>
                    {environmentDisplayLabel(environment)}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <Button size="icon-sm" variant="ghost" asChild>
            <Link to={`${ENVIRONMENTS_PATH}/new`} aria-label={t("add_environment")} title={t("add_environment")}>
              <Plus className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="space-y-1">
          {savedEnvironments.map((environment) => {
            const probe = probeResults[environment.id] ?? null;
            const sandboxProvider = readEnvironmentSandboxProvider(environment);
            const sandboxProviderCapability = sandboxProvider
              ? environmentCapabilities?.sandboxProviders?.[sandboxProvider]
              : null;
            const sandboxProviderDisplayName =
              sandboxProviderCapability?.displayName ?? sandboxProvider ?? "sandbox";
            return (
              <div
                key={environment.id}
                className="py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span>
                        {environment.name}
                        {isPlatformManagedEnvironment(environment) ? null : (
                          <span className="text-muted-foreground"> · {getDisplayLabel(environment.driver, "raw")}</span>
                        )}
                      </span>
                      {isPlatformManagedEnvironment(environment) ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                          <Lock className="h-3 w-3" aria-hidden />
                          {t("managed_by_paperclip")}
                        </span>
                      ) : null}
                    </div>
                    {environment.description ? (
                      <div className="text-xs text-muted-foreground">{environment.description}</div>
                    ) : null}
                    {environment.driver === "ssh" ? (
                      <div className="text-xs text-muted-foreground">
                        {typeof environment.config.host === "string" ? environment.config.host : t("ssh_host")} ·{" "}
                        {typeof environment.config.username === "string" ? environment.config.username : getDisplayLabel("user", "raw")}
                      </div>
                    ) : environment.driver === "sandbox" ? (
                      <div className="text-xs text-muted-foreground">
                        {(() => {
                          const summary = summarizeSandboxConfig(environment.config as Record<string, unknown>);
                          // The managed row's badge already says "Managed by
                          // Paperclip"; repeating provider vocabulary like
                          // "sandbox provider" next to the default environment
                          // is noise the product avoids.
                          if (isPlatformManagedEnvironment(environment)) {
                            return summary ?? t("provisioned_and_maintained_for_you");
                          }
                          return t("zhPages.d80bbdf3e60d", { sandboxProviderDisplayName: sandboxProviderDisplayName, detail: summary ? ` · ${summary}` : "" });
                        })()}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">{t("runs_on_this_paperclip_host")}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {environment.driver !== "local" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => environmentProbeMutation.mutate(environment.id)}
                        disabled={testingEnvironmentId === environment.id}
                      >
                        {testingEnvironmentId === environment.id
                          ? t("testing")
                          : environment.driver === "ssh"
                            ? t("test_connection")
                            : t("test_provider")}
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={environmentEditPath(environment.id)}>{t("edit")}</Link>
                    </Button>
                  </div>
                </div>
                {probe ? (
                  <div
                    className={
                      probe.ok
                        ? "mt-3 rounded bg-green-500/5 px-2.5 py-2 text-xs text-green-700"
                        : "mt-3 rounded bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
                    }
                  >
                    <div className="font-medium">{probe.summary}</div>
                    {probe.details?.error && typeof probe.details.error === "string" ? (
                      <div className="mt-1 font-mono text-(length:--text-micro)">{probe.details.error}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      ) : null}

      {isEnvironmentFormPage && mode === "edit" && environments === undefined ? (
        <div className="text-sm text-muted-foreground">
          {t("loading_environment_16379d")}
        </div>
      ) : null}

      {isEnvironmentFormPage && mode === "edit" && environments !== undefined && !editingEnvironment ? (
        <div className="space-y-3 text-sm">
          <div className="font-medium">{t("environment_not_found")}</div>
          <div className="text-muted-foreground">{t("the_environment_may_have_been_removed_or_is_not")}</div>
          <Button size="sm" variant="outline" asChild>
            <Link to={ENVIRONMENTS_PATH}>{t("back_to_environments")}</Link>
          </Button>
        </div>
      ) : null}

      {isEnvironmentFormPage && mode === "edit" && editingEnvironment && isPlatformManagedEnvironment(editingEnvironment) ? (
        <SecretRefHintsContext.Provider value={environmentSecretRefHints}>
        <div data-testid="managed-environment-form-page">
          <div className="pb-4">
            <div className="mb-4">
              <Button size="sm" variant="ghost" asChild>
                <Link to={ENVIRONMENTS_PATH}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  {t("environments")}
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold">{editingEnvironment.name}</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden />
                {t("managed_by_paperclip")}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {editingEnvironment.description ?? t("your_agent_runs_on_a_computer_managed_by_papercl")}
            </p>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              {t("this_environment_is_provisioned_and_maintained_f")}
            </p>
          </div>
          <div className="py-4">
            <Field
              label={t("environment_variables")}
              hint={t("injected_into_runs_that_resolve_through_this_env")}
            >
              <EnvironmentVariablesEditor
                ref={environmentVariablesEditorRef}
                value={environmentForm.envVars}
                secrets={secrets ?? []}
                onCreateSecret={async (name, value) => await createSecret.mutateAsync({ name, value })}
                onChange={(env) =>
                  setEnvironmentForm((current) => ({ ...current, envVars: env ?? {} }))}
                onDirtyChange={setEnvironmentVariablesDirty}
              />
            </Field>
            {managedEnvironmentEnvVarsMutation.isError ? (
              <div className="mt-3 text-xs text-destructive">
                {managedEnvironmentEnvVarsMutation.error instanceof Error
                  ? managedEnvironmentEnvVarsMutation.error.message
                  : t("failed_to_save_environment_variables")}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2 py-4">
            <Button
              variant="outline"
              onClick={closeEnvironmentForm}
              disabled={managedEnvironmentEnvVarsMutation.isPending}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={() => managedEnvironmentEnvVarsMutation.mutate(flushEnvironmentForm().envVars)}
              disabled={managedEnvironmentEnvVarsMutation.isPending}
            >
              {managedEnvironmentEnvVarsMutation.isPending ? t("saving") : t("save_environment_variables")}
            </Button>
          </div>
        </div>
        </SecretRefHintsContext.Provider>
      ) : null}

      {isEnvironmentFormPage &&
      (mode === "create" || (editingEnvironment && !isPlatformManagedEnvironment(editingEnvironment))) ? (
        <SecretRefHintsContext.Provider value={environmentSecretRefHints}>
        <div data-testid="environment-form-page">
          <div className="pb-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <Button size="sm" variant="ghost" asChild>
                <Link to={ENVIRONMENTS_PATH}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  {t("environments")}
                </Link>
              </Button>
              {editingEnvironment ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={t("zhPages.b939ca9d78e6", { name: editingEnvironment.name })}
                  title={t("delete_environment")}
                  data-testid="environment-delete-button"
                  onClick={() => {
                    setReassignEnvironmentTargetId("");
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <h1 className="text-lg font-semibold">{editingEnvironmentId ? t("edit_environment") : t("add_environment")}</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("configure_a_reusable_execution_target_for_your_a")}
            </p>
          </div>

          <div className="py-4">
            <div className="space-y-4">
              <Field label={t("name")} hint={t("operator_facing_name_for_this_execution_target")}>
                <input
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                  type="text"
                  value={environmentForm.name}
                  onChange={(e) => setEnvironmentForm((current) => ({ ...current, name: e.target.value }))}
                />
              </Field>
              <Field label={t("description")} hint={t("optional_note_about_what_this_machine_is_for")}>
                <input
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                  type="text"
                  value={environmentForm.description}
                  onChange={(e) => setEnvironmentForm((current) => ({ ...current, description: e.target.value }))}
                />
              </Field>
              <Field label={t("driver")} hint={t("sandbox_stores_plugin_backed_provider_config_on")}>
                <select
                  className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                  value={environmentForm.driver}
                  onChange={(e) =>
                    setEnvironmentForm((current) => ({
                      ...current,
                      sandboxProvider:
                        e.target.value === "sandbox"
                          ? current.sandboxProvider.trim() || discoveredPluginSandboxProviders[0]?.provider || ""
                          : current.sandboxProvider,
                      sandboxConfig:
                        e.target.value === "sandbox"
                          ? (
                              current.sandboxProvider.trim().length > 0 && current.driver === "sandbox"
                                ? current.sandboxConfig
                                : discoveredPluginSandboxProviders[0]?.configSchema
                                  ? getDefaultValues(discoveredPluginSandboxProviders[0].configSchema as any)
                                  : {}
                            )
                          : current.sandboxConfig,
                      driver: e.target.value === "sandbox" ? "sandbox" : "ssh",
                    }))}
                >
                  {sandboxCreationEnabled || environmentForm.driver === "sandbox" ? (
                    <option value="sandbox">{t("sandbox")}</option>
                  ) : null}
                  <option value="ssh">{t("ssh")}</option>
                  {environmentForm.driver === "local" ? (
                    <option value="local">{t("local")}</option>
                  ) : null}
                </select>
              </Field>

              {environmentForm.driver === "ssh" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label={t("host")} hint={t("dns_name_or_ip_address_for_the_remote_machine")}>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      type="text"
                      value={environmentForm.sshHost}
                      onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshHost: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("port")} hint={t("defaults_to_22")}>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      type="number"
                      min={1}
                      max={65535}
                      value={environmentForm.sshPort}
                      onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshPort: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("username")} hint={t("ssh_username")}>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      type="text"
                      value={environmentForm.sshUsername}
                      onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshUsername: e.target.value }))}
                    />
                  </Field>
                  {/*
                    This path lives on the user's own remote SSH host, not on a
                    Paperclip execution host, so it stays visible under the
                    managed-sandbox-only policy. The policy hides host paths that
                    the platform-managed environment owns; an SSH environment the
                    user configured is outside that contract.
                  */}
                  <Field label={t("remote_workspace_path")} hint={t("absolute_path_that_paperclip_will_verify_during")}>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      type="text"
                      placeholder="/Users/paperclip/workspace"
                      value={environmentForm.sshRemoteWorkspacePath}
                      onChange={(e) =>
                        setEnvironmentForm((current) => ({ ...current, sshRemoteWorkspacePath: e.target.value }))}
                    />
                  </Field>
                  <Field label={t("private_key")} hint={t("optional_pem_private_key_leave_blank_to_rely_on")}>
                    <div className="space-y-2">
                      <select
                        className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                        value={environmentForm.sshPrivateKeySecretId}
                        onChange={(e) =>
                          setEnvironmentForm((current) => ({
                            ...current,
                            sshPrivateKeySecretId: e.target.value,
                            sshPrivateKey: e.target.value ? "" : current.sshPrivateKey,
                          }))}
                      >
                        <option value="">{t("no_saved_secret")}</option>
                        {(secrets ?? []).map((secret) => (
                          <option key={secret.id} value={secret.id}>{secret.name}</option>
                        ))}
                      </select>
                      <textarea
                        className="h-32 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs font-mono outline-none"
                        value={environmentForm.sshPrivateKey}
                        disabled={!!environmentForm.sshPrivateKeySecretId}
                        onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshPrivateKey: e.target.value }))}
                      />
                    </div>
                  </Field>
                  <Field label={t("known_hosts")} hint={t("optional_known_hosts_block_used_when_strict_host")}>
                    <textarea
                      className="h-32 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs font-mono outline-none"
                      value={environmentForm.sshKnownHosts}
                      onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshKnownHosts: e.target.value }))}
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <ToggleField
                      label={t("strict_host_key_checking")}
                      hint={t("keep_this_on_unless_you_deliberately_want_probe")}
                      checked={environmentForm.sshStrictHostKeyChecking}
                      onChange={(checked) =>
                        setEnvironmentForm((current) => ({ ...current, sshStrictHostKeyChecking: checked }))}
                    />
                  </div>
                </div>
              ) : null}

              {environmentForm.driver === "sandbox" ? (
                <div className="space-y-3">
                  <Field label={t("provider")} hint={t("installed_run_capable_sandbox_provider_plugins_a")}>
                    <select
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      value={environmentForm.sandboxProvider}
                      onChange={(e) => {
                        const nextProviderKey = e.target.value;
                        const nextProvider = pluginSandboxProviders.find((provider) => provider.provider === nextProviderKey) ?? null;
                        setEnvironmentForm((current) => ({
                          ...current,
                          sandboxProvider: nextProviderKey,
                          sandboxConfig:
                            current.sandboxProvider === nextProviderKey
                              ? current.sandboxConfig
                              : nextProvider?.configSchema
                                ? getDefaultValues(nextProvider.configSchema as any)
                                : {},
                        }));
                      }}
                    >
                      {pluginSandboxProviders.map((provider) => (
                        <option key={provider.provider} value={provider.provider}>
                          {provider.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {selectedSandboxProvider?.description ? (
                    <div className="text-xs text-muted-foreground">
                      {selectedSandboxProvider.description}
                    </div>
                  ) : null}
                  {selectedSandboxSchema ? (
                    <JsonSchemaForm
                      schema={selectedSandboxSchema as any}
                      values={environmentForm.sandboxConfig}
                      onChange={(values) =>
                        setEnvironmentForm((current) => ({ ...current, sandboxConfig: values }))}
                      errors={sandboxConfigErrors}
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {t("this_provider_does_not_declare_additional_config")}
                    </div>
                  )}
                  <ToggleField
                    label={t("stream_run_logs")}
                    hint={t("stream_the_agent_clis_output_live_while_runs_exe")}
                    checked={environmentForm.sandboxConfig.streamRunLogs !== false}
                    onChange={(checked) =>
                      setEnvironmentForm((current) => ({
                        ...current,
                        sandboxConfig: { ...current.sandboxConfig, streamRunLogs: checked },
                      }))}
                  />
                </div>
              ) : null}

              {editingEnvironment &&
              editingEnvironment.driver === "sandbox" &&
              environmentForm.driver === "sandbox" &&
              selectedCompanyId ? (
                <div className="space-y-2 py-3">
                  <div className="text-sm font-medium">{t("custom_image")}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("start_a_setup_sandbox_ssh_in_to_customize_the_in")}
                  </div>
                  <EnvironmentImageTemplatePanel
                    environment={editingEnvironment}
                    companyId={selectedCompanyId}
                    providerCapability={editingSandboxCapability}
                    providerDisplayName={editingSandboxDisplayName}
                  />
                </div>
              ) : null}

              <Field
                label={t("environment_variables")}
                hint={t("injected_into_runs_that_resolve_through_this_env")}
              >
                <EnvironmentVariablesEditor
                  ref={environmentVariablesEditorRef}
                  value={environmentForm.envVars}
                  secrets={secrets ?? []}
                  onCreateSecret={async (name, value) => await createSecret.mutateAsync({ name, value })}
                  onChange={(env) =>
                    setEnvironmentForm((current) => ({ ...current, envVars: env ?? {} }))}
                  onDirtyChange={setEnvironmentVariablesDirty}
                />
              </Field>

              {environmentMutation.isError ? (
                <div className="text-xs text-destructive">
                  {environmentMutation.error instanceof Error
                    ? environmentMutation.error.message
                    : t("failed_to_save_environment")}
                </div>
              ) : null}
              {draftEnvironmentProbeMutation.data ? (
                <div className={draftEnvironmentProbeMutation.data.ok ? "text-xs text-green-600" : "text-xs text-destructive"}>
                  {draftEnvironmentProbeMutation.data.summary}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 py-4">
            <Button
              variant="outline"
              onClick={closeEnvironmentForm}
              disabled={environmentMutation.isPending}
            >
              {t("cancel")}
            </Button>
            {environmentForm.driver !== "local" ? (
              <Button
                variant="outline"
                onClick={() => draftEnvironmentProbeMutation.mutate(flushEnvironmentForm())}
                disabled={draftEnvironmentProbeMutation.isPending || !environmentFormValid}
              >
                {draftEnvironmentProbeMutation.isPending ? t("testing") : t("test")}
              </Button>
            ) : null}
            <Button
              onClick={() => environmentMutation.mutate(flushEnvironmentForm())}
              disabled={environmentMutation.isPending || !environmentFormValid}
            >
              {environmentMutation.isPending
                ? editingEnvironmentId
                  ? t("saving")
                  : t("creating_28ea76")
                : editingEnvironmentId
                  ? t("save_environment")
                  : t("create_environment")}
            </Button>
          </div>

          {editingEnvironment ? (
            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={(open) => {
                if (!open && deleteEnvironmentMutation.isPending) return;
                setDeleteDialogOpen(open);
              }}
            >
              <AlertDialogContent data-testid="environment-delete-dialog">
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("delete_f6fdbe")} {editingEnvironment.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {deleteUsageLoading
                      ? t("checking_what_uses_this_environment")
                      : deleteUsageError
                        ? t("could_not_check_what_uses_this_environment_close")
                        : deleteBlockMessage
                          ?? ([
                            reusableLeaseOnlyBlock && deleteBlastRadius
                              ? t("zhPages.31f33980112d", { value: deleteBlastRadius.reusableSandboxLeaseCount === 1 ? t("1_reusable_sandbox") : t("zhPages.f89347a3fc1e", { reusableSandboxLeaseCount: deleteBlastRadius.reusableSandboxLeaseCount }) })
                              : null,
                            agentsUsingEnvironment.length > 0
                              ? t("zhPages.1bdfeadd79ee", { value: agentsUsingEnvironment.length === 1 ? t("1_agent_uses") : t("zhPages.903ec0f871c1", { length: agentsUsingEnvironment.length }) })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" ")
                            || t("this_environment_will_be_permanently_deleted_and"))}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {reusableLeaseHolderGroups.length > 0 ? (
                  <div className="space-y-1.5" data-testid="environment-delete-lease-holders">
                    <div className="text-xs font-medium text-muted-foreground">{t("sandbox_leases_held_by")}</div>
                    <ul className="space-y-1">
                      {reusableLeaseHolderGroups.map((group) => (
                        <li key={group.workspaceId ?? group.label} className="text-sm">
                          {group.workspaceId ? (
                            <Link
                              className="underline underline-offset-2 hover:text-foreground"
                              to={`/execution-workspaces/${group.workspaceId}`}
                            >
                              {group.label}
                            </Link>
                          ) : (
                            <span>{group.label}</span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            · {group.leaseCount === 1 ? t("1_sandbox_lease") : t("zhPages.f20eb603329e", { leaseCount: group.leaseCount })}
                            {group.issueLabels.length > 0 ? ` · ${group.issueLabels.join(", ")}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="text-xs text-muted-foreground">
                      {reusableLeaseOnlyBlock
                        ? t("deleting_destroys_these_sandboxes_the_workspaces")
                        : t("close_these_workspaces_to_let_paperclip_destroy")}
                    </div>
                  </div>
                ) : null}
                {!deleteUsageLoading && !deleteUsageError && !deleteBlockMessage ? (
                  <div className="space-y-3">
                    {agentsUsingEnvironment.length > 0 ? (
                      <label className="block space-y-1.5 text-sm">
                        <span className="font-medium">
                          {t("zhPages.reassignAgentsTo", { count: agentsUsingEnvironment.length })}</span>
                        <select
                          aria-label={t("reassign_agents_to_environment")}
                          data-testid="environment-delete-reassign-select"
                          className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-normal outline-none"
                          value={reassignEnvironmentTargetId}
                          onChange={(event) => setReassignEnvironmentTargetId(event.target.value)}
                        >
                          <option value="">
                            {t("default")} {instanceDefaultEnvironment
                              ? `${instanceDefaultEnvironment.name} · ${getDisplayLabel(instanceDefaultEnvironment.driver, "raw")}`
                              : t("local")}
                          </option>
                          {reassignTargetEnvironments.map((environment) => (
                            <option key={environment.id} value={environment.id}>
                              {environment.name} · {getDisplayLabel(environment.driver, "raw")}
                            </option>
                          ))}
                        </select>
                        <span className="block text-xs text-muted-foreground">
                          {t("affected")} {agentsUsingEnvironment.map((agent) => agent.name).join(", ")}
                        </span>
                      </label>
                    ) : null}
                    {deleteImpactNotes.length > 0 ? (
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {deleteImpactNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteEnvironmentMutation.isPending}>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="environment-delete-confirm"
                    disabled={
                      deleteEnvironmentMutation.isPending ||
                      deleteUsageLoading ||
                      deleteUsageError ||
                      Boolean(deleteBlockMessage)
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      deleteEnvironmentMutation.mutate({
                        environment: editingEnvironment,
                        reassignAgentIds: agentsUsingEnvironment.map((agent) => agent.id),
                        reassignTargetId: reassignEnvironmentTargetId || null,
                        destroyReusableLeases: reusableLeaseOnlyBlock,
                      });
                    }}
                  >
                    {deleteEnvironmentMutation.isPending
                      ? t("deleting")
                      : reusableLeaseOnlyBlock && deleteBlastRadius
                        ? t("zhPages.d18dde2828e6", { value: deleteBlastRadius.reusableSandboxLeaseCount === 1 ? t("1_sandbox") : t("zhPages.2067cf916c36", { reusableSandboxLeaseCount: deleteBlastRadius.reusableSandboxLeaseCount }) })
                        : t("delete_environment")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
        </SecretRefHintsContext.Provider>
      ) : null}
    </div>
  );
}
