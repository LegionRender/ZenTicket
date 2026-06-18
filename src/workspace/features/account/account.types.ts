import type { FiscalProfile, Invoice } from "@/types";

export interface ProfileFormProps {
  initialProfile: FiscalProfile | null;
  onSave: (profile: FiscalProfile) => Promise<void>;
  isSaving: boolean;
  currentUserEmail?: string | null;
  invoices?: Invoice[];
  onTabChange?: (tab: string) => void;
}
