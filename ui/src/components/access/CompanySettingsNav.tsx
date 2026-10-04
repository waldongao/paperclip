import { PageTabBar } from "@/components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { useCloudInstance } from "@/hooks/useCloudInstance";
import { useHiddenSettings } from "@/hooks/useHiddenSettings";
import { INSTANCE_SETTINGS_PATH_PREFIX } from "@/lib/instance-settings";
import { useLocation, useNavigate } from "@/lib/router";
import { useTranslation } from "@/i18n";

const items = [
  { value: "general", labelKey: "settings.nav.general", href: "/company/settings" },
  { value: "export", labelKey: "settings.nav.export", href: "/company/export" },
  { value: "import", labelKey: "settings.nav.import", href: "/company/import" },
  { value: "members", labelKey: "settings.nav.members", href: "/company/settings/members" },
  { value: "secrets", labelKey: "settings.nav.secrets", href: "/company/settings/secrets" },
  { value: "instance-profile", labelKey: "settings.nav.profile", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/profile` },
  { value: "instance-environments", labelKey: "settings.nav.environments", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/environments` },
  { value: "instance-access", labelKey: "settings.nav.access", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/access` },
  { value: "instance-experimental", labelKey: "settings.nav.experimental", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/experimental` },
  { value: "instance-plugins", labelKey: "settings.nav.plugins", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/plugins` },
  { value: "instance-adapters", labelKey: "settings.nav.adapters", href: `${INSTANCE_SETTINGS_PATH_PREFIX}/adapters` },
] as const;

type CompanySettingsTab = (typeof items)[number]["value"];

/** Tab values suppressed when their page is operator-hidden. */
const hiddenSettingKeyByTab: Partial<Record<CompanySettingsTab, string>> = {
  export: "company.export",
  import: "company.import",
  members: "company.members",
  secrets: "company.secrets",
  "instance-profile": "instance.profile",
  "instance-environments": "instance.environments",
  "instance-access": "instance.access",
  "instance-experimental": "instance.experimental",
  "instance-plugins": "instance.plugins",
  "instance-adapters": "instance.adapters",
};

export function getCompanySettingsTab(pathname: string): CompanySettingsTab {
  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/profile`)) {
    return "instance-profile";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/environments`)) {
    return "instance-environments";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/access`)) {
    return "instance-access";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/experimental`)) {
    return "instance-experimental";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/plugins`)) {
    return "instance-plugins";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/adapters`)) {
    return "instance-adapters";
  }

  if (pathname.includes(`${INSTANCE_SETTINGS_PATH_PREFIX}/general`)) {
    return "general";
  }

  if (pathname.includes("/company/settings/environments")) {
    return "instance-environments";
  }

  if (pathname.includes("/company/export")) {
    return "export";
  }

  if (pathname.includes("/company/import")) {
    return "import";
  }

  if (pathname.includes("/company/settings/members") || pathname.includes("/company/settings/access")) {
    return "members";
  }

  if (pathname.includes("/company/settings/invites")) {
    // Invites live on the Members page now; the old URL redirects there.
    return "members";
  }

  if (pathname.includes("/company/settings/secrets")) {
    return "secrets";
  }

  return "general";
}

export function CompanySettingsNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { hidden: hiddenSettings } = useHiddenSettings();
  // Import is floored server-side on cloud-managed instances (403 cloud_managed), so the
  // tab is suppressed there rather than dead-ending.
  const isCloud = Boolean(useCloudInstance());
  const activeTab = getCompanySettingsTab(location.pathname);
  const visibleItems = items.filter((item) => {
    if (item.value === "import" && isCloud) return false;
    const hiddenKey = hiddenSettingKeyByTab[item.value];
    return !hiddenKey || !hiddenSettings.has(hiddenKey);
  });

  function handleTabChange(value: string) {
    const nextTab = visibleItems.find((item) => item.value === value);
    if (!nextTab || nextTab.value === activeTab) return;
    navigate(nextTab.href);
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <PageTabBar
        items={visibleItems.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
        value={activeTab}
        onValueChange={handleTabChange}
        align="start"
      />
    </Tabs>
  );
}
