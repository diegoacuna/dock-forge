import { InstallSettingsForm } from "../../components/install-settings-form";
import { PageHeader, Panel } from "../../components/ui";
import { fetchInstallStatusServer, getInstallStatusFallback } from "../../lib/install";

export default async function SettingsPage() {
  const installStatus = await fetchInstallStatusServer().catch(() => getInstallStatusFallback());

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Review the persisted Docker runtime configuration that DockForge reads from the app database." />

      <InstallSettingsForm mode="settings" initialStatus={installStatus} />

      <Panel className="space-y-2 text-sm text-slate-700">
        <p><strong>Browser API base URL:</strong> {process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api"}</p>
        <p><strong>Database:</strong> file:./packages/db/prisma/dev.db</p>
        <p><strong>Mode:</strong> Local-only, single-user trusted environment</p>
      </Panel>
    </div>
  );
}
