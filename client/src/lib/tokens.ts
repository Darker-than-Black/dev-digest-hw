/* tokens.ts — cheap, deterministic token-count estimate for UI badges.

   Not a real tokenizer (no model call): ~4 chars/token is the standard rough
   heuristic for English + code. Used for the skill-body editor badge and the
   run-trace per-block token counts — both are informational, so an estimate is
   fine and avoids shipping a tokenizer to the browser. */

/** Estimate the token count of `text` (~4 chars/token). Empty → 0. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
