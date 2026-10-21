/*
 * decay.ts — the memory model's accessibility math, ported to the browser.
 * ---------------------------------------------------------------------------
 * The research model (research/lcmem) returns, for a memory of age Δt, the
 * probability it can still be reached. The game uses the same power-law shape,
 * but tuned for playable interview timescales (hours) and driven by each
 * suspect's authored decay / source-amnesia dials rather than fitted constants.
 *
 *   p_access(Δt) = min(1, (1 + Δt/τ)^(-d_eff))
 *
 * d_eff grows with the suspect's `decay`; the source tag decays faster still,
 * scaled by `sourceAmnesia` — so a told detail outlives the memory of being
 * told it, which is exactly a source-monitoring error (an honest false memory).
 */

const TAU = 1.0; // hours — forgetting "turns over" within the first hour

/** Accessibility of a memory's content at age `dtHours`. */
export function accessibility(dtHours: number, decay: number, boost = 1): number {
  const dEff = (0.14 + decay * 0.62) / boost;
  return Math.min(1, Math.pow(1 + Math.max(0, dtHours) / TAU, -dEff));
}

/** Accessibility of the *source tag* — who/where the memory came from. */
export function sourceAccessibility(dtHours: number, decay: number, sourceAmnesia: number, boost = 1): number {
  const dEff = (0.14 + decay * 0.62) / boost;
  const dSrc = dEff * (1 + sourceAmnesia * 3.2);
  return Math.min(1, Math.pow(1 + Math.max(0, dtHours) / TAU, -dSrc));
}
