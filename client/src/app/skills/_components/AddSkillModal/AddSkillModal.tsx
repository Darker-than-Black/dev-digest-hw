/* AddSkillModal — create a skill from scratch or import one from a Markdown /
   zip file. Import parses a server-side PREVIEW first; nothing is saved (and no
   archive script is ever run) until the user confirms. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Tabs, FormField, TextInput, SelectInput, Textarea, Button, Badge, Icon } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { useToast } from "../../../../lib/toast";
import {
  useCreateSkill,
  useImportSkillPreview,
  useConfirmImportSkill,
} from "../../../../lib/hooks/skills";
import { SKILL_TYPES } from "../../helpers";
import { s } from "./styles";

const TYPE_VALUES = SKILL_TYPES;

/** Read a File as a base64 string (no data: prefix) for the import endpoint. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const res = reader.result as string;
      resolve(res.slice(res.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function AddSkillModal({
  initialTab = "create",
  onClose,
  onCreated,
}: {
  initialTab?: "create" | "import";
  onClose: () => void;
  onCreated: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const [tab, setTab] = React.useState<string>(initialTab);

  // create
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<Skill["type"]>("custom");
  const [description, setDescription] = React.useState("");

  // import
  const preview = useImportSkillPreview();
  const confirm = useConfirmImportSkill();
  const [parsed, setParsed] = React.useState<SkillImportPreview | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`type.${v}`) }));

  const submitCreate = () =>
    create.mutate(
      { name, type, description },
      { onSuccess: (skill) => onCreated(skill) },
    );

  const onFile = async (file: File) => {
    try {
      const content_base64 = await fileToBase64(file);
      const result = await preview.mutateAsync({ filename: file.name, content_base64 });
      setParsed(result);
    } catch (err) {
      toast.error(t("add.import.failed"));
    }
  };

  const submitImport = () => {
    if (!parsed) return;
    confirm.mutate(parsed, {
      onSuccess: (skill) => {
        toast.success(t("add.import.success", { name: skill.name }));
        onCreated(skill);
      },
    });
  };

  return (
    <Modal width={620} title={t("add.title")} onClose={onClose}>
      <Tabs
        tabs={[
          { key: "create", label: t("add.createTab") },
          { key: "import", label: t("add.importTab") },
        ]}
        value={tab}
        onChange={setTab}
        pad="0"
      />

      {tab === "create" && (
        <div style={s.pane}>
          <FormField label={t("add.create.nameLabel")} required>
            <TextInput value={name} onChange={setName} mono placeholder={t("add.create.namePlaceholder")} />
          </FormField>
          <FormField label={t("add.create.typeLabel")}>
            <SelectInput value={type} onChange={(v) => setType(v as Skill["type"])} options={typeOptions} />
          </FormField>
          <FormField label={t("add.create.descriptionLabel")}>
            <Textarea
              value={description}
              onChange={setDescription}
              rows={3}
              placeholder={t("add.create.descriptionPlaceholder")}
            />
          </FormField>
          <div style={s.actions}>
            <Button kind="primary" icon="Plus" onClick={submitCreate} disabled={create.isPending || !name}>
              {create.isPending ? t("add.create.creating") : t("add.create.submit")}
            </Button>
          </div>
        </div>
      )}

      {tab === "import" && (
        <div style={s.pane}>
          {!parsed ? (
            <>
              <div
                style={s.dropzone}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) void onFile(f);
                }}
              >
                <Icon.Upload size={22} style={{ color: "var(--text-muted)" }} />
                <span style={s.dropLabel}>{t("add.import.dropLabel")}</span>
                <span style={s.dropHint}>{t("add.import.dropHint")}</span>
                <Button kind="secondary" size="sm" icon="FileText" disabled={preview.isPending}>
                  {preview.isPending ? t("add.import.parsing") : t("add.import.choose")}
                </Button>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept=".md,.markdown,.txt,.zip"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </>
          ) : (
            <>
              <div style={s.trust}>
                <Icon.AlertTriangle size={15} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={s.trustTitle}>{t("add.import.trustTitle")}</div>
                  <div style={s.trustBody}>{t("add.import.trustBody")}</div>
                </div>
              </div>
              <FormField label={t("add.import.previewName")}>
                <TextInput value={parsed.name} onChange={(v) => setParsed({ ...parsed, name: v })} mono />
              </FormField>
              <FormField label={t("add.import.previewType")}>
                <SelectInput
                  value={parsed.type}
                  onChange={(v) => setParsed({ ...parsed, type: v as Skill["type"] })}
                  options={typeOptions}
                />
              </FormField>
              <FormField label={t("add.import.previewBody")}>
                <Textarea value={parsed.body} onChange={(v) => setParsed({ ...parsed, body: v })} rows={7} mono />
              </FormField>
              {parsed.ignored_files.length > 0 && (
                <div style={s.ignored}>
                  <div style={s.ignoredTitle}>{t("add.import.ignoredTitle")}</div>
                  <div style={s.ignoredList}>
                    {parsed.ignored_files.map((f) => (
                      <Badge key={f} color="var(--text-muted)" mono>
                        {f}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div style={s.actions}>
                <Button kind="primary" icon="Check" onClick={submitImport} disabled={confirm.isPending}>
                  {confirm.isPending ? t("add.import.saving") : t("add.import.save")}
                </Button>
                <Button kind="ghost" onClick={() => setParsed(null)}>
                  ←
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
