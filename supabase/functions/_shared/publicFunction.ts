// Explicit marker for edge functions that are intentionally public (no
// module.action permission required). Calling this is a no-op at runtime;
// its purpose is to make the audit script in
// `scripts/verify-edge-authz.mjs` accept the file.
//
// Every public function must document a reason.
export function markPublicFunction(reason: string): void {
  // Read the argument so tree-shakers / linters don't strip the call.
  if (!reason) throw new Error('markPublicFunction requires a reason');
}
