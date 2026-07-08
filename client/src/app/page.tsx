/* Root — sends the user to the first repo's PR list, or onboarding if no repos. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useRepos } from "../lib/hooks";
import { AppShell } from "../components/app-shell";
import { PageContainer } from "../components/page-shell";
import { EmptyState, Skeleton } from "@devdigest/ui";

export default function HomePage() {
  const router = useRouter();
  const { data: repos, isLoading } = useRepos();

  // Redirect to the first repo once loaded. While redirecting, keep showing the
  // skeleton (not an intermediate "taking you…" screen) so there's no flash.
  const redirecting = !!repos && repos.length > 0;
  React.useEffect(() => {
    if (redirecting) {
      router.replace(`/repos/${repos![0]!.id}/pulls`);
    }
  }, [redirecting, repos, router]);

  return (
    <AppShell crumb={[{ label: "DevDigest" }]}>
      <PageContainer title="Welcome to DevDigest" subtitle="Local-first AI PR review">
        {isLoading || redirecting ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <Skeleton height={20} width={240} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        ) : (
          <EmptyState
            icon="GitBranch"
            title="No repositories yet"
            body="Add a repository to start reviewing pull requests. Set your API keys once in Settings → API Keys."
            cta="Add repository"
            onCta={() => router.push("/onboarding")}
          />
        )}
      </PageContainer>
    </AppShell>
  );
}
