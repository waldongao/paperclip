import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t, useTranslation } from "@/i18n";

interface ShortcutEntry {
  keys: string[];
  label: string;
  /** Render keys as a simultaneous chord (joined with "+") rather than a
   *  "then" sequence. */
  combo?: boolean;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

const sections: ShortcutSection[] = [
  {
    title: t("inbox"),
    shortcuts: [
      { keys: ["j"], label: t("move_down") },
      { keys: ["↓"], label: t("move_down") },
      { keys: ["k"], label: t("move_up") },
      { keys: ["↑"], label: t("move_up") },
      { keys: ["←"], label: t("collapse_selected_group") },
      { keys: ["→"], label: t("expand_selected_group") },
      { keys: [t("enter")], label: t("open_selected_item") },
      { keys: ["a"], label: t("archive_item") },
      { keys: ["y"], label: t("archive_item") },
      { keys: ["r"], label: t("mark_as_read") },
      { keys: ["U"], label: t("mark_as_unread") },
    ],
  },
  {
    title: t("task_detail"),
    shortcuts: [
      { keys: ["y"], label: t("quick_archive_back_to_inbox") },
      { keys: ["g", "i"], label: t("go_to_inbox") },
      { keys: ["g", "c"], label: t("focus_comment_composer") },
    ],
  },
  {
    title: t("decisions"),
    shortcuts: [
      { keys: ["j"], label: t("move_down") },
      { keys: ["↓"], label: t("move_down") },
      { keys: ["k"], label: t("move_up") },
      { keys: ["↑"], label: t("move_up") },
      { keys: [t("enter")], label: t("open_or_close_selected_decision") },
      { keys: ["x"], label: t("dismiss_selected_decision") },
    ],
  },
  {
    title: t("global"),
    shortcuts: [
      { keys: ["/"], label: t("search_current_page_or_quick_search") },
      { keys: ["c"], label: t("new_task") },
      { keys: ["["], label: t("toggle_sidebar") },
      { keys: ["]"], label: t("toggle_panel") },
      { keys: ["?"], label: t("show_keyboard_shortcuts") },
    ],
  },
];

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground shadow-(--shadow-extract-10)">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsCheatsheetContent() {
  const { t } = useTranslation();
  return (
    <>
      <div className="divide-y divide-border border-t border-border">
        {sections.map((section) => (
          <div key={section.title} className="px-5 py-3">
            <h3 className="mb-2 text-(length:--text-micro) font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h3>
            <div className="space-y-1.5">
              {section.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label + shortcut.keys.join()}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-sm text-foreground/90">{shortcut.label}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, i) => (
                      <span key={key} className="flex items-center gap-1">
                        {i > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {shortcut.combo ? "+" : t("zhComponents.shortcutThen")}
                          </span>
                        )}
                        <KeyCap>{key}</KeyCap>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {t("press")} <KeyCap>{t("esc")}</KeyCap> {t("to_close_shortcuts_are_disabled_in_text_fields")}
        </p>
      </div>
    </>
  );
}

export function KeyboardShortcutsCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">{t("keyboard_shortcuts")}</DialogTitle>
        </DialogHeader>
        <KeyboardShortcutsCheatsheetContent />
      </DialogContent>
    </Dialog>
  );
}
