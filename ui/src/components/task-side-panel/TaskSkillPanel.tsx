import { t } from "@/i18n";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Wrench } from "lucide-react";
import { companySkillsApi } from "@/api/companySkills";
import { ApiError } from "@/api/client";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/queryKeys";
import { useNavigate } from "@/lib/router";
import { parseFrontmatterMarkdown } from "@paperclipai/shared";

export function TaskSkillPanel({ companyId, skillId }: { companyId: string; skillId: string }) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.companySkills.detail(companyId, skillId),
    queryFn: () => companySkillsApi.detail(companyId, skillId),
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />{t("loading_skill")}</div>
    );
  }
  if (query.isError) {
    const status = query.error instanceof ApiError ? query.error.status : null;
    if (status === 404) {
      return <div className="py-8 text-sm text-muted-foreground" role="status">{t("stability.f266c3fde7c5", { defaultValue: "Skill no longer available." })}</div>;
    }
    if (status === 403) {
      return <div className="py-8 text-sm text-muted-foreground" role="alert">{t("stability.cc90e7ec78bd", { defaultValue: "You do not have access to this skill." })}</div>;
    }
    return (
      <div className="space-y-3 py-8 text-sm text-muted-foreground" role="alert">
        <p>{t("stability.91aeb48a583b", { defaultValue: "The skill could not be loaded." })}</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? t("retrying_231013") : t("common.retry")}
        </Button>
      </div>
    );
  }
  if (!query.data) {
    return <div className="py-8 text-sm text-muted-foreground" role="status">{t("stability.f266c3fde7c5", { defaultValue: "Skill no longer available." })}</div>;
  }
  const skill = query.data;
  const previewMarkdown = parseFrontmatterMarkdown(skill.markdown).body;
  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold">{skill.name}</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/skills/studio/${encodeURIComponent(skill.id)}`)}
          >
            <ExternalLink className="mr-1.5 size-3.5" aria-hidden />{t("stability.90ec3b0d0d07", { defaultValue: "Open in Skill Studio" })}</Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {skill.slug} · {skill.currentVersion ? `Revision ${skill.currentVersion.revisionNumber}` : t("stability.a74487de8969", { defaultValue: "Current version" })}
        </p>
      </header>
      {skill.description ? <p className="text-sm text-muted-foreground">{skill.description}</p> : null}
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <FileText className="size-3.5" aria-hidden />{t("stability.f9f4685609f8", { defaultValue: "Skill instructions" })}</h3>
        <MarkdownBody>{previewMarkdown || t("stability.427e00bb362a", { defaultValue: "Skill instructions are empty." })}</MarkdownBody>
      </section>
    </article>
  );
}
