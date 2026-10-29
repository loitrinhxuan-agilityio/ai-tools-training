import { SetMetadata } from '@nestjs/common';

export const REQUIRED_ROLE_KEY = 'requiredRole';

/**
 * Restricts a route to callers holding `role`. Routes without it need
 * authentication only.
 */
export const RequireRole = (role: string) => SetMetadata(REQUIRED_ROLE_KEY, role);
