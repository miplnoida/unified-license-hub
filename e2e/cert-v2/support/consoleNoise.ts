/**
 * Dev-tooling console noise (Wave 3B.5 — GAP-3A-005 disposition).
 *
 * The Vite dev instrumentation plugin (`lovable-tagger`) rewrites every JSX
 * element and attaches its own `ref` callback so it can map DOM nodes back to
 * source positions. React therefore emits
 * "Function components cannot be given refs" for EVERY function component in
 * the tree — including `App`, `QueryClientProvider` and node_modules
 * components. It is a dev-server artifact, is absent from the production
 * bundle, and cannot be remedied with `forwardRef` in application code.
 *
 * Certification suites must judge application defects only, so this noise is
 * filtered out. Every other console error is still a hard failure.
 */
const DEV_TOOLING_NOISE: RegExp[] = [
  /Function components cannot be given refs/i,
  /React Router Future Flag Warning/i,
  /Download the React DevTools/i,
];

export function isDevToolingNoise(text: string): boolean {
  return DEV_TOOLING_NOISE.some((re) => re.test(text));
}
