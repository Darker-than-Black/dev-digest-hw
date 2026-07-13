/* Placeholder for the Evals / Stats tabs — the data + eval harness they need
   arrive in later lessons; the tab exists so the layout matches the design. */
"use client";

import React from "react";
import { EmptyState, type IconName } from "@devdigest/ui";
import { s } from "../styles";

export function StubTab({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div style={s.tabWrap}>
      <EmptyState icon={icon} title={title} body={body} />
    </div>
  );
}
