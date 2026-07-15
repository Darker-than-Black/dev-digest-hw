/* IntentCard — derived {intent, in_scope[], out_of_scope[]} for a PR, with a
   manual recompute button. Container tier: calls its own data hooks (no
   server-passed mirror state). Pre-first-compute (usePrIntent resolves to
   `null`) shows the shared "unavailable" brief copy plus the same recompute
   affordance so the user can trigger the first compute manually. */
"use client";

import { Card, SectionLabel, IconBtn, Icon, type IconName } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { usePrIntent, useRecomputeIntent } from "@/lib/hooks";
import {
  INTENT_ICON,
  RECOMPUTE_ICON,
  IN_SCOPE_ICON,
  OUT_OF_SCOPE_ICON,
} from "./constants";
import { s } from "./styles";

function ScopeColumn({
  heading,
  icon,
  items,
  tone,
}: {
  heading: string;
  icon: IconName;
  items: readonly string[];
  tone: "in" | "out";
}) {
  const I = Icon[icon];
  return (
    <div>
      <h4
        style={{
          ...s.scopeHeading,
          ...(tone === "in" ? s.scopeHeadingIn : s.scopeHeadingOut),
        }}
      >
        <I size={12} aria-hidden />
        {heading}
      </h4>
      {items.length > 0 ? (
        <ul style={s.scopeList}>
          {items.map((item, i) => (
            <li
              key={i}
              style={{
                ...s.scopeItem,
                ...(tone === "in" ? s.scopeItemIn : s.scopeItemOut),
              }}
            >
              <span style={s.bullet} aria-hidden>
                &middot;
              </span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p style={s.empty}>&mdash;</p>
      )}
    </div>
  );
}

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("brief");
  const { data, isLoading } = usePrIntent(prId);
  const recompute = useRecomputeIntent(prId);

  const handleRecompute = () => {
    if (!prId || recompute.isPending) return;
    recompute.mutate();
  };

  return (
    <Card>
      <SectionLabel
        icon={INTENT_ICON}
        right={
          <IconBtn
            icon={RECOMPUTE_ICON}
            label={recompute.isPending ? t("recomputing") : t("recompute")}
            onClick={handleRecompute}
            disabled={!prId}
            loading={recompute.isPending}
          />
        }
      >
        {t("block.intent")}
      </SectionLabel>

      {isLoading ? (
        <p style={s.unavailableHint}>{t("loading")}</p>
      ) : data ? (
        <div>
          <p style={s.intentText}>&ldquo;{data.intent}&rdquo;</p>
          <div style={s.scopeGrid}>
            <ScopeColumn
              heading={t("inScope")}
              icon={IN_SCOPE_ICON}
              items={data.in_scope}
              tone="in"
            />
            <ScopeColumn
              heading={t("outOfScope")}
              icon={OUT_OF_SCOPE_ICON}
              items={data.out_of_scope}
              tone="out"
            />
          </div>
        </div>
      ) : (
        <div>
          <p style={s.unavailable}>{t("unavailable")}</p>
          <p style={s.unavailableHint}>{t("unavailableHint")}</p>
        </div>
      )}
    </Card>
  );
}
