import Dashboard from "./components/Dashboard";
import { getAppConfigStatus } from "@/lib/config";
import { getAllDayPreviews, getStatus } from "@/lib/posts";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [status, days, config] = await Promise.all([
    getStatus(),
    getAllDayPreviews(),
    Promise.resolve(getAppConfigStatus()),
  ]);

  return (
    <Dashboard
      initialStatus={status}
      initialDays={days}
      postingTips={status.meta.postingTips}
      config={config}
    />
  );
}
