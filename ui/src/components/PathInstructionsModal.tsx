import { useState } from "react";
import { Apple, Monitor, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { t, useTranslation } from "@/i18n";

type Platform = "mac" | "windows" | "linux";

const platforms: { id: Platform; label: string; icon: typeof Apple }[] = [
  { id: "mac", label: t("macos"), icon: Apple },
  { id: "windows", label: t("windows"), icon: Monitor },
  { id: "linux", label: t("linux"), icon: Terminal },
];

const instructions: Record<Platform, { steps: string[]; tip?: string }> = {
  mac: {
    steps: [
      t("open_finder_and_navigate_to_the_folder"),
      t("right_click_or_control_click_the_folder"),
      t("hold_the_option_key_copy_changes_to_copy_as_path"),
      t("click_copy_as_pathname_then_paste_here"),
    ],
    tip: t("you_can_also_open_terminal_type_cd_drag_the_fold"),
  },
  windows: {
    steps: [
      t("open_file_explorer_and_navigate_to_the_folder"),
      t("click_in_the_address_bar_at_the_top_the_full_pat"),
      t("copy_the_path_then_paste_here"),
    ],
    tip: t("alternatively_hold_shift_and_right_click_the_fol"),
  },
  linux: {
    steps: [
      t("open_a_terminal_and_navigate_to_the_directory_wi"),
      t("run_pwd_to_print_the_full_path"),
      t("copy_the_output_and_paste_here"),
    ],
    tip: t("in_most_file_managers_ctrl_l_reveals_the_full_pa"),
  },
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  return "linux";
}

interface PathInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PathInstructionsModal({
  open,
  onOpenChange,
}: PathInstructionsModalProps) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<Platform>(detectPlatform);

  const current = instructions[platform];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("how_to_get_a_full_path")}</DialogTitle>
          <DialogDescription>
            {t("paste_the_absolute_path_e_g")}{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">/Users/you/project</code>
            {t("into_the_input_field")}
          </DialogDescription>
        </DialogHeader>

        {/* Platform tabs */}
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
                platform === p.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
              onClick={() => setPlatform(p.id)}
            >
              <p.icon className="h-3.5 w-3.5" />
              {p.label}
            </button>
          ))}
        </div>

        {/* Steps */}
        <ol className="space-y-2 text-sm">
          {current.steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground font-mono text-xs mt-0.5 shrink-0">
                {i + 1}.
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        {current.tip && (
          <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
            {current.tip}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Small "Choose" button that opens the PathInstructionsModal.
 * Drop-in replacement for the old showDirectoryPicker buttons.
 */
export function ChoosePathButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors shrink-0",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        {t("choose")}
      </button>
      <PathInstructionsModal open={open} onOpenChange={setOpen} />
    </>
  );
}
