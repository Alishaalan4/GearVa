// Error codes returned by the API (README section 5.6).
// Every error response has the shape { code, message, details }.
// Add codes here as features need them; never return a code that is not listed.
export const ERROR_CODES = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_2FA_CODE: 'INVALID_2FA_CODE',
  TOTP_ALREADY_ENABLED: 'TOTP_ALREADY_ENABLED',
  TOTP_NOT_ENABLED: 'TOTP_NOT_ENABLED',
  TOTP_SETUP_REQUIRED: 'TOTP_SETUP_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  EMAIL_ALREADY_USED: 'EMAIL_ALREADY_USED',
  OWNER_ALREADY_ACTIVE: 'OWNER_ALREADY_ACTIVE',
  OWNER_NOT_ACTIVATED: 'OWNER_NOT_ACTIVATED',
  GARAGE_ALREADY_SUSPENDED: 'GARAGE_ALREADY_SUSPENDED',
  GARAGE_NOT_SUSPENDED: 'GARAGE_NOT_SUSPENDED',
  GARAGE_LOCKED: 'GARAGE_LOCKED',
  INVALID_LINK: 'INVALID_LINK',
  USER_ALREADY_ACTIVE: 'USER_ALREADY_ACTIVE',
  USER_NOT_ACTIVATED: 'USER_NOT_ACTIVATED',
  CANNOT_MODIFY_OWNER: 'CANNOT_MODIFY_OWNER',
  MAIN_BRANCH_REQUIRED: 'MAIN_BRANCH_REQUIRED',
  /** A car with this plate already exists in the garage; details.vehicle is that car. */
  VEHICLE_PLATE_EXISTS: 'VEHICLE_PLATE_EXISTS',
  /** An odometer lower than the last one or a jump over 5,000 km/day must be confirmed. */
  ODOMETER_CONFIRMATION_REQUIRED: 'ODOMETER_CONFIRMATION_REQUIRED',
  VISIT_ALREADY_FINISHED: 'VISIT_ALREADY_FINISHED',
  VISIT_HAS_NO_RECORDS: 'VISIT_HAS_NO_RECORDS',
  /** A branch with active staff cannot be deactivated; move or deactivate them first. */
  BRANCH_HAS_STAFF: 'BRANCH_HAS_STAFF',
  /** An active staff member cannot be placed in (or reactivated in) an inactive branch. */
  BRANCH_INACTIVE: 'BRANCH_INACTIVE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details: Record<string, unknown>;
}
