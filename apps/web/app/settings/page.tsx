import { PageHeader, Panel } from "../../components/ui";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Environment-driven runtime configuration for Docker and the local SQLite database." />
      <Panel className="space-y-2 text-sm text-slate-700">
        <p><strong>Docker host:</strong> {process.env.NEXT_PUBLIC_API_BASE_URL ? "Configured via API" : "http://localhost:4000/api"}</p>
        <p><strong>Database:</strong> file:./packages/db/prisma/dev.db</p>
        <p><strong>Mode:</strong> Local-only, single-user trusted environment</p>
      </Panel>
    </div>
  );
}
