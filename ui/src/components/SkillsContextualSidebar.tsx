import { Compass, Library, PencilRuler } from "lucide-react";
import { useLocation } from "@/lib/router";
import {
  resolveSkillsNavigationView,
  SKILLS_NAVIGATION_HREFS,
} from "@/pages/skills/skills-navigation";
import { ContextualSidebarFrame } from "./ContextualSidebarFrame";
import { SidebarNavItem } from "./SidebarNavItem";
import { contextualSidebarStyles } from "./contextual-sidebar-styles";
import { useTranslation } from "@/i18n";

export {
  resolveSkillsDiscoveryView,
  resolveSkillsNavigationView,
  SKILLS_NAVIGATION_HREFS,
  withSkillsDiscoveryView,
  type SkillsNavigationView,
} from "@/pages/skills/skills-navigation";

export function SkillsContextualSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const activeView = resolveSkillsNavigationView(location.pathname, location.search);

  return (
    <ContextualSidebarFrame
      surface="skills"
      title={t("skills")}
      icon={Library}
      fallbackTo="/dashboard"
      showHeader={false}
      className="border-r border-border bg-background"
    >
      <nav
        aria-label={t("skills")}
        data-slot="contextual-sidebar-nav"
        className={contextualSidebarStyles.nav}
      >
        <div data-slot="contextual-sidebar-group" className={contextualSidebarStyles.group}>
          <SidebarNavItem
            to={SKILLS_NAVIGATION_HREFS.installed}
            label={t("installed")}
            icon={Library}
            active={activeView === "installed"}
            end
          />
          <SidebarNavItem
            to={SKILLS_NAVIGATION_HREFS.discover}
            label={t("discover")}
            icon={Compass}
            active={activeView === "discover"}
            end
          />
        </div>

        <div data-slot="contextual-sidebar-section" className={contextualSidebarStyles.section}>
          <div
            data-slot="contextual-sidebar-section-label"
            className={contextualSidebarStyles.sectionLabel}
          >
            {t("author")}
          </div>
          <p
            data-slot="contextual-sidebar-section-description"
            className={contextualSidebarStyles.sectionDescription}
          >
            {t("skills_you_create_edit_and_test")}
          </p>
          <div data-slot="contextual-sidebar-group" className={contextualSidebarStyles.group}>
            <SidebarNavItem
              to={SKILLS_NAVIGATION_HREFS.authored}
              label={t("my_skills")}
              icon={PencilRuler}
              active={activeView === "authored"}
            />
          </div>
        </div>
      </nav>
    </ContextualSidebarFrame>
  );
}
