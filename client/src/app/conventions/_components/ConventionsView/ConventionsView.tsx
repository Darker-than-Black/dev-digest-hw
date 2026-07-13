/* ConventionsView — the Conventions page: scan the active repo for de-facto house
   rules, then accept/reject/edit each candidate and merge the accepted ones into a
   skill. The active repo comes from the shell repo switcher (`useActiveRepo`). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useActiveRepo, useRepoNotFound } from "../../../../lib/repo-context";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "../../../../lib/hooks/conventions";
import { acceptedCount } from "../../helpers";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId, activeRepo } = useActiveRepo();
  const notFound = useRepoNotFound(repoId);

  const { data: candidates, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention();

  const [creating, setCreating] = React.useState(false);
  const [scannedFiles, setScannedFiles] = React.useState<number | null>(null);

  const list = candidates ?? [];
  const accepted = acceptedCount(list);
  const repoName = activeRepo?.full_name ?? t("page.repoFallback");

  const runScan = () =>
    extract.mutate(undefined, {
      onSuccess: (res) => setScannedFiles(res.scanned_files),
    });

  const deselectAll = () => {
    for (const c of list) {
      if (c.status === "accepted") update.mutate({ id: c.id, patch: { status: "pending" } });
    }
  };

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  return (
    <AppShell crumb={crumb}>
      {creating && repoId && (
        <CreateSkillModal
          repoId={repoId}
          acceptedCount={accepted}
          onClose={() => setCreating(false)}
          onCreated={() => setCreating(false)}
        />
      )}

      <div style={s.wrap}>
        <div style={s.header}>
          <div style={s.titleRow}>
            <div style={s.titleCol}>
              <h1 style={s.title}>{t("page.headingPrefix") + repoName}</h1>
              <span style={s.subtitle}>
                {scannedFiles != null
                  ? t("page.detectedFrom", { count: scannedFiles })
                  : t("page.subtitle")}
              </span>
            </div>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              onClick={runScan}
              loading={extract.isPending}
              disabled={extract.isPending || !repoId || notFound}
            >
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          </div>

          {list.length > 0 && (
            <div style={s.actionRow}>
              <span style={s.counter}>{t("page.acceptedCounter", { accepted, total: list.length })}</span>
              <span style={s.spacer} />
              <Button
                kind="ghost"
                size="sm"
                onClick={deselectAll}
                disabled={accepted === 0 || update.isPending}
              >
                {t("page.deselectAll")}
              </Button>
              <Button
                kind="primary"
                size="sm"
                icon="Sparkles"
                onClick={() => setCreating(true)}
                disabled={accepted === 0}
              >
                {t("page.createSkill")}
              </Button>
            </div>
          )}
        </div>

        {notFound && (
          <div style={s.emptyWrap}>
            <EmptyState icon="GitBranch" title={t("page.noRepo.title")} body={t("page.noRepo.body")} />
          </div>
        )}

        {!notFound && (
          <div style={s.list}>
            {isLoading && (
              <>
                <Skeleton height={150} />
                <Skeleton height={150} />
                <Skeleton height={150} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {extract.isError && <ErrorState body={t("page.extractionFailed")} onRetry={runScan} />}
            {!isLoading && !isError && list.length === 0 && (
              <div style={s.emptyWrap}>
                <EmptyState
                  icon="Sparkles"
                  title={t("page.empty.title")}
                  body={t("page.empty.body")}
                  cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
                  onCta={runScan}
                />
              </div>
            )}
            {list.map((c) => (
              <ConventionCard key={c.id} candidate={c} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
