/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract,
   plus the Smart Diff (risk-ordered) panel. Internals (parsePatch, CodeLine,
   the `s` style map, …) stay private to this folder — see SmartDiffViewer's
   "Placement rationale" for why. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export { SmartDiffViewer, type SmartDiffViewerProps } from "./SmartDiffViewer";
