import { createAuthClient } from "better-auth/react";

/** Browser side of the login: talks to /api/auth on the same origin. */
export const authClient = createAuthClient();

/**
 * Turns a failed auth call (or an /api/users error) into a key of t.auth.errors.
 * An unknown email and a wrong password give the same message.
 */
export function authErrorKey(error: { status?: number; code?: string } | null | undefined) {
  if (error?.status === 429) return "tooMany" as const;
  switch (error?.code) {
    case "EMAIL_NOT_ALLOWED":
      return "notAllowed" as const;
    case "SIGN_UP_CLOSED":
      return "signUpClosed" as const;
    case "INVALID_EMAIL_OR_PASSWORD":
      return "wrongCredentials" as const;
    case "INVALID_PASSWORD":
      return "wrongCurrentPassword" as const;
    case "INVALID_EMAIL":
      return "invalidEmail" as const;
    case "PASSWORD_TOO_SHORT":
      return "passwordTooShort" as const;
    case "PASSWORD_TOO_LONG":
      return "passwordTooLong" as const;
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "userExists" as const;
    default:
      return "generic" as const;
  }
}
