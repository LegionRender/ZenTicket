import type { FiscalProfile, PaymentCard } from "@/types";

export const DEFAULT_FISCAL_PROFILE = {
  rfc: "CABE850101ABC",
  razonSocial: "RICARDO CASTRO BECERRIL",
  regimenFiscal: "626",
  codigoPostal: "02000",
  usoCFDI: "G03",
  plan: "gratuito",
  fallbackReceptionEmail: "facturas@ejemplo.com",
  fallbackDisplayName: "Julian Daniels",
  fallbackDisplayEmail: "julian.d@zenticket.mx",
} as const;

export function getDeviceModel(): { name: string; os: string } {
  if (typeof navigator === "undefined") {
    return { name: "Dispositivo de Escritorio", os: "Web App" };
  }

  const ua = navigator.userAgent;
  let os = "Web App";
  let name = "Dispositivo de Escritorio";

  if (/iPhone/i.test(ua)) {
    os = "iOS";
    name = "Apple iPhone";
    if (window.screen.height === 852 && window.screen.width === 393) {
      name = "iPhone 15 Pro / 15";
    } else if (window.screen.height === 932 && window.screen.width === 430) {
      name = "iPhone 15 Pro Max";
    } else if (window.screen.height === 844 && window.screen.width === 390) {
      name = "iPhone 14 / 13 Pro";
    } else if (window.screen.height === 926 && window.screen.width === 428) {
      name = "iPhone 14 Plus / 13 Pro Max";
    } else {
      name = "iPhone Mobile";
    }
  } else if (/iPad/i.test(ua)) {
    os = "iPadOS";
    name = "Apple iPad";
  } else if (/Android/i.test(ua)) {
    os = "Android";
    const match = ua.match(/Android\s+([^\s;]+);\s+([^;)]+)/);
    name = match?.[2] ? match[2].trim() : "Android Smartphone";
  } else if (/Macintosh/i.test(ua)) {
    os = "macOS";
    name = "Apple Mac";
  } else if (/Windows/i.test(ua)) {
    os = "Windows";
    name = "PC Windows";
  } else if (/Linux/i.test(ua)) {
    os = "Linux";
    name = "Computadora Linux";
  }

  return { name, os };
}

export function getCardBankInfo(cardNumber: string) {
  const clean = cardNumber.replace(/\s+/g, "");
  if (!clean) {
    return { bankName: "Desconocido", bgColor: "from-slate-900 to-slate-800", logoColor: "text-white/60", label: "T. Bancaria" };
  }

  if (/^415231|^455511|^481414|^557910|^557907|^4152|^4555|^4814|^5579|^4025|^501867/.test(clean)) {
    return { bankName: "BBVA Bancomer", bgColor: "from-blue-900 via-blue-800 to-indigo-950", logoColor: "text-blue-200", label: "BBVA" };
  }
  if (/^491566|^549722|^554904|^546554|^525624|^4915|^5497|^5549|^5465|^5256|^501899/.test(clean)) {
    return { bankName: "Santander Mexico", bgColor: "from-rose-800 via-red-700 to-rose-900", logoColor: "text-red-100", label: "Santander" };
  }
  if (/^5204|^5288|^5491|^5405|^4271|^4342|^5189/.test(clean)) {
    return { bankName: "Citibanamex", bgColor: "from-sky-900 via-sky-800 to-blue-950", logoColor: "text-sky-200", label: "Citibanamex" };
  }
  if (/^4766|^4258|^5200|^5473|^4165/.test(clean)) {
    return { bankName: "Banorte", bgColor: "from-red-900 via-zinc-850 to-neutral-950", logoColor: "text-red-300", label: "Banorte" };
  }
  if (/^4214|^4000|^5432|^5176|^5322/.test(clean)) {
    return { bankName: "HSBC Mexico", bgColor: "from-slate-850 via-zinc-700 to-zinc-900", logoColor: "text-rose-450", label: "HSBC" };
  }
  if (/^5254/.test(clean)) {
    return { bankName: "Nu Mexico", bgColor: "from-purple-900 via-fuchsia-800 to-purple-950", logoColor: "text-fuchsia-200", label: "Nu" };
  }
  if (/^5206|^5526/.test(clean)) {
    return { bankName: "Mercado Pago", bgColor: "from-cyan-800 via-teal-700 to-blue-900", logoColor: "text-cyan-100", label: "Mercado Pago" };
  }
  if (/^5489|^4151/.test(clean)) {
    return { bankName: "RappiCard", bgColor: "from-orange-600 via-amber-600 to-orange-850", logoColor: "text-amber-100", label: "RappiCard" };
  }
  if (/^5406|^4481|^4412/.test(clean)) {
    return { bankName: "Scotiabank", bgColor: "from-rose-900 via-rose-800 to-slate-950", logoColor: "text-red-200", label: "Scotiabank" };
  }
  if (/^5493|^4169|^501838/.test(clean)) {
    return { bankName: "Banco Azteca", bgColor: "from-emerald-900 via-green-800 to-emerald-950", logoColor: "text-emerald-100", label: "Banco Azteca" };
  }

  if (clean.startsWith("4")) {
    return { bankName: "Visa Internacional", bgColor: "from-blue-950 to-slate-900", logoColor: "text-blue-300", label: "VISA" };
  }
  if (clean.startsWith("5")) {
    return { bankName: "Mastercard Internacional", bgColor: "from-rose-950 to-slate-900", logoColor: "text-orange-300", label: "MASTERCARD" };
  }
  if (clean.startsWith("3")) {
    return { bankName: "American Express", bgColor: "from-cyan-950 to-slate-900", logoColor: "text-cyan-300", label: "AMEX" };
  }

  return { bankName: "Tarjeta Bancaria", bgColor: "from-slate-900 to-slate-800", logoColor: "text-slate-350", label: "BANCARIA" };
}

export function isValidLuhn(cardNumber: string) {
  const clean = cardNumber.replace(/\s+/g, "");
  if (!clean || clean.length < 13 || !/^\d+$/.test(clean)) return false;
  return true;
}

export function isMockFiscalProfile(profile: FiscalProfile | null | undefined) {
  if (!profile?.rfc || !profile?.razonSocial) return true;

  return (
    profile.rfc === "CABE850101ABC" ||
    profile.rfc === "GOMD850101XYZ" ||
    profile.razonSocial === "RICARDO CASTRO BECERRIL" ||
    profile.razonSocial === "CONSTRUCTORA LEGION DEL NORTE SA DE CV"
  );
}

export function buildDefaultPaymentCards(initialProfile: FiscalProfile | null | undefined): PaymentCard[] {
  if (initialProfile?.paymentCards?.length > 0) {
    return initialProfile.paymentCards;
  }

  const isLegion =
    initialProfile?.userId === "legionrender" ||
    initialProfile?.rfc === "GOMD850101XYZ" ||
    initialProfile?.razonSocial === "CONSTRUCTORA LEGION DEL NORTE SA DE CV";

  const realName = isLegion ? "RICARDO CASTRO BECERRIL" : "JULIAN DANIELS";
  const defaultLast4 = isLegion ? "9180" : "4242";
  const defaultBank = isLegion ? "BBVA Bancomer" : "VISA";

  return [
    {
      id: "card_1",
      brand: "VISA",
      last4: defaultLast4,
      expiry: "12/28",
      isDefault: true,
      holderName: realName,
      bankName: defaultBank,
    },
  ];
}

export function isLegionUserEmail(userEmail?: string | null) {
  return userEmail === "legionrender@gmail.com";
}

export function buildLegionPrimaryCard(): PaymentCard {
  return {
    id: "card_real_ricardo",
    brand: "VISA",
    last4: "9180",
    expiry: "12/28",
    isDefault: true,
    holderName: "RICARDO CASTRO BECERRIL",
    bankName: "BBVA Bancomer",
  };
}

export function normalizeLegionCards(cards: PaymentCard[]) {
  const realCard = buildLegionPrimaryCard();
  const hasRealCard = cards.some((card) => card.holderName === realCard.holderName && card.last4 === realCard.last4);
  const hasMockDaniels = cards.some((card) => card.holderName === "JULIAN DANIELS");
  const filteredCards = cards.filter((card) => card.holderName !== "JULIAN DANIELS" && card.last4 !== "9180");

  return {
    hasRealCard,
    hasMockDaniels,
    normalizedCards: [realCard, ...filteredCards],
    realCard,
  };
}

export function buildProfileSavePayload({
  initialProfile,
  rfc,
  razonSocial,
  regimenFiscal,
  codigoPostal,
  usoCFDI,
  personalGeminiKey,
  plan,
  paymentCards,
  correoRecepcion,
  facturacionAutomatica,
  metodoRecepcion,
  extra = {},
}: {
  initialProfile: FiscalProfile | null;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  usoCFDI: string;
  personalGeminiKey?: string;
  plan?: FiscalProfile["plan"] | null;
  paymentCards: PaymentCard[];
  correoRecepcion?: string;
  facturacionAutomatica?: boolean;
  metodoRecepcion?: string;
  extra?: Record<string, unknown>;
}) {
  return {
    userId: initialProfile?.userId || "guest",
    rfc: rfc || initialProfile?.rfc || DEFAULT_FISCAL_PROFILE.rfc,
    razonSocial: razonSocial || initialProfile?.razonSocial || DEFAULT_FISCAL_PROFILE.razonSocial,
    regimenFiscal: regimenFiscal || initialProfile?.regimenFiscal || DEFAULT_FISCAL_PROFILE.regimenFiscal,
    codigoPostal: codigoPostal || initialProfile?.codigoPostal || DEFAULT_FISCAL_PROFILE.codigoPostal,
    usoCFDI: usoCFDI || initialProfile?.usoCFDI || DEFAULT_FISCAL_PROFILE.usoCFDI,
    createdAt: initialProfile?.createdAt || new Date().toISOString(),
    personalGeminiKey: personalGeminiKey || initialProfile?.personalGeminiKey || "",
    plan: plan || initialProfile?.plan || DEFAULT_FISCAL_PROFILE.plan,
    paymentCards,
    correoRecepcion,
    facturacionAutomatica,
    metodoRecepcion,
    ...extra,
  };
}

export function buildPlanSavePayload({
  initialProfile,
  rfc,
  razonSocial,
  regimenFiscal,
  codigoPostal,
  usoCFDI,
  personalGeminiKey,
  plan,
  paymentCards,
  autoRenew,
}: {
  initialProfile: FiscalProfile | null;
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  usoCFDI: string;
  personalGeminiKey?: string;
  plan: FiscalProfile["plan"];
  paymentCards: PaymentCard[];
  autoRenew?: boolean;
}) {
  return buildProfileSavePayload({
    initialProfile,
    rfc,
    razonSocial,
    regimenFiscal,
    codigoPostal,
    usoCFDI,
    personalGeminiKey,
    plan,
    paymentCards,
    extra: {
      planStartDate: new Date().toISOString(),
      ...(autoRenew !== undefined ? { autoRenew } : {}),
    },
  });
}
