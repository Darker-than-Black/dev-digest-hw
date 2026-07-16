import React from "react";
import { Icon, type IconName } from "../icons";

export function IconBtn({
  icon,
  label,
  size = 30,
  active,
  onClick,
  danger,
  disabled,
  loading,
}: {
  icon: IconName;
  label: string;
  size?: number;
  active?: boolean;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Spins the icon and implies `disabled` — use for an in-flight async action. */
  loading?: boolean;
}) {
  const I = Icon[icon];
  const [h, setH] = React.useState(false);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: size,
        height: size,
        display: "inline-grid",
        placeItems: "center",
        borderRadius: 6,
        border: "1px solid transparent",
        background: h ? "var(--bg-hover)" : active ? "var(--bg-hover)" : "transparent",
        color: danger && h ? "var(--crit)" : active || h ? "var(--text-primary)" : "var(--text-secondary)",
        transition: "background .12s, color .12s",
        opacity: disabled || loading ? 0.6 : 1,
        cursor: disabled || loading ? "not-allowed" : "pointer",
      }}
    >
      <I size={Math.round(size * 0.52)} style={loading ? { animation: "ddspin 1s linear infinite" } : undefined} />
    </button>
  );
}
