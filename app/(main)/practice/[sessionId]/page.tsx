import { PracticePageClient } from "../page";

export default async function PracticeSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return <PracticePageClient initialSessionId={decodeURIComponent(sessionId)} />;
}
