import { t } from "@/i18n";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  GITHUB_REVIEW_EVENTS,
  type GitHubChatConfiguration,
  type GitHubReviewPolicy,
  type GitHubAllowedPerson,
} from "@paperclipai/shared";
import { accessApi } from "@/api/access";
import { chatEndpointsApi } from "@/api/chatEndpoints";
import { githubChatApi } from "@/api/githubChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Link } from "@/lib/router";

export const githubSelectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const eventLabels = {
  opened: "New pull request",
  synchronize: "Updated commits",
  reopened: "Reopened",
  ready_for_review: "Ready for review",
  mention: "Mention",
  comment: "Follow-up comment",
};
export function GitHubToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <ToggleSwitch
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}
export function GitHubPolicyEditor({
  policy,
  onChange,
}: {
  policy: GitHubReviewPolicy;
  onChange: (policy: GitHubReviewPolicy) => void;
}) {
  const [prompt, setPrompt] =
    useState<(typeof GITHUB_REVIEW_EVENTS)[number]>("opened");
  const set = <K extends keyof GitHubReviewPolicy>(
    key: K,
    value: GitHubReviewPolicy[K],
  ) => onChange({ ...policy, [key]: value });
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="github-invocation">{t("stability.e10e8e099769", { defaultValue: "When should this agent review?" })}</Label>
        <select
          id="github-invocation"
          className={githubSelectClass}
          value={policy.invocation}
          onChange={(e) =>
            set(
              "invocation",
              e.target.value as GitHubReviewPolicy["invocation"],
            )
          }
        >
          <option value="linked_authors">{t("stability.eb44de807528", { defaultValue: "Linked members’ PRs and authorized mentions" })}</option>
          <option value="mentions_only">{t("stability.3d0d0ce4102a", { defaultValue: "Authorized mentions only" })}</option>
          <option value="allowed_authors">{t("stability.97449943327a", { defaultValue: "Allowed authors’ PRs and authorized mentions" })}</option>
        </select>
        <p className="text-xs text-muted-foreground">{t("stability.f329c97f7333", { defaultValue: "Newly added people have a separate automatic-review setting in Access." })}</p>
      </div>
      <div>
        <h3 className="text-sm font-medium">{t("stability.7edf33aef2af", { defaultValue: "Automatic review events" })}</h3>
        {GITHUB_REVIEW_EVENTS.slice(0, 4).map((event) => (
          <GitHubToggle
            key={event}
            label={eventLabels[event]}
            checked={policy.events.includes(event)}
            onChange={(enabled) =>
              set(
                "events",
                enabled
                  ? [...new Set([...policy.events, event])]
                  : policy.events.filter((value) => value !== event),
              )
            }
          />
        ))}
        <GitHubToggle
          label={t("stability.433fa0da3bc9", { defaultValue: "Include draft PRs" })}
          checked={policy.reviewDrafts}
          onChange={(value) => set("reviewDrafts", value)}
        />
        <GitHubToggle
          label={t("stability.1d32654778c8", { defaultValue: "Include bot authors" })}
          description={t("stability.7231d929dee5", { defaultValue: "Also allow the bot account in Access with a sponsor and automatic reviews enabled." })}
          checked={policy.reviewBotAuthors}
          onChange={(value) => set("reviewBotAuthors", value)}
        />
      </div>
      <details className="rounded-lg border border-border p-4">
        <summary className="cursor-pointer text-sm font-medium">{t("stability.a7d25ebdff16", { defaultValue: "Author, branch, label, and file filters" })}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {(
            [
              [
                "includeAuthors",
                "Included authors",
                "Leave empty to include any authorized author. One username or glob per line.",
              ],
              [
                "excludeAuthors",
                "Excluded authors",
                "One username or glob per line.",
              ],
              [
                "targetBranches",
                "Target branches",
                "Leave empty for all branches. Supports * and **.",
              ],
              [
                "excludedBranches",
                "Excluded target branches",
                "Never automatically review these branches. Supports * and **.",
              ],
              [
                "requiredLabels",
                "Required labels",
                "All listed labels must be present.",
              ],
              [
                "excludedLabels",
                "Excluded labels",
                "Any listed label prevents automatic review.",
              ],
              [
                "ignoredPaths",
                "Ignored file paths",
                "Excluded from manual and automatic analysis. Supports * and **.",
              ],
            ] as const
          ).map(([key, label, help]) => (
            <div className="space-y-2" key={key}>
              <Label htmlFor={`github-${key}`}>{label}</Label>
              <Textarea
                id={`github-${key}`}
                value={policy[key].join("\n")}
                onChange={(e) =>
                  set(key, e.target.value.split("\n").filter(Boolean))
                }
              />
              <p className="text-xs text-muted-foreground">{help}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("stability.84230b68d065", { defaultValue: "Authorized manual requests bypass automatic scheduling filters. Repository restrictions and ignored files still apply." })}</p>
      </details>
      <div className="space-y-2">
        <Label htmlFor="github-instructions">{t("stability.e61fbd9695a5", { defaultValue: "Review instructions" })}</Label>
        <Textarea
          id="github-instructions"
          value={policy.instructions}
          onChange={(e) => set("instructions", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("stability.b4e33a0ed81d", { defaultValue: "Additional guidance for the assigned agent. Provider content cannot change its permissions." })}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="github-prompt-event">{t("stability.d3e623f3c821", { defaultValue: "Event prompts" })}</Label>
        <select
          id="github-prompt-event"
          className={githubSelectClass}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value as typeof prompt)}
        >
          {GITHUB_REVIEW_EVENTS.map((event) => (
            <option key={event} value={event}>
              {eventLabels[event]}
            </option>
          ))}
        </select>
        <Textarea
          aria-label={t("stability.9e1d33207b32", { value1: eventLabels[prompt], defaultValue: "{{value1}} prompt" })}
          value={policy.prompts[prompt]}
          onChange={(e) =>
            set("prompts", { ...policy.prompts, [prompt]: e.target.value })
          }
        />
        <p className="text-xs text-muted-foreground">{t("stability.2688728d6f76", { defaultValue: "Paperclip supplies repository, PR, base and head commits, sender, and prior head as typed context. Saved revisions remain attached to review activity." })}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="github-categories">{t("stability.6f31e9d6dcf7", { defaultValue: "Finding categories" })}</Label>
          <Input
            id="github-categories"
            value={policy.findingCategories.join(", ")}
            onChange={(e) =>
              set(
                "findingCategories",
                e.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              )
            }
          />
          <p className="text-xs text-muted-foreground">{t("stability.ca9a3f176330", { defaultValue: "Comma-separated assessment categories." })}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="github-severity">{t("stability.d20fbcf4930b", { defaultValue: "Minimum inline comment severity" })}</Label>
          <select
            id="github-severity"
            className={githubSelectClass}
            value={policy.minimumCommentSeverity}
            onChange={(e) =>
              set(
                "minimumCommentSeverity",
                e.target.value as GitHubReviewPolicy["minimumCommentSeverity"],
              )
            }
          >
            <option value="info">{t("zhComponents.editor.admonitions.info")}</option>
            <option value="warning">{t("warning")}</option>
            <option value="error">{t("error")}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t("stability.42ac3ca435e4", { defaultValue: "Hidden comments still count in the assessment." })}</p>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium">{t("stability.24669fa324b5", { defaultValue: "Publication permissions" })}</h3>
        <GitHubToggle
          label={t("stability.e1d31b27d14f", { defaultValue: "Publish summary" })}
          checked={policy.publishSummary}
          onChange={(value) => set("publishSummary", value)}
        />
        <GitHubToggle
          label={t("stability.d2558312993a", { defaultValue: "Publish inline findings" })}
          checked={policy.publishInline}
          onChange={(value) => set("publishInline", value)}
        />
        <GitHubToggle
          label={t("stability.22261e40bbee", { defaultValue: "Allow formal approvals" })}
          description={t("stability.329a945b6a9f", { defaultValue: "A separate agent action; a 5/5 score never automatically approves." })}
          checked={policy.allowApprove}
          onChange={(value) => set("allowApprove", value)}
        />
        <GitHubToggle
          label={t("stability.d5b9658cc639", { defaultValue: "Allow formal request changes" })}
          checked={policy.allowRequestChanges}
          onChange={(value) => set("allowRequestChanges", value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="github-rating">{t("stability.5cfccfdcf6a3", { defaultValue: "Paperclip Review check" })}</Label>
        <select
          id="github-rating"
          className={githubSelectClass}
          value={policy.ratingThreshold ?? "report"}
          onChange={(e) =>
            set(
              "ratingThreshold",
              e.target.value === "report"
                ? null
                : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5),
            )
          }
        >
          {[5, 4, 3, 2, 1].map((score) => (
            <option key={score} value={score}>{t("stability.d5cad1769f23", { defaultValue: "Require at least" })}{" "}{score}/5
            </option>
          ))}
          <option value="report">{t("stability.5d49741265be", { defaultValue: "Report only" })}</option>
        </select>
        <p className="text-xs text-muted-foreground">{t("stability.4f0df9fa4886", { defaultValue: "Paperclip computes the result for the exact reviewed commit. Incomplete reviews cannot pass. To require it before merging, select “Paperclip Review” in your GitHub branch protection or ruleset settings and choose this bot’s GitHub App as the expected source. Run a review first so the check appears in GitHub’s selector." })}</p>
        <a
          className="text-xs underline"
          href="https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository"
          target="_blank"
          rel="noreferrer"
        >{t("stability.91663fc21f26", { defaultValue: "Set up a required check on GitHub" })}</a>
      </div>
    </div>
  );
}

export function GitHubAccessEditor({
  endpointId,
  companyId,
  configuration,
  onChange,
}: {
  endpointId: string;
  companyId: string;
  configuration: GitHubChatConfiguration;
  onChange: (configuration: GitHubChatConfiguration) => void;
}) {
  const accountLink = useRef<HTMLAnchorElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const members = useQuery({
    queryKey: ["github-members", companyId],
    queryFn: () => accessApi.listMembers(companyId),
  });
  const links = useQuery({
    queryKey: ["github-linked-members", endpointId],
    queryFn: () => chatEndpointsApi.listPrincipals(endpointId),
  });
  const [kind, setKind] = useState<"member" | "guest" | null>(null);
  const [login, setLogin] = useState("");
  const [sponsor, setSponsor] = useState(configuration.responsibleUserId);
  const [candidate, setCandidate] = useState<{
    githubUserId: string;
    login: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const add = (person: GitHubAllowedPerson) => {
    if (
      configuration.people.some((p) => p.githubUserId === person.githubUserId)
    )
      return;
    onChange({
      ...configuration,
      ...(person.kind === "member" ? { memberAccess: "selected" } : {}),
      people: [...configuration.people, person],
    });
    setKind(null);
    setCandidate(null);
    setLogin("");
  };
  const activeMembers = (members.data?.members ?? []).filter(
    (member) =>
      member.status === "active" && member.membershipRole !== "viewer",
  );
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="github-responsible">{t("stability.8c627ece07af", { defaultValue: "Responsible user for automatic events" })}</Label>
        <select
          id="github-responsible"
          className={githubSelectClass}
          value={configuration.responsibleUserId}
          onChange={(e) =>
            onChange({ ...configuration, responsibleUserId: e.target.value })
          }
        >
          {activeMembers.map((member) => (
            <option key={member.principalId} value={member.principalId}>
              {member.user?.name ?? member.user?.email ?? member.principalId}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t("stability.e06deb8c4468", { defaultValue: "Accountable for automatic tasks. The PR author and webhook sender remain recorded separately." })}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="github-member-access">{t("stability.2a721252cde0", { defaultValue: "Company member access" })}</Label>
        <select
          id="github-member-access"
          className={githubSelectClass}
          value={configuration.memberAccess}
          onChange={(e) =>
            onChange({
              ...configuration,
              memberAccess: e.target.value as "all_linked" | "selected",
            })
          }
        >
          <option value="all_linked">{t("stability.c4f6d738f5e5", { defaultValue: "All linked company members" })}</option>
          <option value="selected">{t("stability.c749e6e75ca2", { defaultValue: "Only selected linked members" })}</option>
        </select>
        <p className="text-xs text-muted-foreground">{t("stability.95eaa9c7dcac", { defaultValue: "Members connect their own GitHub account." })}{" "}
          <Link
            className="underline"
            ref={accountLink}
            to={`/apps/chat/connect?provider=github&resume=${endpointId}&stage=identity`}
          >{t("stability.9218eed43e94", { defaultValue: "Open account linking" })}</Link>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              if (accountLink.current)
                void copyTextToClipboard(accountLink.current.href).then(
                  () => setLinkCopied(true),
                  () =>
                    setError(
                      "Could not copy the link. Open account linking and copy the address.",
                    ),
                );
            }}
          >
            {linkCopied ? t("link_copied") : t("stability.272c02876024", { defaultValue: "Copy link for teammates" })}
          </Button>
          .
        </p>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-medium">{t("stability.5d7ade44d7fa", { defaultValue: "Linked GitHub accounts" })}</h3>
        {links.isError && (
          <p role="alert" className="text-sm text-destructive">{t("stability.c1b59db6862a", { defaultValue: "Could not load linked accounts." })}</p>
        )}
        {(links.data ?? [])
          .filter((link) => link.status === "linked")
          .map((link) => (
            <div
              key={link.principalId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <p className="text-sm">
                @{link.githubLogin ?? link.externalLabel}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await chatEndpointsApi.revokeLink(
                      endpointId,
                      link.principalId,
                    );
                    await links.refetch();
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not unlink this account.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >{t("stability.f3f145c6a98e", { defaultValue: "Unlink account" })}</Button>
            </div>
          ))}
        {!links.isPending &&
          !links.isError &&
          !(links.data ?? []).some((link) => link.status === "linked") && (
            <p className="text-sm text-muted-foreground">{t("stability.c50b6cec1a58", { defaultValue: "No accounts linked yet. Each teammate confirms their own GitHub identity." })}</p>
          )}
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {configuration.people.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{t("stability.19fe80bcd77e", { defaultValue: "No individual access entries. Unlinked people cannot invoke this bot." })}</p>
        )}
        {configuration.people.map((person) => (
          <div key={person.githubUserId} className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">@{person.login}</p>
                <p className="text-xs text-muted-foreground">
                  {person.kind === "member"
                    ? t("stability.a8583eb599e0", { defaultValue: "Linked company member" })
                    : t("stability.3de380bb3794", { defaultValue: "External contributor · restricted guest permissions" })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange({
                    ...configuration,
                    people: configuration.people.filter(
                      (p) => p.githubUserId !== person.githubUserId,
                    ),
                  })
                }
              >{t("common.remove")}</Button>
            </div>
            <GitHubToggle
              label={t("stability.6f45d0040b8f", { value1: person.login, defaultValue: "Automatic PR reviews for @{{value1}}" })}
              checked={person.automaticReviews}
              onChange={(value) =>
                onChange({
                  ...configuration,
                  people: configuration.people.map((p) =>
                    p.githubUserId === person.githubUserId
                      ? { ...p, automaticReviews: value }
                      : p,
                  ),
                })
              }
            />
            {person.kind === "guest" && (
              <p className="text-xs text-muted-foreground">{t("stability.79d0c211e09f", { defaultValue: "Sponsor:" })}{" "}
                {activeMembers.find(
                  (member) => member.principalId === person.sponsorUserId,
                )?.user?.name ?? person.sponsorUserId}
                . No company membership or personal credentials are granted.
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setKind("member")}>{t("stability.0c1b3674e054", { defaultValue: "Add linked member" })}</Button>
        <Button variant="outline" onClick={() => setKind("guest")}>{t("stability.fea8e4f5b2d7", { defaultValue: "Allow external contributor" })}</Button>
      </div>
      {kind === "member" && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm">{t("stability.e96fb18161f0", { defaultValue: "Adding a member switches access to the selected-member list. Automatic PR reviews start off." })}</p>
          {(links.data ?? [])
            .filter((link) => link.status === "linked" && link.paperclipUserId)
            .map((link) => (
              <Button
                className="mr-2"
                key={link.id}
                variant="outline"
                disabled={configuration.people.some(
                  (p) =>
                    p.kind === "member" && p.userId === link.paperclipUserId,
                )}
                onClick={() => {
                  const id = link.githubUserId;
                  if (!id) {
                    setError(
                      "Refresh linked identities before adding this member.",
                    );
                    return;
                  }
                  add({
                    kind: "member",
                    userId: link.paperclipUserId!,
                    githubUserId: id,
                    login: link.githubLogin ?? link.externalLabel,
                    automaticReviews: false,
                  });
                }}
              >
                {link.paperclipUserLabel ?? link.externalLabel}
              </Button>
            ))}
          <Button variant="ghost" onClick={() => setKind(null)}>{t("common.cancel")}</Button>
        </div>
      )}
      {kind === "guest" && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <p className="text-sm">{t("stability.66d4493e28b8", { defaultValue: "Allow one GitHub account to mention the bot with restricted guest permissions. A sponsor is required." })}</p>
          <div className="space-y-2">
            <Label htmlFor="github-guest-login">{t("stability.64477e38cfb5", { defaultValue: "GitHub username" })}</Label>
            <div className="flex gap-2">
              <Input
                id="github-guest-login"
                value={login}
                onChange={(e) => {
                  setLogin(e.target.value);
                  setCandidate(null);
                }}
              />
              <Button
                variant="outline"
                disabled={busy || !login}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    setCandidate(await githubChatApi.lookup(endpointId, login));
                  } catch (error) {
                    setError(
                      error instanceof Error ? error.message : "Lookup failed",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >{t("stability.504101bcda9e", { defaultValue: "Look up" })}</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="github-guest-sponsor">{t("stability.fd6e874f43f8", { defaultValue: "Sponsor" })}</Label>
            <select
              id="github-guest-sponsor"
              className={githubSelectClass}
              value={sponsor}
              onChange={(e) => setSponsor(e.target.value)}
            >
              {activeMembers.map((member) => (
                <option key={member.principalId} value={member.principalId}>
                  {member.user?.name ?? member.principalId}
                </option>
              ))}
            </select>
          </div>
          {candidate && (
            <p className="text-sm">
              @{candidate.login}{" "}{t("stability.d614c4e47181", { defaultValue: "· GitHub ID" })}{" "}{candidate.githubUserId}
            </p>
          )}
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setKind(null)}>{t("common.cancel")}</Button>
            <Button
              disabled={
                !candidate ||
                !sponsor ||
                configuration.people.some(
                  (p) => p.githubUserId === candidate.githubUserId,
                )
              }
              onClick={() =>
                candidate &&
                add({
                  ...candidate,
                  kind: "guest",
                  sponsorUserId: sponsor,
                  permissionProfile: "restricted",
                  automaticReviews: false,
                })
              }
            >{t("stability.0c44f8da961b", { defaultValue: "Allow this account" })}</Button>
          </div>
        </div>
      )}
      {(error || members.error || links.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error ||
            t("stability.ed5ce86d7c54", { defaultValue: "Could not load members or linked accounts. Refresh to try again." })}
        </p>
      )}
    </div>
  );
}
