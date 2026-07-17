import React from "react";

export function MonoLink({
  children,
  onClick,
  href,
  style: styleOverride,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  /** When set, renders an anchor that opens in a new tab (middle-click works). */
  href?: string;
  /** Merged over the base style — e.g. a long file path in a flex row needs
     `minWidth: 0` + `overflowWrap` to wrap instead of overflowing its row. */
  style?: React.CSSProperties;
}) {
  const [h, setH] = React.useState(false);
  const style: React.CSSProperties = {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13,
    cursor: "pointer",
    color: h ? "var(--accent-text)" : "var(--text-secondary)",
    textDecoration: h ? "underline" : "none",
    textUnderlineOffset: 2,
    ...styleOverride,
  };

  if (href) {
    return (
      <a
        className="mono"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setH(true)}
        onMouseLeave={() => setH(false)}
        style={style}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      className="mono"
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={style}
    >
      {children}
    </button>
  );
}
