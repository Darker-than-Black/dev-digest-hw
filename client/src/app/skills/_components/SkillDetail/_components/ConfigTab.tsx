/* Skill Config tab — slug name, description, type, and the Markdown body editor.
   A changed body creates a new immutable version on save. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Toggle, Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ApiError } from "../../../../../lib/api";
import { useToast } from "../../../../../lib/toast";
import { useUpdateSkill } from "../../../../../lib/hooks/skills";
import { SKILL_TYPES, isValidSlug } from "../../../helpers";
import { SkillBodyEditor } from "../../SkillBodyEditor/SkillBodyEditor";
import { s } from "../styles";

const TYPE_VALUES = SKILL_TYPES;

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  // Remounted via key={skill.id} by the parent, so initializers re-run on switch.
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState(skill.type);
  const [body, setBody] = React.useState(skill.body);

  const slugValid = isValidSlug(name);
  const dirty = body !== skill.body;
  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body } },
      {
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) toast.error(t("config.nameTaken"));
        },
      },
    );

  return (
    <div style={s.tabWrap}>
      <div style={s.tabHeader}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle
            on={skill.enabled}
            onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })}
            size={16}
          />
        </label>
      </div>

      <FormField
        label={t("config.name")}
        hint={slugValid ? t("config.nameHint", { slug: name || "skill" }) : t("config.nameHint", { slug: "skill" })}
        required
      >
        <TextInput value={name} onChange={setName} mono placeholder={t("config.namePlaceholder")} />
      </FormField>

      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <TextInput
          value={description}
          onChange={setDescription}
          placeholder={t("config.descriptionPlaceholder")}
        />
      </FormField>

      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as Skill["type"])} options={typeOptions} />
      </FormField>

      <FormField label={t("config.body")} required>
        <SkillBodyEditor filename={`${name || "skill"}.md`} value={body} onChange={setBody} dirty={dirty} />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !slugValid}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        {update.isSuccess && !dirty && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
