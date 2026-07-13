/* CreateSkillModal — assemble the accepted conventions into one editable skill.
   On open it fetches the merged draft (name / description / type / body) from the
   skill-draft endpoint, prefills the form, and saves via the existing POST /skills
   (reused `useCreateSkill`). Mirrors AddSkillModal's create flow. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, FormField, TextInput, SelectInput, Textarea, Toggle, Button, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useToast } from "../../../../lib/toast";
import { useCreateSkill } from "../../../../lib/hooks/skills";
import { useConventionSkillDraft } from "../../../../lib/hooks/conventions";
import { SkillBodyEditor } from "../../../skills/_components/SkillBodyEditor/SkillBodyEditor";
import { SKILL_TYPES } from "../../helpers";
import { s } from "./styles";

export function CreateSkillModal({
  repoId,
  acceptedCount,
  onClose,
  onCreated,
}: {
  repoId: string;
  acceptedCount: number;
  onClose: () => void;
  onCreated: (skill: Skill) => void;
}) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const create = useCreateSkill();
  const { data: draft, isLoading, isError, refetch } = useConventionSkillDraft(repoId, true);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<Skill["type"]>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");
  const [seeded, setSeeded] = React.useState(false);

  // Seed the form from the draft exactly once (subsequent edits are the user's).
  React.useEffect(() => {
    if (draft && !seeded) {
      setName(draft.name);
      setDescription(draft.description);
      setType(draft.type);
      setBody(draft.body);
      setSeeded(true);
    }
  }, [draft, seeded]);

  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: v }));

  const submit = () =>
    create.mutate(
      { name, description, type, body, enabled },
      {
        onSuccess: (skill) => {
          toast.success(t("modal.created", { name: skill.name }));
          onCreated(skill);
        },
      },
    );

  return (
    <Modal width={680} title={t("modal.title")} onClose={onClose}>
      {isLoading && <div style={s.loading}>{t("modal.loading")}</div>}
      {isError && (
        <div style={s.loading}>
          {t("modal.loadError")}{" "}
          <Button kind="ghost" size="sm" icon="RefreshCw" onClick={() => refetch()}>
            {t("modal.retry")}
          </Button>
        </div>
      )}
      {draft && (
        <div style={s.pane}>
          <div style={s.banner}>
            <Icon.ListChecks size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
            <span>{t("modal.mergedBanner", { count: acceptedCount })}</span>
          </div>

          <FormField label={t("modal.nameLabel")} required>
            <TextInput value={name} onChange={setName} mono placeholder={t("modal.namePlaceholder")} />
          </FormField>

          <FormField label={t("modal.descriptionLabel")}>
            <Textarea value={description} onChange={setDescription} rows={2} />
          </FormField>

          <FormField label={t("modal.typeLabel")}>
            <SelectInput value={type} onChange={(v) => setType(v as Skill["type"])} options={typeOptions} />
          </FormField>

          <FormField label={t("modal.enabledLabel")}>
            <div style={s.enabledRow}>
              <Toggle on={enabled} onChange={setEnabled} size={16} />
              <span style={s.enabledLabel}>
                {enabled ? t("modal.enabledOn") : t("modal.enabledOff")}
              </span>
            </div>
          </FormField>

          <FormField label={t("modal.bodyLabel")}>
            <SkillBodyEditor filename={`${name || "skill"}.md`} value={body} onChange={setBody} dirty={false} />
          </FormField>

          <div style={s.actions}>
            <Button
              kind="primary"
              icon="Plus"
              onClick={submit}
              disabled={create.isPending || !name || !body}
            >
              {create.isPending ? t("modal.creating") : t("modal.create")}
            </Button>
            <Button kind="ghost" onClick={onClose}>
              {t("modal.cancel")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
