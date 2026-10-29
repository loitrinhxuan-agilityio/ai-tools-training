/*
 * Token settings from the approved SEC-01 design (decision brief, S1):
 * HS256 signing, 15-minute lifetime, issuer and audience checked on every
 * request. Issuance is out of SEC-01 scope.
 */
export const JWT_ALGORITHM = 'HS256' as const;
export const JWT_ISSUER = 'banking-event-sourcing';
export const JWT_AUDIENCE = 'banking-event-sourcing-api';
export const JWT_LIFETIME = '15m';
/** Allowed clock skew, in seconds, when a token's issue time is ahead of this server. */
export const JWT_CLOCK_TOLERANCE_SECONDS = 60;
/** Realm named in the WWW-Authenticate challenge (RFC 6750). */
export const JWT_REALM = 'banking-event-sourcing';
