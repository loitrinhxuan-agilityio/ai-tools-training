/**
 * Role that may read raw event history (`GET /accounts/:id/events`). Name
 * approved by the security reviewer on 2026-10-29 (R1), replacing the name
 * first recorded under S2.
 */
export const INTERNAL_SUPPORT_ROLE = 'INTERNAL_SUPPORT';

/**
 * Allow-list of roles a token may carry. A token with any other role is
 * refused as unauthenticated. Only the internal role is approved so far.
 */
export const RECOGNIZED_ROLES: readonly string[] = [INTERNAL_SUPPORT_ROLE];
