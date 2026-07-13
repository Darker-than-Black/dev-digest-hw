import React from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Shared dialog accessibility for Modal/Drawer:
 *  - Escape closes the dialog.
 *  - Focus moves into the dialog on open (first focusable, else the container).
 *  - Tab / Shift+Tab are trapped so focus cycles within the dialog.
 *  - Focus returns to the previously-focused element on close.
 *
 *  Attach the returned ref to the dialog container and give that container
 *  `tabIndex={-1}` so it can hold focus when it has no focusable children. */
export function useDialogA11y(onClose?: () => void) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  // Keep the latest onClose without re-running the mount effect.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const prevFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );

    (focusables()[0] ?? node).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0]!;
      const last = els[els.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      prevFocused?.focus?.();
    };
  }, []);

  return ref;
}
