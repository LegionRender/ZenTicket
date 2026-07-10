export type AdminUserVisibilityStatus =
  | "real_user"
  | "incomplete_profile"
  | "mock_or_debug"
  | "orphan_activity"
  | "protected_user";

const PROTECTED_EMAILS = [
  "1985fama@gmail.com",
  "fluczer.dg@gmail.com",
  "legionrender@gmail.com",
  "renderbrands@gmail.com"
];

export function classifyAdminUser(user: {
  userId: string;
  userDisplayName?: string;
  displayName?: string;
  email?: string;
  userEmailMasked?: string;
  emailMasked?: string;
  source?: {
    auth?: boolean;
    firestoreProfile?: boolean;
    fiscalProfile?: boolean;
    tickets?: boolean;
  };
}): AdminUserVisibilityStatus {
  const email = (user.email || "").toLowerCase();
  const displayName = (user.userDisplayName || user.displayName || "").toLowerCase();
  const uid = (user.userId || "").toLowerCase();

  // 1. Protected User check
  if (PROTECTED_EMAILS.includes(email)) {
    return "protected_user";
  }

  // 2. Orphan check (e.g. no auth and has orphan flag, but we will classify based on sources)
  if (user.source && !user.source.auth && user.source.tickets) {
    return "orphan_activity";
  }

  // 3. Mock or Debug check
  const isMockName = displayName.includes("mock") || displayName.includes("debug") || displayName.includes("test") || displayName.includes("jx4pe");
  const isMockEmail = email.includes("mock") || email.includes("debug") || email.includes("test") || email.includes("jx4pe") || email === "" || email === "s/d";
  const isMockUid = uid.includes("mock") || uid.includes("debug") || uid.includes("test");

  if (isMockName || isMockEmail || isMockUid) {
    return "mock_or_debug";
  }

  // 4. Incomplete Profile check
  if (user.source && (!user.source.firestoreProfile || !user.source.fiscalProfile)) {
    return "incomplete_profile";
  }

  // 5. Default Real User
  return "real_user";
}

export function isRealAdminVisibleUser(user: any): boolean {
  const status = classifyAdminUser(user);
  return status === "real_user" || status === "protected_user";
}

export function isIncompleteUser(user: any): boolean {
  return classifyAdminUser(user) === "incomplete_profile";
}

export function isMockOrDebugUser(user: any): boolean {
  return classifyAdminUser(user) === "mock_or_debug";
}

export function getUserVisibilityReason(user: any): string {
  const status = classifyAdminUser(user);
  switch (status) {
    case "protected_user":
      return "Protected: email in administrator whitelist";
    case "orphan_activity":
      return "Orphan activity: tickets exist but no valid Auth user was found";
    case "mock_or_debug":
      return "Mock/Debug: identified by testing patterns in name, email or UID";
    case "incomplete_profile":
      return "Incomplete profile: missing Firestore user document or fiscalProfile";
    case "real_user":
      return "Real user: active profile, valid email and authentic signup";
    default:
      return "Unknown classification";
  }
}
