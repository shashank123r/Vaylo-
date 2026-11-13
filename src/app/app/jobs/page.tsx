import { JobsBrowse } from "@/components/JobsBrowse";

export const dynamic = "force-dynamic";

// In-app job browsing: the same experience as the public /jobs route, but rendered
// inside the app shell (sidebar) so logged-in users stay in the app when browsing.
export default async function AppJobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <div className="animate-fade-in">
      <JobsBrowse sp={sp} />
    </div>
  );
}
