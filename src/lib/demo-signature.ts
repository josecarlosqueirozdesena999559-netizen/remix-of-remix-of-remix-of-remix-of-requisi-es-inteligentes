import type { CurrentUserProfile } from "@/lib/user-profile";

export const DEMO_SIGNATURE_PROFILE_ID = "34708484-8caa-456b-a423-9f91aeba52d8";
export const DEMO_SIGNATURE_EMAIL = "demo.assinatura@usuarios.solicite.local";

/** This feature is deliberately restricted to the dedicated demo account. */
export function isDemoSignatureUser(
  user: { id?: string; email?: string | null } | null | undefined,
  profile: CurrentUserProfile | null | undefined,
) {
  return Boolean(
    user?.id &&
    user.email?.trim().toLowerCase() === DEMO_SIGNATURE_EMAIL &&
    profile?.id === DEMO_SIGNATURE_PROFILE_ID &&
    profile.auth_user_id === user.id &&
    !profile.is_admin,
  );
}
