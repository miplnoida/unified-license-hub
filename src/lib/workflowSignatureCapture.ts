/**
 * Digital-signature capture in the workflow action surfaces
 * (Registration Review, License Requests, Return queue).
 *
 * Business decision: signature capture is hidden from reviewers taking a
 * workflow action. The admin approval-workflow configuration is untouched —
 * `require_digital_signature` is still stored and editable — the runtime
 * simply does not prompt for it, and the server no longer blocks an action
 * that arrives without a signature.
 *
 * Flip this to `true` to bring the signature pad back in one place.
 */
export const WORKFLOW_SIGNATURE_CAPTURE_ENABLED = false;
