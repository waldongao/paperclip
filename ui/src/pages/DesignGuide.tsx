import { useState } from "react";
import { ServicesList } from "./apps/app-detail/ServicesPanel";
import { ComposioProvenanceChip } from "./apps/ComposioProvenanceChip";
import type { ComposioServiceRow } from "./apps/composio-services";
import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  CircleDot,
  Command as CommandIcon,
  DollarSign,
  Hexagon,
  History,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Mail,
  Plus,
  Search,
  Settings,
  Target,
  Trash2,
  Upload,
  User,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineBanner } from "@/components/InlineBanner";
import { BuiltInLifecycleChip } from "@/components/BuiltInAgentBadges";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable-panels";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { AgentCapsule, AGENT_GRADIENT_COUNT } from "@/components/AgentCapsule";
import { StatusBadge, IssueStatusBadge } from "@/components/StatusBadge";
import { StatusIcon } from "@/components/StatusIcon";
import { EnforcementBanner } from "@/components/EnforcementBanner";
import { ActionCard, ActionCardMobile, BindingsTable } from "@/components/actions/ActionCard";
import { PriorityIcon } from "@/components/PriorityIcon";
import { SHOW_TASK_PRIORITY_UI } from "@/lib/ui-flags";
import { agentStatusDot, agentStatusDotDefault } from "@/lib/status-colors";
import { EntityRow } from "@/components/EntityRow";
import { EmptyState } from "@/components/EmptyState";
import { MetricCard } from "@/components/MetricCard";
import { FilterBar, type FilterValue } from "@/components/FilterBar";
import { InlineEditor } from "@/components/InlineEditor";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Identity } from "@/components/Identity";
import { AppLogo } from "@/pages/apps/AppLogo";
import { IssueReferencePill } from "@/components/IssueReferencePill";
import { MembershipAction } from "@/components/MembershipAction";
import { IssueOutputSection } from "@/components/issue-output/IssueOutputSection";
import { EnvironmentVariablesEditor } from "@/components/environment-variables-editor";
import { IssueThreadInteractionCard } from "@/components/IssueThreadInteractionCard";
import {
  connectedConnectionIntentInteraction,
  issueThreadInteractionFixtureMeta,
  pendingConnectionIntentInteraction,
  retryConnectionIntentInteraction,
} from "@/fixtures/issueThreadInteractionFixtures";
import type { CompanySecret, EnvBinding, Issue } from "@paperclipai/shared";
import { CollectionToolbar } from "@/components/CollectionToolbar";
import { IssueRow } from "@/components/IssueRow";
import {
  EnvInputsList,
  ExternalSourcesList,
  RequiredSkillsList,
  StepSkillPlan,
  StepSourcePolicy,
  TeamCard,
  TeamHierarchyPreview,
  TeamRow,
} from "@/pages/TeamCatalog";
import {
  currentInstalledState,
  onboardingTeams,
  optionalTeam,
  outOfDateInstalledState,
  sampleSkillPreparations,
  sampleTeam,
  warnTeam,
} from "@/pages/TeamCatalog.fixtures";
import type { IssueWorkProduct } from "@paperclipai/shared";
import { t, useTranslation } from "@/i18n";

/* ------------------------------------------------------------------ */
/*  Sample data for the Issue Output surface showcase                  */
/* ------------------------------------------------------------------ */

function sampleOutput(
  id: string,
  attachmentId: string,
  contentType: string,
  filename: string,
  opts: { byteSize: number; isPrimary?: boolean; createdAt: string },
): IssueWorkProduct {
  const contentPath = `/api/attachments/${attachmentId}/content`;
  return {
    id,
    companyId: "demo-company",
    projectId: null,
    issueId: "demo-issue",
    executionWorkspaceId: null,
    runtimeServiceId: null,
    type: "artifact",
    provider: "paperclip",
    externalId: null,
    title: filename,
    url: null,
    status: "active",
    reviewState: "none",
    isPrimary: Boolean(opts.isPrimary),
    healthStatus: "unknown",
    summary: null,
    createdByRunId: null,
    createdAt: new Date(opts.createdAt),
    updatedAt: new Date(opts.createdAt),
    metadata: {
      attachmentId,
      contentType,
      byteSize: opts.byteSize,
      contentPath,
      openPath: contentPath,
      downloadPath: `${contentPath}?download=1`,
      originalFilename: filename,
    },
  } as IssueWorkProduct;
}

const DESIGN_GUIDE_OUTPUTS: IssueWorkProduct[] = [
  sampleOutput("wp-vid", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "video/mp4", "q3-summary.mp4", {
    byteSize: 19_293_798,
    isPrimary: true,
    createdAt: "2026-05-30T12:00:00Z",
  }),
  sampleOutput("wp-pdf", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "application/pdf", "talking-points.pdf", {
    byteSize: 421_888,
    createdAt: "2026-05-30T11:52:00Z",
  }),
];

const DESIGN_GUIDE_DEGRADED_OUTPUTS: IssueWorkProduct[] = [
  {
    ...sampleOutput("wp-broken", "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "video/mp4", "corrupt-output.mp4", {
      byteSize: 0,
      isPrimary: true,
      createdAt: "2026-05-30T12:01:00Z",
    }),
    // Strip the path metadata so it fails the shared artifact schema.
    metadata: { attachmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", contentType: "video/mp4" },
  } as IssueWorkProduct,
];

const DESIGN_GUIDE_TASK = {
  id: "design-guide-task",
  identifier: "PAP-427",
  title: t("reconcile_the_navigation_model_across_operator_s"),
  status: "in_progress",
  priority: "medium",
  blockerAttention: false,
} as unknown as Issue;

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

/**
 * Composio service rows for the design guide (PAP-17865). One row per state, so
 * a reader can compare all four side by side rather than connecting a real
 * Composio project to see them.
 */
const DESIGN_GUIDE_COMPOSIO_ROWS: ComposioServiceRow[] = [
  {
    toolkitSlug: "github",
    name: t("github"),
    description: t("issues_pull_requests_and_repository_actions"),
    logoUrl: null,
    state: "connected",
    connectedAccountStatus: "ACTIVE",
    childConnectionId: "design-guide-child",
    toolCount: 42,
    noAuth: false,
  },
  {
    toolkitSlug: "hubspot",
    name: t("hubspot"),
    description: t("crm_contacts_and_deals"),
    logoUrl: null,
    state: "attention",
    connectedAccountStatus: "EXPIRED",
    childConnectionId: "design-guide-child-2",
    toolCount: 18,
    noAuth: false,
  },
  {
    toolkitSlug: "slack",
    name: t("slack"),
    description: t("channels_and_messages"),
    logoUrl: null,
    state: "pending",
    connectedAccountStatus: "INITIALIZING",
    childConnectionId: null,
    toolCount: 12,
    noAuth: false,
  },
  {
    toolkitSlug: "gmail",
    name: t("gmail"),
    description: t("read_and_send_mail"),
    logoUrl: null,
    state: "not_connected",
    connectedAccountStatus: null,
    childConnectionId: null,
    toolCount: 9,
    noAuth: false,
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <Separator />
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
    </div>
  );
}

// Onboarding seam (design §6 + §12.5): the TeamCard tile in its "Pick a starter
// team" 3-col grid, with the first defaultInstall tile selected.
function TeamCardShowcase() {
  const [selectedId, setSelectedId] = useState(onboardingTeams[0]?.id ?? null);
  return (
    <div className="grid max-w-2xl gap-4 md:grid-cols-2 lg:grid-cols-3">
      {onboardingTeams.map((team) => (
        <TeamCard
          key={team.id}
          team={team}
          selected={team.id === selectedId}
          onSelect={() => setSelectedId(team.id)}
        />
      ))}
    </div>
  );
}

// Reusable environment-variables editor: one shared grid, in-field source
// switch, fuzzy secret picker, sensitive-value detection, inline health.
const DESIGN_GUIDE_SECRETS: CompanySecret[] = [
  {
    id: "dg-github",
    companyId: "dg",
    scope: "company",
    ownerUserId: null,
    userSecretDefinitionId: null,
    key: "github_token",
    name: "GITHUB_TOKEN",
    provider: "local_encrypted",
    status: "active",
    managedMode: "paperclip_managed",
    externalRef: null,
    providerConfigId: null,
    providerMetadata: null,
    latestVersion: 3,
    description: null,
    lastResolvedAt: null,
    lastRotatedAt: null,
    deletedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    createdAt: new Date("2026-03-01T10:00:00.000Z"),
    updatedAt: new Date("2026-03-01T10:00:00.000Z"),
  },
  {
    id: "dg-db",
    companyId: "dg",
    scope: "company",
    ownerUserId: null,
    userSecretDefinitionId: null,
    key: "db_connection",
    name: "DB_CONNECTION",
    provider: "local_encrypted",
    status: "active",
    managedMode: "paperclip_managed",
    externalRef: null,
    providerConfigId: null,
    providerMetadata: null,
    latestVersion: 3,
    description: null,
    lastResolvedAt: null,
    lastRotatedAt: null,
    deletedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    createdAt: new Date("2026-03-01T10:00:00.000Z"),
    updatedAt: new Date("2026-03-01T10:00:00.000Z"),
  },
];

function EnvironmentVariablesEditorShowcase() {
  const { t } = useTranslation();
  const [env, setEnv] = useState<Record<string, EnvBinding>>({
    NODE_ENV: { type: "plain", value: "production" },
    GH_TOKEN: { type: "secret_ref", secretId: "dg-github", version: "latest" },
    DB_URL: { type: "secret_ref", secretId: "dg-db", version: 3 },
    STRIPE_API_KEY: { type: "plain", value: "sk-live-51H8xL0aBcDeFgHiJkLmNoPq" },
  });
  return (
    <div className="max-w-(--sz-640px) rounded-md border border-border p-4">
      <EnvironmentVariablesEditor
        value={env}
        secrets={DESIGN_GUIDE_SECRETS}
        onChange={(next) => setEnv(next ?? {})}
        onCreateSecret={async (name) => ({
          ...DESIGN_GUIDE_SECRETS[0]!,
          id: `dg-${name}`,
          key: name,
          name: name.toUpperCase(),
          latestVersion: 1,
        })}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Color swatch                                                       */
/* ------------------------------------------------------------------ */

function Swatch({ name, cssVar }: { name: string; cssVar: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-8 w-8 rounded-md border border-border shrink-0"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <div>
        <p className="text-xs font-mono">{cssVar}</p>
        <p className="text-xs text-muted-foreground">{name}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function DesignGuide() {
  const { t } = useTranslation();
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [selectValue, setSelectValue] = useState("in_progress");
  const [menuChecked, setMenuChecked] = useState(true);
  const [collapsibleOpen, setCollapsibleOpen] = useState(false);
  const [inlineText, setInlineText] = useState(t("click_to_edit_this_text"));
  const [inlineTitle, setInlineTitle] = useState(t("editable_title"));
  const [inlineDesc, setInlineDesc] = useState(
    t("this_is_an_editable_description_click_to_edit_it")
  );
  const [filters, setFilters] = useState<FilterValue[]>([
    { key: "status", label: t("status"), value: t("active") },
    // PAP-411: priority filter demo row suppressed while SHOW_TASK_PRIORITY_UI is off.
    ...(SHOW_TASK_PRIORITY_UI
      ? [{ key: "priority", label: t("priority"), value: t("high") } as FilterValue]
      : []),
  ]);
  const [allowExternal, setAllowExternal] = useState(false);
  const [allowUnpinned, setAllowUnpinned] = useState(false);
  const [allowLocalPath, setAllowLocalPath] = useState(false);

  return (
    <div className="space-y-10 max-w-4xl">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold">{t("design_guide")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("every_component_style_and_pattern_used_across_pa")}
        </p>
      </div>

      {/* ============================================================ */}
      {/*  COVERAGE                                                     */}
      {/* ============================================================ */}
      <Section title={t("component_coverage")}>
        <p className="text-sm text-muted-foreground">
          {t("this_page_should_be_updated_when_new_ui_primitiv")}
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <SubSection title={t("ui_primitives")}>
            <div className="flex flex-wrap gap-2">
              {[
                "avatar", "badge", "breadcrumb", "button", "card", "checkbox", "collapsible",
                "command", "dialog", "dropdown-menu", "input", "label", "popover", "resizable-panels",
                "scroll-area", "select", "separator", "sheet", "skeleton", "tabs", "textarea", "tooltip",
              ].map((name) => (
                <Badge key={name} variant="outline" className="font-mono text-(length:--text-nano)">
                  {name}
                </Badge>
              ))}
            </div>
          </SubSection>
          <SubSection title={t("app_components")}>
            <div className="flex flex-wrap gap-2">
              {[
                t("statusbadge"), t("statusicon"), t("priorityicon"), t("entityrow"), t("emptystate"), t("metriccard"),
                t("filterbar"), t("inlineeditor"), t("pageskeleton"), t("identity"), t("commentthread"), t("markdowneditor"),
                t("propertiespanel"), t("sidebar"), t("commandpalette"), t("environmentvariableseditor"),
                t("inlinebanner"), t("builtinagentgate"), t("builtinlifecyclechip"), t("collectiontoolbar"),
                t("issuerow"), t("contextualsidebarframe"),
              ].map((name) => (
                <Badge key={name} variant="ghost" className="font-mono text-(length:--text-nano)">
                  {name}
                </Badge>
              ))}
            </div>
          </SubSection>
        </div>
      </Section>

      <Section title={t("task_collection")}>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("collectiontoolbar_owns_shared_geometry_while_eac")}
        </p>
        <CollectionToolbar
          context={<span className="text-sm font-medium">{t("recent_tasks_21bcad")}</span>}
          search={<Input aria-label={t("search_task_collection_example")} placeholder={t("search_tasks")} />}
          controls={<Button variant="outline" size="sm">{t("filter")}</Button>}
          actions={<Button size="sm">{t("new_task")}</Button>}
          feedback={<span className="text-xs text-muted-foreground">{t("1_task_updated_newest_first")}</span>}
        />
        <div className="overflow-hidden rounded-lg border border-border">
          <IssueRow
            issue={DESIGN_GUIDE_TASK}
            presentation="task"
            unreadState="visible"
            metadata={<span className="text-xs text-muted-foreground">{t("updated_12m_ago")}</span>}
            actions={<Button variant="ghost" size="xs">{t("more")}</Button>}
          />
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  COLORS                                                       */}
      {/* ============================================================ */}
      <Section title={t("colors")}>
        <SubSection title={t("core")}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Swatch name="Background" cssVar="--background" />
            <Swatch name="Foreground" cssVar="--foreground" />
            <Swatch name="Card" cssVar="--card" />
            <Swatch name="Primary" cssVar="--primary" />
            <Swatch name="Primary foreground" cssVar="--primary-foreground" />
            <Swatch name="Secondary" cssVar="--secondary" />
            <Swatch name="Muted" cssVar="--muted" />
            <Swatch name="Muted foreground" cssVar="--muted-foreground" />
            <Swatch name="Accent" cssVar="--accent" />
            <Swatch name="Destructive" cssVar="--destructive" />
            <Swatch name="Border" cssVar="--border" />
            <Swatch name="Ring" cssVar="--ring" />
          </div>
        </SubSection>

        <SubSection title={t("sidebar")}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Swatch name="Sidebar" cssVar="--sidebar" />
            <Swatch name="Sidebar border" cssVar="--sidebar-border" />
          </div>
        </SubSection>

        <SubSection title={t("chart")}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Swatch name="Chart 1" cssVar="--chart-1" />
            <Swatch name="Chart 2" cssVar="--chart-2" />
            <Swatch name="Chart 3" cssVar="--chart-3" />
            <Swatch name="Chart 4" cssVar="--chart-4" />
            <Swatch name="Chart 5" cssVar="--chart-5" />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TYPOGRAPHY                                                   */}
      {/* ============================================================ */}
      <Section title={t("typography")}>
        <div className="space-y-3">
          <h2 className="text-xl font-bold">{t("page_title_text_xl_font_bold")}</h2>
          <h2 className="text-lg font-semibold">{t("section_title_text_lg_font_semibold")}</h2>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("section_heading_text_sm_font_semibold_uppercase")}
          </h3>
          <p className="text-sm font-medium">{t("card_title_text_sm_font_medium")}</p>
          <p className="text-sm font-semibold">{t("card_title_alt_text_sm_font_semibold")}</p>
          <p className="text-sm">{t("body_text_text_sm")}</p>
          <p className="text-sm text-muted-foreground">
            {t("muted_description_text_sm_text_muted_foreground")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("tiny_label_text_xs_text_muted_foreground")}
          </p>
          <p className="text-sm font-mono text-muted-foreground">
            {t("mono_identifier_text_sm_font_mono_text_muted_for")}
          </p>
          <p className="text-2xl font-bold">{t("large_stat_text_2xl_font_bold")}</p>
          <p className="font-mono text-xs">{t("log_code_text_font_mono_text_xs")}</p>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SPACING & RADIUS                                             */}
      {/* ============================================================ */}
      <Section title={t("radius")}>
        <div className="flex items-end gap-4 flex-wrap">
          {[
            ["sm", "var(--radius-sm)"],
            ["md", "var(--radius-md)"],
            ["lg", "var(--radius-lg)"],
            ["xl", "var(--radius-xl)"],
            ["full", "9999px"],
          ].map(([label, radius]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-12 bg-primary"
                style={{ borderRadius: radius }}
              />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  BUTTONS                                                      */}
      {/* ============================================================ */}
      <Section title={t("buttons")}>
        <SubSection title={t("variants")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="default">{t("default_808d7d")}</Button>
            <Button variant="secondary">{t("secondary")}</Button>
            <Button variant="outline">{t("outline")}</Button>
            <Button variant="ghost">{t("ghost")}</Button>
            <Button variant="destructive">{t("destructive")}</Button>
            <Button variant="link">{t("link")}</Button>
          </div>
        </SubSection>

        <SubSection title={t("sizes")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="xs">{t("extra_small")}</Button>
            <Button size="sm">{t("small")}</Button>
            <Button size="default">{t("default_808d7d")}</Button>
            <Button size="lg">{t("large")}</Button>
          </div>
        </SubSection>

        <SubSection title={t("icon_buttons")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="icon-xs"><Search /></Button>
            <Button variant="ghost" size="icon-sm"><Search /></Button>
            <Button variant="outline" size="icon"><Search /></Button>
            <Button variant="outline" size="icon-lg"><Search /></Button>
          </div>
        </SubSection>

        <SubSection title={t("with_icons")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button><Plus /> {t("new_issue")}</Button>
            <Button variant="outline"><Upload /> {t("upload")}</Button>
            <Button variant="destructive"><Trash2 /> {t("delete_f6fdbe")}</Button>
            <Button size="sm"><Plus /> {t("add")}</Button>
          </div>
        </SubSection>

        <SubSection title={t("states")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button disabled>{t("disabled")}</Button>
            <Button variant="outline" disabled>{t("disabled_outline")}</Button>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  BADGES                                                       */}
      {/* ============================================================ */}
      <Section title={t("badges")}>
        <SubSection title={t("variants")}>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default">{t("default_808d7d")}</Badge>
            <Badge variant="secondary">{t("secondary")}</Badge>
            <Badge variant="outline">{t("outline")}</Badge>
            <Badge variant="destructive">{t("destructive")}</Badge>
            <Badge variant="ghost">{t("ghost")}</Badge>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  STATUS BADGES & ICONS                                        */}
      {/* ============================================================ */}
      <Section title={t("status_system")}>
        <SubSection title={t("statusbadge_all_statuses")}>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              "active", "running", "paused", "idle", "archived", "planned",
              "achieved", "completed", "failed", "timed_out", "succeeded", "error",
              "pending_approval", "backlog", "todo", "in_progress", "in_review", "blocked",
              "done", "terminated", "cancelled", "pending", "revision_requested",
              "approved", "rejected",
            ].map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </SubSection>

        <SubSection title={t("issuestatusbadge_brand_chip_glyph_pap_75")}>
          <div className="flex items-center gap-2 flex-wrap">
            {["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"].map(
              (s) => (
                <IssueStatusBadge key={s} status={s} />
              )
            )}
          </div>
        </SubSection>

        <SubSection title={t("statusicon_interactive")}>
          <div className="flex items-center gap-3 flex-wrap">
            {["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"].map(
              (s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <StatusIcon status={s} />
                  <span className="text-xs text-muted-foreground">{s}</span>
                </div>
              )
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <StatusIcon status={status} onChange={setStatus} />
            <span className="text-sm">{t("click_the_icon_to_change_status_current")} {status})</span>
          </div>
        </SubSection>

        {/* PAP-411: PriorityIcon showcase gated behind SHOW_TASK_PRIORITY_UI per board decision. */}
        {SHOW_TASK_PRIORITY_UI && (
        <SubSection title={t("priorityicon_interactive")}>
          <div className="flex items-center gap-3 flex-wrap">
            {["critical", "high", "medium", "low"].map((p) => (
              <div key={p} className="flex items-center gap-1.5">
                <PriorityIcon priority={p} />
                <span className="text-xs text-muted-foreground">{p}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <PriorityIcon priority={priority} onChange={setPriority} />
            <span className="text-sm">{t("click_the_icon_to_change_current")} {priority})</span>
          </div>
        </SubSection>
        )}

        <SubSection title={t("agent_status_dots")}>
          <div className="flex items-center gap-4 flex-wrap">
            {(["running", "active", "paused", "error", "archived"] as const).map((label) => (
              <div key={label} className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`inline-flex h-full w-full rounded-full ${agentStatusDot[label] ?? agentStatusDotDefault}`} />
                </span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </SubSection>

        <SubSection title={t("run_invocation_badges")}>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              ["timer", "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"],
              ["assignment", "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"],
              ["on_demand", "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300"],
              ["automation", "bg-muted text-muted-foreground"],
            ].map(([label, cls]) => (
              <Badge variant="ghost" key={label} className={`px-1.5 text-(length:--text-nano) ${cls}`}>
                {label}
              </Badge>
            ))}
          </div>
        </SubSection>

        <SubSection title={t("issuereferencepill")}>
          <p className="text-xs text-muted-foreground">
            {t("used_wherever_a_task_is_referenced_in_markdown_t")} <code className="font-mono">status</code> {t("to_show_the_target_issues_state_at_a_glance_use")} <code className="font-mono">strikethrough</code> {t("for_removed_contexts")}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <IssueReferencePill issue={{ id: "demo-1", identifier: "PAP-123", title: t("identifier_only_no_status_yet") }} />
            <IssueReferencePill issue={{ id: "demo-2", identifier: "PAP-456", title: t("with_in_progress_status"), status: "in_progress" }} />
            <IssueReferencePill issue={{ id: "demo-3", identifier: "PAP-789", title: t("done_status"), status: "done" }} />
            <IssueReferencePill issue={{ id: "demo-4", identifier: "PAP-101", title: t("blocked_status"), status: "blocked" }} />
            <IssueReferencePill strikethrough issue={{ id: "demo-5", identifier: "PAP-202", title: t("removed_strikethrough"), status: "todo" }} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  AGENT CAPSULE                                                */}
      {/* ============================================================ */}
      <Section title={t("agent_capsule")}>
        <p className="text-sm text-muted-foreground max-w-prose">
          {t("the_brand_capsule_is_the_agent_motif_a_single_ag")}<code className="font-mono">{t("agent_na")}</code> →{" "}
          <code className="font-mono">{t("agent_nb")}</code>); <code className="font-mono">prefers-reduced-motion</code>{" "}
          {t("skips_the_liquid_rise_and_pulses_and_renders_the")}
        </p>
        <SubSection title={t("states")}>
          <div className="flex items-end gap-10">
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="slot" />
              <span className="text-xs text-muted-foreground">slot</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="configured" />
              <span className="text-xs text-muted-foreground">{t("zhPages.201582247500")}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" gradient={5} />
              <span className="text-xs text-muted-foreground">{t("zhPages.f6fc84c9f21c")}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" gradient={5} glow="blue" />
              <span className="text-xs text-muted-foreground">{t("online_blue_glow")}</span>
            </div>
          </div>
        </SubSection>
        <SubSection title={t("sizes")}>
          <div className="flex items-end gap-8">
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" size="sm" gradient={1} />
              <span className="text-xs text-muted-foreground">sm</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" size="md" gradient={4} />
              <span className="text-xs text-muted-foreground">md</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" size="lg" gradient={8} />
              <span className="text-xs text-muted-foreground">lg</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <AgentCapsule state="online" size={{ width: 28, height: 96 }} gradient={6} />
              <span className="text-xs text-muted-foreground">{t("custom_px")}</span>
            </div>
          </div>
        </SubSection>
        <SubSection title={t("gradients")}>
          <div className="flex items-end gap-3 flex-wrap">
            {Array.from({ length: AGENT_GRADIENT_COUNT }, (_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <AgentCapsule state="online" size="sm" gradient={i + 1} />
                <span className="text-(length:--text-nano) font-mono text-muted-foreground">{i + 1}</span>
              </div>
            ))}
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  FORM ELEMENTS                                                */}
      {/* ============================================================ */}
      <Section title={t("form_elements")}>
        <div className="grid gap-6 md:grid-cols-2">
          <SubSection title={t("input")}>
            <Input placeholder={t("default_input")} />
            <Input placeholder={t("disabled_input")} disabled className="mt-2" />
          </SubSection>

          <SubSection title={t("textarea")}>
            <Textarea placeholder={t("write_something")} />
          </SubSection>

          <SubSection title={t("checkbox_label")}>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="check1" defaultChecked />
                <Label htmlFor="check1">{t("checked_item")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="check2" />
                <Label htmlFor="check2">{t("unchecked_item")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="check3" disabled />
                <Label htmlFor="check3">{t("disabled_item")}</Label>
              </div>
            </div>
          </SubSection>

          <SubSection title={t("inline_editor")}>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("title_single_line")}</p>
                <InlineEditor
                  value={inlineTitle}
                  onSave={setInlineTitle}
                  as="h2"
                  className="text-xl font-bold"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("body_text_single_line")}</p>
                <InlineEditor
                  value={inlineText}
                  onSave={setInlineText}
                  as="p"
                  className="text-sm"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("description_multiline_auto_sizing")}</p>
                <InlineEditor
                  value={inlineDesc}
                  onSave={setInlineDesc}
                  as="p"
                  className="text-sm text-muted-foreground"
                  placeholder={t("add_a_description")}
                  multiline
                />
              </div>
            </div>
          </SubSection>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SELECT                                                       */}
      {/* ============================================================ */}
      <Section title={t("select_859822")}>
        <div className="grid gap-6 md:grid-cols-2">
          <SubSection title={t("default_size")}>
            <Select value={selectValue} onValueChange={setSelectValue}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("select_status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">{t("backlog")}</SelectItem>
                <SelectItem value="todo">{t("todo")}</SelectItem>
                <SelectItem value="in_progress">{t("in_progress")}</SelectItem>
                <SelectItem value="in_review">{t("in_review")}</SelectItem>
                <SelectItem value="done">{t("done")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("current_value")} {selectValue}</p>
          </SubSection>
          <SubSection title={t("small_trigger")}>
            <Select defaultValue="high">
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">{t("critical")}</SelectItem>
                <SelectItem value="high">{t("high")}</SelectItem>
                <SelectItem value="medium">{t("medium")}</SelectItem>
                <SelectItem value="low">{t("low")}</SelectItem>
              </SelectContent>
            </Select>
          </SubSection>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  DROPDOWN MENU                                                */}
      {/* ============================================================ */}
      <Section title={t("dropdown_menu")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {t("quick_actions")}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem>
              <Check className="h-4 w-4" />
              {t("mark_as_done")}
              <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <BookOpen className="h-4 w-4" />
              {t("open_docs")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={menuChecked}
              onCheckedChange={(value) => setMenuChecked(value === true)}
            >
              {t("watch_issue")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem variant="destructive">
              <Trash2 className="h-4 w-4" />
              {t("delete_issue")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      {/* ============================================================ */}
      {/*  POPOVER                                                      */}
      {/* ============================================================ */}
      <Section title={t("popover")}>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">{t("open_popover")}</Button>
          </PopoverTrigger>
          <PopoverContent className="space-y-2">
            <p className="text-sm font-medium">{t("agent_heartbeat")}</p>
            <p className="text-xs text-muted-foreground">
              {t("last_run_succeeded_24s_ago_next_timer_run_in_9m")}
            </p>
            <Button size="xs">{t("wake_now")}</Button>
          </PopoverContent>
        </Popover>
      </Section>

      {/* ============================================================ */}
      {/*  COLLAPSIBLE                                                  */}
      {/* ============================================================ */}
      <Section title={t("collapsible")}>
        <Collapsible open={collapsibleOpen} onOpenChange={setCollapsibleOpen} className="space-y-2">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              {collapsibleOpen ? t("hide") : t("show")} {t("advanced_filters")}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="rounded-md border border-border p-3">
            <div className="space-y-2">
              <Label htmlFor="owner-filter">{t("owner")}</Label>
              <Input id="owner-filter" placeholder={t("filter_by_agent_name")} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Section>

      {/* ============================================================ */}
      {/*  SHEET                                                        */}
      {/* ============================================================ */}
      <Section title={t("sheet")}>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">{t("open_side_panel")}</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>{t("issue_properties")}</SheetTitle>
              <SheetDescription>{t("edit_metadata_without_leaving_the_current_page")}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <div className="space-y-1">
                <Label htmlFor="sheet-title">{t("title")}</Label>
                <Input id="sheet-title" defaultValue="Improve onboarding docs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sheet-description">{t("description")}</Label>
                <Textarea id="sheet-description" defaultValue="Capture setup pitfalls and screenshots." />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline">{t("cancel")}</Button>
              <Button>{t("save")}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Section>

      {/* ============================================================ */}
      {/*  SCROLL AREA                                                  */}
      {/* ============================================================ */}
      <Section title={t("scroll_area")}>
        <ScrollArea className="h-36 rounded-md border border-border">
          <div className="space-y-2 p-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border p-2 text-sm">
                {t("heartbeat_run")}{i + 1}{t("completed_successfully")}
              </div>
            ))}
          </div>
        </ScrollArea>
      </Section>

      {/* ============================================================ */}
      {/*  COMMAND                                                      */}
      {/* ============================================================ */}
      <Section title={t("command_cmdk")}>
        <div className="rounded-md border border-border">
          <Command>
            <CommandInput placeholder={t("type_a_command_or_search")} />
            <CommandList>
              <CommandEmpty>{t("no_results_found")}</CommandEmpty>
              <CommandGroup heading={t("pages")}>
                <CommandItem>
                  <LayoutDashboard className="h-4 w-4" />
                  {t("dashboard")}
                </CommandItem>
                <CommandItem>
                  <CircleDot className="h-4 w-4" />
                  {t("issues")}
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading={t("actions")}>
                <CommandItem>
                  <CommandIcon className="h-4 w-4" />
                  {t("open_command_palette")}
                </CommandItem>
                <CommandItem>
                  <Plus className="h-4 w-4" />
                  {t("create_new_issue")}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  BREADCRUMB                                                   */}
      {/* ============================================================ */}
      <Section title={t("breadcrumb")}>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">{t("projects")}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">{t("paperclip_app")}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("issue_list")}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Section>

      {/* ============================================================ */}
      {/*  CARDS                                                        */}
      {/* ============================================================ */}
      <Section title={t("cards")}>
        <SubSection title={t("standard_card")}>
          <Card>
            <CardHeader>
              <CardTitle>{t("card_title")}</CardTitle>
              <CardDescription>{t("card_description_with_supporting_text")}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{t("card_content_goes_here_this_is_the_main_body_are")}</p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">{t("action")}</Button>
              <Button variant="outline" size="sm">{t("cancel")}</Button>
            </CardFooter>
          </Card>
        </SubSection>

        <SubSection title={t("metric_cards")}>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard icon={Bot} value={12} label={t("active_agents")} description={t("3_this_week")} />
            <MetricCard icon={CircleDot} value={48} label={t("open_issues")} />
            <MetricCard icon={DollarSign} value="$1,234" label={t("monthly_cost")} description={t("under_budget")} />
            <MetricCard icon={Zap} value="99.9%" label={t("uptime")} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TABS                                                         */}
      {/* ============================================================ */}
      <Section title={t("tabs")}>
        <SubSection title={t("default_pill_variant")}>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
              <TabsTrigger value="runs">{t("runs")}</TabsTrigger>
              <TabsTrigger value="config">{t("config")}</TabsTrigger>
              <TabsTrigger value="costs">{t("costs")}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <p className="text-sm text-muted-foreground py-4">{t("overview_tab_content")}</p>
            </TabsContent>
            <TabsContent value="runs">
              <p className="text-sm text-muted-foreground py-4">{t("runs_tab_content")}</p>
            </TabsContent>
            <TabsContent value="config">
              <p className="text-sm text-muted-foreground py-4">{t("config_tab_content")}</p>
            </TabsContent>
            <TabsContent value="costs">
              <p className="text-sm text-muted-foreground py-4">{t("costs_tab_content")}</p>
            </TabsContent>
          </Tabs>
        </SubSection>

        <SubSection title={t("line_variant")}>
          <Tabs defaultValue="summary">
            <TabsList variant="line">
              <TabsTrigger value="summary">{t("summary")}</TabsTrigger>
              <TabsTrigger value="details">{t("details")}</TabsTrigger>
              <TabsTrigger value="comments">{t("comments_fce06e")}</TabsTrigger>
            </TabsList>
            <TabsContent value="summary">
              <p className="text-sm text-muted-foreground py-4">{t("summary_content_with_underline_tabs")}</p>
            </TabsContent>
            <TabsContent value="details">
              <p className="text-sm text-muted-foreground py-4">{t("details_content")}</p>
            </TabsContent>
            <TabsContent value="comments">
              <p className="text-sm text-muted-foreground py-4">{t("comments_content")}</p>
            </TabsContent>
          </Tabs>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  ENTITY ROWS                                                  */}
      {/* ============================================================ */}
      <Section title={t("entity_rows")}>
        <div className="border border-border rounded-md">
          <EntityRow
            leading={
              <>
                <StatusIcon status="in_progress" />
                {/* PAP-411: PriorityIcon hidden behind SHOW_TASK_PRIORITY_UI. */}
                {SHOW_TASK_PRIORITY_UI && <PriorityIcon priority="high" />}
              </>
            }
            identifier="PAP-001"
            title={t("implement_authentication_flow")}
            subtitle={t("responsible_agent_alpha")}
            trailing={<IssueStatusBadge status="in_progress" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="done" />
                {SHOW_TASK_PRIORITY_UI && <PriorityIcon priority="medium" />}
              </>
            }
            identifier="PAP-002"
            title={t("set_up_ci_cd_pipeline")}
            subtitle={t("completed_2_days_ago")}
            trailing={<IssueStatusBadge status="done" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="todo" />
                {SHOW_TASK_PRIORITY_UI && <PriorityIcon priority="low" />}
              </>
            }
            identifier="PAP-003"
            title={t("write_api_documentation")}
            trailing={<IssueStatusBadge status="todo" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="blocked" />
                {SHOW_TASK_PRIORITY_UI && <PriorityIcon priority="critical" />}
              </>
            }
            identifier="PAP-004"
            title={t("deploy_to_production")}
            subtitle={t("blocked_by_pap_001")}
            trailing={<IssueStatusBadge status="blocked" />}
            selected
          />
        </div>
        <SubSection title={t("membership_action")}>
          <div className="border border-border rounded-md">
            <EntityRow
              title={t("joined_resource")}
              subtitle={t("hover_or_focus_the_row_to_reveal_the_reserved_ac")}
              className="group"
              trailing={
                <MembershipAction
                  state="joined"
                  resourceName="Joined resource"
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
            <EntityRow
              title={t("left_resource")}
              subtitle={t("persistent_action_with_dimmed_row_content")}
              className="group text-foreground/55"
              trailing={
                <MembershipAction
                  state="left"
                  resourceName="Left resource"
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
            <EntityRow
              title={t("leaving_resource")}
              subtitle={t("disabled_while_the_optimistic_mutation_is_pendin")}
              className="group text-foreground/55"
              trailing={
                <MembershipAction
                  state="left"
                  pending
                  pendingState="left"
                  resourceName="Leaving resource"
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
            <EntityRow
              title={t("joining_resource")}
              subtitle={t("the_target_state_is_visible_immediately_while_th")}
              className="group"
              trailing={
                <MembershipAction
                  state="joined"
                  pending
                  pendingState="joined"
                  resourceName="Joining resource"
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  FILTER BAR                                                   */}
      {/* ============================================================ */}
      <Section title={t("filter_bar")}>
        <FilterBar
          filters={filters}
          onRemove={(key) => setFilters((f) => f.filter((x) => x.key !== key))}
          onClear={() => setFilters([])}
        />
        {filters.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setFilters([
                { key: "status", label: t("status"), value: t("active") },
                // PAP-411: priority filter demo row suppressed while SHOW_TASK_PRIORITY_UI is off.
                ...(SHOW_TASK_PRIORITY_UI
                  ? [{ key: "priority", label: t("priority"), value: t("high") } as FilterValue]
                  : []),
              ])
            }
          >
            {t("reset_filters")}
          </Button>
        )}
      </Section>

      {/* ============================================================ */}
      {/*  AVATARS                                                      */}
      {/* ============================================================ */}
      <Section title={t("avatars")}>
        <SubSection title={t("sizes")}>
          <div className="flex items-center gap-3">
            <Avatar size="sm"><AvatarFallback>{t("sm")}</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>{t("df")}</AvatarFallback></Avatar>
            <Avatar size="lg"><AvatarFallback>{t("lg")}</AvatarFallback></Avatar>
          </div>
        </SubSection>

        <SubSection title={t("group")}>
          <AvatarGroup>
            <Avatar><AvatarFallback>A1</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>A2</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>A3</AvatarFallback></Avatar>
            <AvatarGroupCount>+5</AvatarGroupCount>
          </AvatarGroup>
        </SubSection>
      </Section>

      <Section title={t("app_logos")}>
        <SubSection title={t("official_marks_and_runtime_fallback")}>
          <div className="flex items-center gap-3">
            <AppLogo
              name="Notion"
              logoUrl="/brands/apps/notion.svg"
              darkLogoUrl="/brands/apps/notion-dark.svg"
              size={36}
            />
            <AppLogo name="Jira" logoUrl="/brands/apps/jira.svg" darkLogoUrl="/brands/apps/jira-dark.svg" size={44} />
            <AppLogo name="Fallback" logoUrl="/brands/apps/does-not-exist.svg" size={36} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  IDENTITY                                                     */}
      {/* ============================================================ */}
      <Section title={t("identity")}>
        <SubSection title={t("sizes")}>
          <div className="flex items-center gap-6">
            <Identity name="Agent Alpha" size="sm" />
            <Identity name="Agent Alpha" />
            <Identity name="Agent Alpha" size="lg" />
          </div>
        </SubSection>

        <SubSection title={t("initials_derivation")}>
          <div className="flex flex-col gap-2">
            <Identity name="CEO Agent" size="sm" />
            <Identity name="Alpha" size="sm" />
            <Identity name="Quality Assurance Lead" size="sm" />
          </div>
        </SubSection>

        <SubSection title={t("custom_initials")}>
          <Identity name="Backend Service" initials="BS" size="sm" />
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TOOLTIPS                                                     */}
      {/* ============================================================ */}
      <Section title={t("tooltips")}>
        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">{t("hover_me")}</Button>
            </TooltipTrigger>
            <TooltipContent>{t("this_is_a_tooltip")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm"><Settings /></Button>
            </TooltipTrigger>
            <TooltipContent>{t("settings_")}</TooltipContent>
          </Tooltip>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  DIALOG                                                       */}
      {/* ============================================================ */}
      <Section title={t("dialog")}>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t("open_dialog")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("dialog_title")}</DialogTitle>
              <DialogDescription>
                {t("this_is_a_sample_dialog_showing_the_standard_lay")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t("name")}</Label>
                <Input placeholder={t("enter_a_name")} className="mt-1.5" />
              </div>
              <div>
                <Label>{t("description")}</Label>
                <Textarea placeholder={t("describe")} className="mt-1.5" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline">{t("cancel")}</Button>
              <Button>{t("save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      {/* ============================================================ */}
      {/*  EMPTY STATE                                                  */}
      {/* ============================================================ */}
      <Section title={t("empty_state")}>
        <div className="border border-border rounded-md">
          <EmptyState
            icon={Inbox}
            message={t("no_items_to_show_create_your_first_one_to_get_st")}
            action={t("create_item")}
            onAction={() => {}}
          />
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PROGRESS BARS                                                */}
      {/* ============================================================ */}
      <Section title={t("progress_bars_budget")}>
        <div className="space-y-3">
          {[
            { label: t("under_budget_40"), pct: 40, color: "bg-green-400" },
            { label: t("warning_75"), pct: 75, color: "bg-yellow-400" },
            { label: t("over_budget_95"), pct: 95, color: "bg-red-400" },
          ].map(({ label, pct, color }) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-mono">{pct}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-(--tp-width-background-color) duration-150 ${color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  LOG VIEWER                                                   */}
      {/* ============================================================ */}
      <Section title={t("log_viewer")}>
        <div className="bg-neutral-950 rounded-lg p-3 font-mono text-xs max-h-80 overflow-y-auto">
          <div className="text-foreground">{t("12_00_01_info_agent_started_successfully")}</div>
          <div className="text-foreground">{t("12_00_02_info_processing_task_pap_001")}</div>
          <div className="text-yellow-400">{t("12_00_05_warn_rate_limit_approaching_80")}</div>
          <div className="text-foreground">{t("12_00_08_info_task_pap_001_completed")}</div>
          <div className="text-red-400">{t("12_00_12_error_connection_timeout_to_upstream_se")}</div>
          <div className="text-blue-300">{t("12_00_12_sys_retrying_connection_in_5s")}</div>
          <div className="text-foreground">{t("12_00_17_info_reconnected_successfully")}</div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 animate-pulse" />
              <span className="inline-flex h-full w-full rounded-full bg-blue-500" />
            </span>
            <span className="text-blue-600 dark:text-blue-400">{t("live")}</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PROPERTY ROW PATTERN                                         */}
      {/* ============================================================ */}
      <Section title={t("property_row_pattern")}>
        <div className="border border-border rounded-md p-4 space-y-1 max-w-sm">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">{t("status")}</span>
            <StatusBadge status="active" />
          </div>
          {/* PAP-411: priority metadata row hidden behind SHOW_TASK_PRIORITY_UI. */}
          {SHOW_TASK_PRIORITY_UI && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">{t("priority")}</span>
              <PriorityIcon priority="high" />
            </div>
          )}
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">{t("responsible")}</span>
            <div className="flex items-center gap-1.5">
              <Avatar size="sm"><AvatarFallback>A</AvatarFallback></Avatar>
              <span className="text-xs">{t("agent_alpha")}</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">{t("created")}</span>
            <span className="text-xs">{t("jan_15_2025")}</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  NAVIGATION PATTERNS                                          */}
      {/* ============================================================ */}
      <Section title={t("navigation_patterns")}>
        <SubSection title={t("sidebar_nav_items")}>
          <Card className="block w-60 p-3 space-y-0.5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-accent text-accent-foreground">
              <LayoutDashboard className="h-4 w-4" />
              {t("dashboard")}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground cursor-pointer">
              <CircleDot className="h-4 w-4" />
              {t("issues")}
              <Badge variant="ghost" className="ml-auto bg-primary text-primary-foreground px-1.5">
                12
              </Badge>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground cursor-pointer">
              <Bot className="h-4 w-4" />
              {t("agents")}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground cursor-pointer">
              <Hexagon className="h-4 w-4" />
              {t("projects")}
            </div>
          </Card>
        </SubSection>

        <SubSection title={t("view_toggle")}>
          <div className="flex items-center border border-border rounded-md w-fit">
            <button className="px-3 py-1.5 text-xs font-medium bg-accent text-foreground rounded-l-md">
              <ListTodo className="h-3.5 w-3.5 inline mr-1" />
              {t("list")}
            </button>
            <button className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/50 rounded-r-md">
              <Target className="h-3.5 w-3.5 inline mr-1" />
              {t("org")}
            </button>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  GROUPED LIST (Issues pattern)                                */}
      {/* ============================================================ */}
      <Section title={t("grouped_list_issues_pattern")}>
        <div>
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-t-md">
            <StatusIcon status="in_progress" />
            <span className="text-sm font-medium">{t("in_progress")}</span>
            <span className="text-xs text-muted-foreground ml-1">2</span>
          </div>
          <div className="border border-border rounded-b-md">
            {/* PAP-411: leading PriorityIcon hidden behind SHOW_TASK_PRIORITY_UI. */}
            <EntityRow
              leading={SHOW_TASK_PRIORITY_UI ? <PriorityIcon priority="high" /> : undefined}
              identifier="PAP-101"
              title={t("build_agent_heartbeat_system")}
              onClick={() => {}}
            />
            <EntityRow
              leading={SHOW_TASK_PRIORITY_UI ? <PriorityIcon priority="medium" /> : undefined}
              identifier="PAP-102"
              title={t("add_cost_tracking_dashboard")}
              onClick={() => {}}
            />
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  COMMENT THREAD PATTERN                                       */}
      {/* ============================================================ */}
      <Section title={t("comment_thread_pattern")}>
        <div className="space-y-3 max-w-2xl">
          <h3 className="text-sm font-semibold">{t("comments_2")}</h3>
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">{t("agent_5ce2e6")}</span>
                <span className="text-xs text-muted-foreground">{t("jan_15_2025")}</span>
              </div>
              <p className="text-sm">{t("started_working_on_the_authentication_module_wil")}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">{t("human")}</span>
                <span className="text-xs text-muted-foreground">{t("jan_16_2025")}</span>
              </div>
              <p className="text-sm">{t("api_keys_have_been_added_to_the_vault_please_pro")}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Textarea placeholder={t("leave_a_comment")} rows={3} />
            <Button size="sm">{t("comment")}</Button>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  COST TABLE PATTERN                                           */}
      {/* ============================================================ */}
      <Section title={t("cost_table_pattern")}>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-accent/20">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("model")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("tokens")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("cost")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-3 py-2">claude-sonnet-4-20250514</td>
                <td className="px-3 py-2 font-mono">1.2M</td>
                <td className="px-3 py-2 font-mono">$18.00</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2">claude-haiku-4-20250506</td>
                <td className="px-3 py-2 font-mono">500k</td>
                <td className="px-3 py-2 font-mono">$1.25</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">{t("total")}</td>
                <td className="px-3 py-2 font-mono">1.7M</td>
                <td className="px-3 py-2 font-mono font-medium">$19.25</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SKELETONS                                                    */}
      {/* ============================================================ */}
      <Section title={t("skeletons")}>
        <SubSection title={t("individual")}>
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-full max-w-sm" />
            <Skeleton className="h-20 w-full" />
          </div>
        </SubSection>

        <SubSection title={t("page_skeleton_list")}>
          <div className="border border-border rounded-md p-4">
            <PageSkeleton variant="list" />
          </div>
        </SubSection>

        <SubSection title={t("page_skeleton_detail")}>
          <div className="border border-border rounded-md p-4">
            <PageSkeleton variant="detail" />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  SEPARATOR                                                    */}
      {/* ============================================================ */}
      <Section title={t("separator")}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("horizontal")}</p>
          <Separator />
          <div className="flex items-center gap-4 h-8">
            <span className="text-sm">{t("left")}</span>
            <Separator orientation="vertical" />
            <span className="text-sm">{t("right")}</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  ICON REFERENCE                                               */}
      {/* ============================================================ */}
      {/*  TEAM CATALOG                                                 */}
      {/* ============================================================ */}
      <Section title={t("team_catalog")}>
        <p className="text-sm text-muted-foreground">
          {t("components_from_the_team_catalog_browse_install")}<code className="font-mono text-xs">/teams-catalog</code>{t("fixtures_are_shared_with_the_storybook_stories")}
        </p>

        <SubSection title={t("teamrow_browse_list")}>
          <div className="w-(--sz-28rem) rounded-md border border-border">
            <div className="px-3 py-2 text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">
              {t("bundled_1")}
            </div>
            <TeamRow team={sampleTeam} selected onSelect={() => {}} />
            <div className="px-3 py-2 text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">
              {t("optional_2")}
            </div>
            <TeamRow team={optionalTeam} selected={false} onSelect={() => {}} />
            <div className="px-3 py-2 text-(length:--text-micro) font-semibold uppercase tracking-wide text-muted-foreground">
              {t("installed_2")}
            </div>
            <TeamRow team={sampleTeam} selected={false} onSelect={() => {}} installed={outOfDateInstalledState} />
            <TeamRow team={warnTeam} selected={false} onSelect={() => {}} installed={currentInstalledState} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("installed_teams_collapse_under")} <code className="font-mono">{t("installed_n")}</code>{t("an_out_of_date_install_server")} <code className="font-mono">{t("originhash")}</code> {t("catalog_5502fc")} <code className="font-mono">{t("contenthash")}</code>{t("shows_the_amber")} <code className="font-mono">↑</code> {t("badge_pap_10256")}
          </p>
        </SubSection>

        <SubSection title={t("teamcard_onboarding_grid")}>
          <p className="text-xs text-muted-foreground">
            {t("square_tile_for_the_onboarding_pick_a_starter_te")}{" "}
            <code className="font-mono">{t("ring_2_ring_ring")}</code>{t("zhPages.9441a41f2111")}{" "}
            <code className="font-mono">{t("useinstallteamcatalogentry")}</code> {t("simplified_flow")}
          </p>
          <TeamCardShowcase />
        </SubSection>

        <SubSection title={t("teamhierarchypreview")}>
          <div className="max-w-md">
            <TeamHierarchyPreview team={sampleTeam} />
          </div>
        </SubSection>

        <SubSection title={t("requiredskillslist")}>
          <div className="max-w-xl">
            <RequiredSkillsList skills={sampleTeam.requiredSkills} />
          </div>
        </SubSection>

        <SubSection title={t("envinputslist")}>
          <div className="max-w-xl">
            <EnvInputsList inputs={sampleTeam.envInputs} />
          </div>
        </SubSection>

        <SubSection title={t("externalsourceslist")}>
          <div className="max-w-xl">
            <ExternalSourcesList sources={sampleTeam.sourceRefs} />
          </div>
        </SubSection>

        <SubSection title={t("source_policy_step_stepsourcepolicy")}>
          <div className="max-w-xl rounded-md border border-border p-4">
            <StepSourcePolicy
              team={warnTeam}
              allowExternalSources={allowExternal}
              allowUnpinnedOptionalSources={allowUnpinned}
              allowLocalPathSources={allowLocalPath}
              onChange={(key, value) => {
                if (key === "external") setAllowExternal(value);
                if (key === "unpinned") setAllowUnpinned(value);
                if (key === "localPath") setAllowLocalPath(value);
              }}
            />
          </div>
        </SubSection>

        <SubSection title={t("skill_plan_step_stepskillplan")}>
          <div className="max-w-xl rounded-md border border-border p-4">
            <StepSkillPlan team={sampleTeam} preparations={sampleSkillPreparations} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      <Section title={t("common_icons_lucide")}>
        <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
          {[
            [t("inbox"), Inbox],
            [t("listtodo"), ListTodo],
            [t("circledot"), CircleDot],
            [t("hexagon"), Hexagon],
            [t("target"), Target],
            [t("layoutdashboard"), LayoutDashboard],
            [t("bot"), Bot],
            [t("dollarsign"), DollarSign],
            [t("history"), History],
            [t("search"), Search],
            [t("plus"), Plus],
            [t("trash2"), Trash2],
            [t("settings_"), Settings],
            [t("user"), User],
            [t("mail"), Mail],
            [t("upload"), Upload],
            [t("zap"), Zap],
          ].map(([name, Icon]) => {
            const LucideIcon = Icon as React.FC<{ className?: string }>;
            return (
              <div key={name as string} className="flex flex-col items-center gap-1.5 p-2">
                <LucideIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-(length:--text-nano) text-muted-foreground font-mono">{name as string}</span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  KEYBOARD SHORTCUTS                                           */}
      {/* ============================================================ */}
      <Section title={t("keyboard_shortcuts_b46575")}>
        <div className="border border-border rounded-md divide-y divide-border text-sm">
          {[
            [t("cmd_k_ctrl_k"), t("open_command_palette_4a2f60")],
            ["C", t("new_issue_outside_inputs")],
            ["[", t("toggle_sidebar_dffc47")],
            ["]", t("toggle_properties_panel")],

            [t("cmd_enter_ctrl_enter"), t("submit_markdown_comment")],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between px-4 py-2">
              <span className="text-muted-foreground">{desc}</span>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-muted rounded border border-border">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t("issue_output_surface")}>
        <SubSection title={t("multiple_outputs_primary_video_also_produced")}>
          <IssueOutputSection workProducts={DESIGN_GUIDE_OUTPUTS} />
        </SubSection>
        <SubSection title={t("degraded_output_invalid_failed_attachment_metada")}>
          <IssueOutputSection workProducts={DESIGN_GUIDE_DEGRADED_OUTPUTS} />
        </SubSection>
        <SubSection title={t("empty_state_41dac3")}>
          <p className="text-xs text-muted-foreground">
            {t("when_an_issue_has_produced_no_artifact_work_prod")}
          </p>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TOOLS & ACCESS (PAP-10389)                                   */}
      {/* ============================================================ */}
      <Section title={t("tools_access")}>
        <SubSection title={t("enforcementbanner_default_denied_detected")}>
          <div className="space-y-3">
            <EnforcementBanner companyId="" forceVariant="default" recentDenialCount={0} />
            <EnforcementBanner companyId="" forceVariant="denied-detected" recentDenialCount={3} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("persistent_at_the_top_of_the_tools_access_surfac")} <code>denied-detected</code> {t("when_governed_tool_calls_were_denied_or_failed_i")}
          </p>
        </SubSection>

        <SubSection title={t("enforcementbanner_presentational_tones_info_warn")}>
          <div className="space-y-3">
            <EnforcementBanner
              tone="info"
              title={t("effective_access_server_resolved")}
              body={t("this_is_exactly_what_the_tool_gateway_will_accep")}
            />
            <EnforcementBanner
              tone="warning"
              title={t("local_stdio_is_local_code_execution_not_a_securi")}
              body={t("a_local_stdio_slot_runs_with_the_orchestrators_p")}
            />
            <EnforcementBanner
              tone="error"
              title={t("runtime_failed_closed")}
              body={t("the_supervisor_is_restarting_attempt_2_3_the_gat")}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("static_governance_copy_with_a_tone_used_for_the")} <code>title</code>/<code>body</code> {t("and_an_optional")}{" "}
            <code>icon</code>.
          </p>
        </SubSection>

        <SubSection title={t("action_approval_card_pending_stale_surfaces_11_1")}>
          <div className="grid gap-4 lg:grid-cols-2">
            <ActionCard
              toolName="slack.post_message"
              risk="medium"
              isWrite
              binding={{
                application: t("slack"),
                manifestVersion: "2.4.1",
                connection: "https://slack.com/api · acme-workspace",
                catalogSha256: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
                payloadSha256: "sha256:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
              }}
              input={{ channel: "#launch", text: t("deploy_v2_is_live"), unfurl_links: false }}
              reason="This tool can write to your workspace, so a human signs off before the agent posts."
              policyNumber={7}
              expiresInLabel={t("expires_in_23h_51m")}
            />
            <ActionCard
              variant="stale"
              toolName="slack.post_message"
              risk="medium"
              isWrite
              binding={{
                application: t("slack"),
                manifestVersion: "2.4.1",
                connection: "https://slack.com/api · acme-workspace",
                catalogSha256: "sha256:7d793037a0760186574b0282f2f435e7a4b1b2b0b822cd15d6c15b0f00a0e3f1",
                previousCatalogSha256: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
                payloadSha256: "sha256:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
              }}
              input={{ channel: "#launch", text: t("deploy_v2_is_live"), unfurl_links: false }}
              reason="This tool can write to your workspace, so a human signs off before the agent posts."
              policyNumber={7}
              expiresInLabel={t("expires_in_18h_02m")}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("signed_payload_sha256_expiry_surface_on_every_va")}{" "}
            <code>stale</code> {t("variant_tints_the_border_amber_banners_the_catal")} <code>{t("approve")}</code> {t("disabled_until_the_request_is_re_issued")}
          </p>
        </SubSection>

        <SubSection title={t("action_approval_card_mobile_390_844_surface_99")}>
          <div className="w-(--sz-390px) max-w-full rounded-xl border border-border bg-background p-3">
            <ActionCardMobile
              toolName="slack.post_message"
              risk="medium"
              isWrite
              binding={{
                application: t("slack"),
                manifestVersion: "2.4.1",
                connection: "https://slack.com/api · acme-workspace",
                catalogSha256: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
                payloadSha256: "sha256:2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae",
              }}
              input={{ channel: "#launch", text: t("deploy_v2_is_live") }}
              reason="This tool can write to your workspace, so a human signs off before the agent posts."
              policyNumber={7}
              expiresInLabel={t("expires_in_23h_51m")}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("identical_content_the_three_buttons_stack_full_w")}
          </p>
        </SubSection>

        <SubSection title={t("bindingstable_reused_in_the_audit_row_drilldown")}>
          <BindingsTable
            rows={[
              { label: t("application"), value: t("slack_manifest_v2_4_1") },
              { label: t("connection"), value: "https://slack.com/api · acme-workspace", mono: true },
              { label: t("catalog"), value: "sha256:9f86d081…f00a08", mono: true },
              { label: t("payload"), value: "sha256:2c26b46b…66e7ae", mono: true },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("two_column_key_value_block_with_mono_values_live")} <code>{t("actioncard")}</code> {t("and_is_reused_standalone_in_the_audit_row_drilld")}
          </p>
        </SubSection>

        <SubSection title={t("tool_access_status_keys_statusbadge")}>
          <div className="flex flex-wrap items-center gap-2">
            {[
              "allowed", "denied", "block", "require-approval", "redacted", "rate-limit",
              "deferred", "hidden", "quarantined", "healthy", "degraded", "runtime-error", "unchecked",
            ].map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("policy_decisions_connection_runtime_health_and_c")}{" "}
            <code>{t("statusbadge")}</code> {t("keys_defined_in")} <code>{t("lib_status_colors")}</code>.
          </p>
        </SubSection>

        <SubSection title={t("emptystate_canonical_with_description_action")}>
          <EmptyState
            icon={Inbox}
            message={t("no_connections_yet")}
            description={t("add_a_connection_to_an_application_to_configure")}
            action={t("new_connection")}
            onAction={() => {}}
          />
        </SubSection>
      </Section>

      <Section title={t("composio_services")}>
        <p className="text-sm text-muted-foreground">
          {t("a_broker_connection_composio_fronts_many_service")} <code>attention</code> {t("state_alongside_the_three_the_design_asks_for_an")}
        </p>
        <SubSection title={t("row_states")}>
          <ServicesList
            rows={DESIGN_GUIDE_COMPOSIO_ROWS}
            busySlug={null}
            onConnect={() => {}}
            onRecheck={() => {}}
            onDisconnect={() => {}}
          />
        </SubSection>
        <SubSection title={t("busy_row")}>
          <ServicesList
            rows={[DESIGN_GUIDE_COMPOSIO_ROWS[2]!]}
            busySlug={DESIGN_GUIDE_COMPOSIO_ROWS[2]!.toolkitSlug}
            onConnect={() => {}}
            onRecheck={() => {}}
            onDisconnect={() => {}}
          />
        </SubSection>
        <SubSection title={t("provenance_chip")}>
          <p className="mb-2 text-xs text-muted-foreground">
            {t("shown_wherever_a_brokered_child_connection_appea")}
          </p>
          <div className="flex items-center gap-3">
            <ComposioProvenanceChip
              connection={{
                config: { provider: "composio", parentConnectionId: "parent-1", toolkitSlug: "github" },
              }}
            />
            <ComposioProvenanceChip
              connection={{ config: { provider: "composio", toolkitSlug: "gmail" } }}
            />
          </div>
        </SubSection>
      </Section>

      <Section title={t("environment_variables_editor")}>
        <p className="text-sm text-muted-foreground">
          {t("reusable_env_var_editor_agents_projects_environm")} <span className="font-mono">{t("product_environment_variables_editor")}</span> {t("stories_for_all_10_states")}
        </p>
        <EnvironmentVariablesEditorShowcase />
      </Section>

      <Section title={t("connection_intent")}>
        <p className="text-sm text-muted-foreground">
          {t("the_task_card_is_the_dialog_host_for_the_shared")}
        </p>
        <div className="grid gap-4 xl:grid-cols-3">
          <IssueThreadInteractionCard
            interaction={pendingConnectionIntentInteraction}
            currentUserId={issueThreadInteractionFixtureMeta.currentUserId}
          />
          <IssueThreadInteractionCard
            interaction={retryConnectionIntentInteraction}
            currentUserId={issueThreadInteractionFixtureMeta.currentUserId}
          />
          <IssueThreadInteractionCard
            interaction={connectedConnectionIntentInteraction}
            currentUserId={issueThreadInteractionFixtureMeta.currentUserId}
          />
        </div>
      </Section>

      <Section title={t("resizable_panels")}>
        <p className="text-sm text-muted-foreground">
          {t("design_system_wrapper_over")} <span className="font-mono">react-resizable-panels</span>{" "}
          {t("skill_studio_d2_drag_a_handle_to_resize_panels_a")}<span className="font-mono">{t("minsize_240px")}</span>{t("constraints_and_the_middle_panel_is_collapsible")}
        </p>
        <div className="h-48 max-w-2xl overflow-hidden rounded-md border border-border">
          <ResizablePanelGroup>
            <ResizablePanel id="a" minSize="120px" className="bg-muted/30">
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {t("panel_a")}
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="b" minSize="120px" collapsible collapsedSize="40px" className="bg-muted/10">
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {t("panel_b_collapsible")}
              </div>
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="c" minSize="120px" className="bg-muted/30">
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {t("panel_c")}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  INLINE BANNER + BUILT-IN AGENTS                              */}
      {/* ============================================================ */}
      <Section title={t("inline_banner")}>
        <p className="text-sm text-muted-foreground">
          {t("token_backed_full_width_notice")}<span className="font-mono">{t("brandbanner")}</span> {t("tones_use")}{" "}
          <span className="font-mono">{t("zhPages.06271baf4953")}</span> {t("for_provenance_context_and")}{" "}
          <span className="font-mono">{t("zhPages.4bd9354bb652")}</span> {t("for_paused_attention_supports_an_optional_bold_t")}{" "}
          <span className="font-mono">{t("bg_yellow")}</span>/<span className="font-mono">{t("bg_blue")}</span>{" "}{t("zhPages.20f31d31bfdc")}</p>
        <div className="space-y-3">
          <InlineBanner
            tone="info"
            title={t("built_in_agent")}
            actions={<Button variant="outline" size="sm">{t("reset_to_defaults")}</Button>}
          >
            {t("ships_with_paperclip_and_powers")} <strong>{t("briefs")}</strong>{t("zhPages.07b1fed81c37")}</InlineBanner>
          <InlineBanner
            tone="warning"
            title={t("briefs_is_paused")}
            actions={
              <>
                <Button variant="ghost" size="sm">{t("view_agent")}</Button>
                <Button size="sm">{t("resume_agent")}</Button>
              </>
            }
          >
            {t("its_built_in_agent_was_paused_2_days_ago_so_new")}
          </InlineBanner>
          <InlineBanner
            tone="danger"
            title={t("summary_generation_failed_80317a")}
            actions={<Button size="sm">{t("retry")}</Button>}
          >
            {t("the_linked_issue_reached_a_terminal_state_before")}
          </InlineBanner>
          <InlineBanner tone="info" compact>
            {t("compact_variant_for_embedding_inside_dialogs_and")}
          </InlineBanner>
        </div>
      </Section>

      <Section title={t("built_in_agent_lifecycle_chips")}>
        <p className="text-sm text-muted-foreground">
          {t("a_derived_lifecycle_chip_amber_for_attention_sta")}{" "}
          <span className="font-mono">needs_setup</span> / <span className="font-mono">pending_approval</span>.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <BuiltInLifecycleChip status="needs_setup" />
          <BuiltInLifecycleChip status="pending_approval" />
          <BuiltInLifecycleChip status="needs_setup" compact />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          <span className="font-mono">{t("builtinagentgate_agentkey")}</span>{t("zhPages.52c3473e4df8")}{" "}
          <span className="font-mono">{t("pageskeleton")}</span> + <span className="font-mono">{t("emptystate")}</span>{" "}
          + <span className="font-mono">{t("inlinebanner")}</span> {t("to_render_the_loading_setup_pending_approval_pau")}
        </p>
      </Section>
    </div>
  );
}
