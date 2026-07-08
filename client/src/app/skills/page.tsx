/* /skills — Skills Lab. A searchable list of reusable, text-only skills plus the
   selected skill's editor. Selection + tab live in ?skill=&tab=. */
"use client";

import React from "react";
import { SkillsView } from "./_components/SkillsView";

export default function SkillsPage() {
  return (
    <React.Suspense fallback={null}>
      <SkillsView />
    </React.Suspense>
  );
}
