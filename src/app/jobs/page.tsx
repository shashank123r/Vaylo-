import { MarketingHeader } from "@/components/MarketingHeader";
import { JobsBrowse } from "@/components/JobsBrowse";

export const dynamic = "force-dynamic";

// Public job browsing (logged-out visitors), wrapped by the marketing header.
// Logged-in users get the same experience inside the app shell at /app/jobs.
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-content px-5 py-8 sm:px-8 sm:py-10">
        <JobsBrowse sp={sp} />
      </main>
    </>
  );
}
