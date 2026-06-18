import type { User } from "firebase/auth";
import type { FiscalProfile } from "@/types";

export interface OnboardingFlowProps {
  user: User | null;
  fiscalProfile: FiscalProfile | null;
  onComplete: (data: FiscalProfile) => Promise<void>;
}
