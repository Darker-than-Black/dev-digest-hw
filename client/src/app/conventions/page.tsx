/* /conventions — Conventions extractor. Scan the active repo for de-facto house
   rules, accept/reject/edit the candidates, then merge the accepted ones into a
   single skill. The active repo comes from the shell repo switcher. */
"use client";

import React from "react";
import { ConventionsView } from "./_components/ConventionsView";

export default function ConventionsPage() {
  return (
    <React.Suspense fallback={null}>
      <ConventionsView />
    </React.Suspense>
  );
}
