import type React from "react";

/** Props that make a non-`<button>` element (e.g. a styled `<div>` disclosure
 *  header) keyboard-operable: focusable, activates on Enter/Space, and — when
 *  `expanded` is supplied — announces its collapsed/expanded state to screen
 *  readers. Mirrors the hand-rolled pattern in ReviewRunAccordion so every
 *  collapse header behaves identically. Spread onto the element and drop the
 *  element's own `onClick`:
 *
 *      <div {...disclosureProps(() => setOpen((o) => !o), open)} style={…}>
 */
export function disclosureProps(
  toggle: () => void,
  expanded?: boolean,
): {
  role: "button";
  tabIndex: 0;
  "aria-expanded"?: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
} {
  return {
    role: "button",
    tabIndex: 0,
    ...(expanded === undefined ? {} : { "aria-expanded": expanded }),
    onClick: toggle,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
  };
}
