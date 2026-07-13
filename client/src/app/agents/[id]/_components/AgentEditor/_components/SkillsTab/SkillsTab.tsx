/* Agent → Skills tab — attach/detach the workspace's skills to this agent,
   reorder them (order = order in the assembled prompt), and enable/disable each
   via its checkbox. Checked = linked + enabled; drag a row to reorder. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { TYPE_COLOR } from "../../../../../../skills/helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkill = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  const [order, setOrder] = React.useState<string[] | null>(null);
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);

  // Seed local order/checked from the server once both queries have loaded.
  // Linked skills come first (in link order), then the rest by name.
  React.useEffect(() => {
    if (!skills || !links || order !== null) return;
    const linkOrder = new Map(links.map((l) => [l.skill_id, l.order]));
    const ranked = [...skills].sort((a, b) => {
      const la = linkOrder.get(a.id);
      const lb = linkOrder.get(b.id);
      if (la != null && lb != null) return la - lb;
      if (la != null) return -1;
      if (lb != null) return 1;
      return a.name.localeCompare(b.name);
    });
    setOrder(ranked.map((sk) => sk.id));
    setChecked(new Set(links.filter((l) => l.enabled).map((l) => l.skill_id)));
  }, [skills, links, order]);

  const byId = React.useMemo(() => new Map((skills ?? []).map((sk) => [sk.id, sk])), [skills]);

  const persist = (nextOrder: string[], nextChecked: Set<string>) => {
    const payload = nextOrder
      .filter((id) => nextChecked.has(id))
      .map((id) => ({ skill_id: id, enabled: true }));
    setSkills.mutate({ agentId: agent.id, skills: payload });
  };

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    persist(order ?? [], next);
  };

  const onDrop = (targetId: string) => {
    if (!order || !dragId || dragId === targetId) return setDragId(null);
    const next = [...order];
    const from = next.indexOf(dragId);
    const to = next.indexOf(targetId);
    next.splice(to, 0, next.splice(from, 1)[0]!);
    setOrder(next);
    setDragId(null);
    persist(next, checked);
  };

  if (isLoading || order === null) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (isError) return <div style={s.wrap}><ErrorState body={t("skills.loadError")} onRetry={() => refetch()} /></div>;
  if ((skills ?? []).length === 0) {
    return (
      <div style={s.wrap}>
        <EmptyState icon="Sparkles" title={t("skills.title")} body={t("skills.empty")} />
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const rows = order.map((id) => byId.get(id)).filter((sk): sk is Skill => !!sk && (!q || sk.name.includes(q)));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent)">
          {t("skills.enabledCount", { linked: checked.size, total: skills?.length ?? 0 })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      <div style={s.list}>
        {rows.map((sk) => (
          <div
            key={sk.id}
            draggable
            onDragStart={() => setDragId(sk.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(sk.id)}
            style={s.row(dragId === sk.id, checked.has(sk.id))}
          >
            <span style={s.handle} title="Drag to reorder">
              <Icon.Menu size={14} />
            </span>
            <Checkbox checked={checked.has(sk.id)} onChange={() => toggle(sk.id)} />
            <span className="mono" style={s.slug}>
              {sk.name}
            </span>
            <Badge color={TYPE_COLOR[sk.type]} style={{ marginLeft: "auto" }}>
              {tSkill(`type.${sk.type}`)}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
