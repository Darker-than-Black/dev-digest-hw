/* SkillsView — the Skills Lab page: a searchable list of skills on the left and
   the selected skill's editor (Config / Preview / Versions …) on the right.
   Selection + active tab live in the URL (?skill=…&tab=…). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { SkillDetail } from "../SkillDetail";
import { AddSkillModal } from "../AddSkillModal";
import { SKILL_TAB_KEYS } from "../SkillDetail/constants";
import { filterSkills } from "../../helpers";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();

  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState<null | "create" | "import">(null);

  const selectedId = search.get("skill");
  const tab = SKILL_TAB_KEYS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";

  const go = (skillId: string, nextTab = tab) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("skill", skillId);
    sp.set("tab", nextTab);
    router.replace(`/skills?${sp.toString()}`);
  };

  const list = filterSkills(skills ?? [], query);
  const selected = (skills ?? []).find((sk) => sk.id === selectedId) ?? null;
  // Default to the first skill when nothing is selected yet.
  const effective = selected ?? (selectedId ? null : list[0] ?? null);

  const onCreated = (skill: Skill) => {
    setAdding(null);
    go(skill.id, "config");
  };

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }];

  return (
    <AppShell crumb={crumb}>
      {adding && (
        <AddSkillModal initialTab={adding} onClose={() => setAdding(null)} onCreated={onCreated} />
      )}
      <div style={s.split}>
        <div style={s.listCol}>
          <div style={s.listHead}>
            <div style={s.titleRow}>
              <h1 style={s.title}>{t("page.heading")}</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.create"), icon: "Edit", onClick: () => setAdding("create") },
                  { label: t("page.import"), icon: "Upload", onClick: () => setAdding("import") },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.list}>
            {isLoading && (
              <>
                <Skeleton height={96} />
                <Skeleton height={96} />
                <Skeleton height={96} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && list.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setAdding("create")}
              />
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === effective?.id}
                onClick={() => go(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        <div style={s.detailCol}>
          {effective ? (
            <SkillDetail skill={effective} tab={tab} onTab={(nt) => go(effective.id, nt)} />
          ) : (
            <div style={s.emptyWrap}>
              <EmptyState
                icon="Sparkles"
                title={t("page.selectPrompt.title")}
                body={t("page.selectPrompt.body")}
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
