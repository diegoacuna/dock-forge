import { InstallFlow } from "../../components/install-flow";
import { fetchInstallStatusServer, getInstallStatusFallback } from "../../lib/install";

export default async function InstallPage() {
  const installStatus = await fetchInstallStatusServer().catch(() => getInstallStatusFallback());

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.22),_transparent_32%),linear-gradient(180deg,_#020617_0%,_#111827_46%,_#e2e8f0_100%)] px-4 py-8">
      <InstallFlow initialStatus={installStatus} />
    </div>
  );
}
