import { t } from "@/i18n";
import type { MouseEvent, ReactNode } from "react";
import { FileCode2, FolderOpen } from "lucide-react";
import { useLocation } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { ParsedWorkspaceFileRef } from "@/lib/workspace-file-parser";
import { formatWorkspaceFileRefDisplay } from "@/lib/workspace-file-parser";
import {
  useFileViewer,
  writeFolderViewerStateToSearch,
  writeFileViewerStateToSearch,
} from "@/context/FileViewerContext";
import { useTranslation } from "@/i18n";

export interface WorkspaceFileLinkProps {
  workspaceFileRef: ParsedWorkspaceFileRef;
  /** Override the rendered label. Defaults to `path:line:col`. */
  label?: ReactNode;
  className?: string;
  /** Optional override if the consumer wants to customize activation. */
  onOpen?: (ref: ParsedWorkspaceFileRef) => void;
  showIcon?: boolean;
  title?: string;
}

export function WorkspaceFileLink({
  workspaceFileRef,
  label,
  className,
  onOpen,
  showIcon = true,
  title,
}: WorkspaceFileLinkProps) {
  const { t } = useTranslation();
  const viewer = useFileViewer();
  const location = useLocation();
  const display = typeof label !== "undefined" ? label : formatWorkspaceFileRefDisplay(workspaceFileRef);
  const canOpen = !!(onOpen || viewer);
  const isDirectory = workspaceFileRef.resourceKind === "directory" || workspaceFileRef.path.endsWith("/");
  const lineSuffix = workspaceFileRef.line
    ? t("zhComponents.message_febecef523", { value1: workspaceFileRef.line, value2: workspaceFileRef.column ? t("zhComponents.message_e52d2581c4", { value1: workspaceFileRef.column }) : "" })
    : "";
  const ariaLabel = canOpen
    ? t("zhComponents.message_4714e0f56d", { value1: workspaceFileRef.path, value2: lineSuffix, value3: isDirectory ? t("workspace_browser") : t("file_viewer") })
    : t("zhComponents.message_c08416bc84", { value1: isDirectory ? t("folder") : t("file"), value2: workspaceFileRef.path, value3: lineSuffix });
  const tooltip = title ?? (canOpen
    ? t("zhComponents.message_4714e0f56d", { value1: workspaceFileRef.path, value2: lineSuffix, value3: isDirectory ? t("workspace_browser") : t("file_viewer") })
    : t("zhComponents.message_c08416bc84", { value1: isDirectory ? t("folder") : t("file"), value2: workspaceFileRef.path, value3: lineSuffix }));

  const deepLinkSearch = isDirectory
    ? writeFolderViewerStateToSearch(location.search, {
        path: workspaceFileRef.path,
        projectId: workspaceFileRef.projectId ?? null,
        workspaceId: workspaceFileRef.workspaceId ?? null,
      })
    : writeFileViewerStateToSearch(location.search, {
        path: workspaceFileRef.path,
        line: workspaceFileRef.line ?? null,
        column: workspaceFileRef.column ?? null,
        // Preserve the workspace that passed the availability preflight so the
        // click resolves against that target instead of rediscovering one.
        workspace: workspaceFileRef.workspace ?? "auto",
        projectId: workspaceFileRef.projectId ?? null,
        workspaceId: workspaceFileRef.workspaceId ?? null,
      });
  const href = canOpen
    ? `${location.pathname}${deepLinkSearch}${location.hash}`
    : "#";

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    if (!canOpen) return;
    if (onOpen) onOpen(workspaceFileRef);
    else if (isDirectory) viewer?.openFolder(workspaceFileRef);
    else viewer?.open(workspaceFileRef);
  };

  return (
    <a
      href={href}
      role={canOpen ? "button" : undefined}
      data-workspace-file-link="true"
      data-workspace-file-path={workspaceFileRef.path}
      aria-label={ariaLabel}
      title={tooltip}
      className={cn(
        "paperclip-workspace-file-link inline-flex items-center gap-1 rounded-sm border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-xs leading-tight text-foreground/90 align-middle no-underline hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        className,
      )}
      onClick={handleClick}
    >
      {showIcon ? (
        isDirectory
          ? <FolderOpen aria-hidden="true" className="h-3 w-3 shrink-0 opacity-70" />
          : <FileCode2 aria-hidden="true" className="h-3 w-3 shrink-0 opacity-70" />
      ) : null}
      <span className="max-w-full whitespace-normal break-all text-left">{display}</span>
    </a>
  );
}
