import React, { useState, useRef } from "react";
import { FiscalProfile, PaymentCard } from "@/shared/types/types";
import { parseConstancia } from "@/services/api";
import { 
  Save, AlertCircle, Sparkles, CreditCard, Shield, HelpCircle, 
  CheckCircle, Info, ChevronRight, Palette, Bell, Globe, 
  BookOpen, MessageSquare, Trash2, LogOut, Plus, MoreVertical, Pencil,
  ArrowLeft, Smartphone, Lock, X, Infinity, Check, Sliders, Volume2, ShieldCheck, HeartPulse,
  ChevronDown, Copy, Eye, EyeOff
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { auth, db } from "@/services/firebase/firebase";
import { signOut, sendPasswordResetEmail, updatePassword, EmailAuthProvider, linkWithCredential } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useToast } from "@/shared/feedback/Toast";
import { getApiUrl } from "@/services/api/api-client";

// Bank and payment method logos
import santanderLogo from "@/assets/logos pagos/Banco_Santander_Logotipo.png";
import hsbcLogo from "@/assets/logos pagos/HSBC_Logo.png";
import aztecaLogo from "@/assets/logos pagos/Logo_Banco_Azteca.png";
import banamexLogo from "@/assets/logos pagos/Logo_de_Banamex.png";
import banorteLogo from "@/assets/logos pagos/Logo_de_Banorte.png";
import inbursaLogo from "@/assets/logos pagos/Logo_de_Inbursa.png";
import mastercardLogo from "@/assets/logos pagos/MasterCard.png";
import mercadoPagoLogo from "@/assets/logos pagos/Mercado Pago Logo.png";
import scotiabankLogo from "@/assets/logos pagos/Scotiabank_logo.png";
import stripeLogo from "@/assets/logos pagos/Stripe_Logo.png";
import visaLogo from "@/assets/logos pagos/Visa.png";
import applePayLogo from "@/assets/logos pagos/apple-pay-logo.png";
import bbvaLogo from "@/assets/logos pagos/bbva-logo.png";
import googlePayLogo from "@/assets/logos pagos/google-pay-logo.png";
import paypalLogo from "@/assets/logos pagos/paypal-logo-2.png";
import spinLogo from "@/assets/logos pagos/SPIN-BY-OXXO.png";

interface ProfileFormProps {
  initialProfile: any; // Allow flexible properties like planStartDate, autoRenew
  onSave: (profile: any) => Promise<void>;
  isSaving: boolean;
  currentUserEmail?: string | null;
  invoices?: any[];
  onTabChange?: (tab: string) => void;
}

function getDeviceModel(): { name: string; os: string } {
  if (typeof navigator === "undefined") return { name: "Dispositivo de Escritorio", os: "Web App" };
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
    if (match && match[2]) {
      name = match[2].trim();
    } else {
      name = "Android Smartphone";
    }
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

const loadScript = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.body.appendChild(script);
  });
};

const fetchPayPalClientId = async (): Promise<string> => {
  try {
    const res = await fetch(getApiUrl("/api/config/paypal-client-id"));
    const data = await res.json();
    return data.clientId;
  } catch (err) {
    console.error("Error fetching PayPal client ID:", err);
    return "";
  }
};

const digitalWallets = [
  { id: "stripe_wallet", name: "Stripe", displayName: "Tarjeta (Stripe)", logo: stripeLogo, sub: "Pago seguro con tarjeta, Google Pay o Link" },
  { id: "paypal_wallet", name: "PayPal", displayName: "PayPal", logo: paypalLogo, sub: "Pago rápido y seguro" },
  { id: "mercadopago_wallet", name: "Mercado Pago", displayName: "Mercado Pago", logo: mercadoPagoLogo, sub: "Tu cuenta digital / Tarjetas" },
  { id: "googlepay_wallet", name: "Google Pay", displayName: "Google Pay", logo: googlePayLogo, sub: "Billetera de Google" },
];

export default function ProfileForm({ 
  initialProfile, 
  onSave, 
  isSaving,
  currentUserEmail,
  invoices = [],
  onTabChange
}: ProfileFormProps) {
  const toast = useToast();
  // State for automatic renewal choice inside the checkout flow
  const [autoRenewChoice, setAutoRenewChoice] = useState(true);
  const sessionUser = auth.currentUser;
  const sessionEmail = currentUserEmail || sessionUser?.email || "";
  const sessionName = sessionUser?.displayName || (sessionEmail ? sessionEmail.split("@")[0] : "");
  const isPlaceholderFiscalValue = (value?: string | null) => {
    const normalized = (value || "").trim().toUpperCase();
    return !normalized ||
      normalized === "CABE850101ABC" ||
      normalized === "GOMD850101XYZ" ||
      normalized === "RICARDO CASTRO BECERRIL" ||
      normalized === "CONSTRUCTORA LEGION DEL NORTE SA DE CV";
  };
  const savedFiscalName = !isPlaceholderFiscalValue(initialProfile?.razonSocial) ? initialProfile?.razonSocial : "";
  const savedFiscalRfc = !isPlaceholderFiscalValue(initialProfile?.rfc) ? initialProfile?.rfc : "";

  // Helper functions for validating card numbers using the Luhn Algorithm and detecting bank names
  const getCardBankInfo = (cardNumber: string) => {
    const clean = cardNumber.replace(/\s+/g, "");
    if (!clean) return { bankName: "Desconocido", bgColor: "from-slate-900 to-slate-800", logoColor: "text-white/60", label: "T. Bancaria" };

    // Mexican Card Bin mappings
    if (/^415231|^455511|^481414|^557910|^557907|^4152|^4555|^4814|^5579|^4025|^501867/.test(clean)) {
      return { bankName: "BBVA Bancomer", bgColor: "from-blue-900 via-blue-800 to-indigo-950", logoColor: "text-blue-200", label: "BBVA" };
    }
    if (/^491566|^549722|^554904|^546554|^525624|^4915|^5497|^5549|^5465|^5256|^501899/.test(clean)) {
      return { bankName: "Santander México", bgColor: "from-rose-800 via-red-700 to-rose-900", logoColor: "text-red-100", label: "Santander" };
    }
    if (/^5204|^5288|^5491|^5405|^4271|^4342|^5189/.test(clean)) {
      return { bankName: "Citibanamex", bgColor: "from-sky-900 via-sky-800 to-blue-950", logoColor: "text-sky-200", label: "Citibanamex" };
    }
    if (/^4766|^4258|^5200|^5473|^4165/.test(clean)) {
      return { bankName: "Banorte", bgColor: "from-red-900 via-zinc-850 to-neutral-950", logoColor: "text-red-300", label: "Banorte" };
    }
    if (/^4214|^4000|^5432|^5176|^5322/.test(clean)) {
      return { bankName: "HSBC México", bgColor: "from-slate-850 via-zinc-700 to-zinc-900", logoColor: "text-rose-450", label: "HSBC" };
    }
    if (/^5254/.test(clean)) {
      return { bankName: "Nu México", bgColor: "from-purple-900 via-fuchsia-800 to-purple-950", logoColor: "text-fuchsia-200", label: "Nu" };
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
    if (clean.startsWith("5") || clean.startsWith("2")) {
      return { bankName: "Mastercard Internacional", bgColor: "from-rose-950 to-slate-900", logoColor: "text-orange-300", label: "MASTERCARD" };
    }
    if (clean.startsWith("3")) {
      return { bankName: "American Express", bgColor: "from-cyan-950 to-slate-900", logoColor: "text-cyan-300", label: "AMEX" };
    }
    return { bankName: "Tarjeta Bancaria", bgColor: "from-slate-900 to-slate-800", logoColor: "text-slate-350", label: "BANCARIA" };
  };

  const getCardLogo = (card: any) => {
    if (card.brand === "VISA") return visaLogo;
    if (card.brand === "MASTERCARD") return mastercardLogo;
    if (card.brand === "MERCADOPAGO") return mercadoPagoLogo;
    if (card.brand === "PAYPAL") return paypalLogo;
    if (card.brand === "APPLEPAY") return applePayLogo;
    if (card.brand === "GOOGLEPAY") return googlePayLogo;
    if (card.brand === "SPINBYOXXO") return spinLogo;

    let bankName = card.bankName || "";
    if (!bankName) {
      const bankInfo = getCardBankInfo(card.last4 ? "4" + card.last4 : "4");
      bankName = bankInfo.bankName;
    }
    
    const bank = bankName.toLowerCase();
    
    if (bank.includes("bbva") || bank.includes("bancomer")) return bbvaLogo;
    if (bank.includes("santander")) return santanderLogo;
    if (bank.includes("banamex") || bank.includes("citibanamex")) return banamexLogo;
    if (bank.includes("banorte")) return banorteLogo;
    if (bank.includes("hsbc")) return hsbcLogo;
    if (bank.includes("scotiabank")) return scotiabankLogo;
    if (bank.includes("azteca")) return aztecaLogo;
    if (bank.includes("inbursa")) return inbursaLogo;

    return null;
  };

  const renderVisualBrandBlock = (card: any, size: "sm" | "md" = "md") => {
    const logoSrc = getCardLogo(card);
    const sizeClasses = size === "sm" ? "w-12 h-12 text-[10px]" : "w-14 h-14 text-[12px]" ;
    
    if (logoSrc) {
      const isVisa = card.brand === "VISA";
      const isMastercard = card.brand === "MASTERCARD";
      return (
        <div
          style={{ backgroundColor: isVisa ? "#1A1F71" : "#ffffff" }}
          className={`${sizeClasses} rounded-xl border ${isVisa ? "border-[#1A1F71]" : "border-slate-200"} shadow-3xs flex items-center justify-center shrink-0 overflow-hidden`}
        >
          <img 
            src={logoSrc} 
            className={`${isMastercard ? "w-[82%] h-[82%]" : "w-[76%] h-[76%]"} object-contain object-center select-none`}
            alt={card.brand} 
          />
        </div>
      );
    }

    if (card.brand === "VISA") {
      return (
        <div style={{ backgroundColor: '#ffffff' }} className={`${sizeClasses} rounded-xl flex items-center justify-center border border-slate-200 text-[#010915] font-serif font-black italic tracking-wider select-none shadow-sm shrink-0`}>
          VISA
        </div>
      );
    }
    if (card.brand === "AMEX") {
      return (
        <div style={{ backgroundColor: '#ffffff' }} className={`${sizeClasses} rounded-xl flex items-center justify-center border border-slate-200 ${size === "sm" ? "text-[8.5px]" : "text-[9.5px]"} text-[#00829B] font-mono font-black tracking-widest select-none shadow-sm shrink-0`}>
          AMEX
        </div>
      );
    }
    if (card.brand === "MERCADOPAGO") {
      return (
        <div style={{ backgroundColor: '#ffffff' }} className={`${sizeClasses} rounded-xl flex items-center justify-center border border-slate-200 text-[#00A6EA] font-sans font-black select-none shadow-sm shrink-0`}>
          MP
        </div>
      );
    }
    if (card.brand === "APPLEPAY") {
      return (
        <div style={{ backgroundColor: '#ffffff' }} className={`${sizeClasses} rounded-xl flex items-center justify-center border border-slate-200 text-black font-sans font-black select-none shadow-sm shrink-0`}>
          Apple Pay
        </div>
      );
    }
    if (card.brand === "GOOGLEPAY") {
      return (
        <div style={{ backgroundColor: '#ffffff' }} className={`${sizeClasses} rounded-xl flex items-center justify-center border border-slate-200 text-[#202124] font-sans font-black select-none shadow-sm shrink-0`}>
          G Pay
        </div>
      );
    }
    if (card.brand === "SPINBYOXXO") {
      return (
        <div style={{ backgroundColor: '#ffffff' }} className={`${sizeClasses} rounded-xl flex items-center justify-center border border-slate-200 text-[#5D2D91] font-sans font-black select-none shadow-sm shrink-0`}>
          SPIN
        </div>
      );
    }
    if (card.brand === "PAYPAL") {
      return (
        <div style={{ backgroundColor: '#ffffff' }} className={`${sizeClasses} rounded-xl flex items-center justify-center border border-slate-200 text-[#003087] font-sans font-black italic select-none shadow-sm shrink-0`}>
          PayPal
        </div>
      );
    }
    return (
      <div style={{ backgroundColor: '#ffffff' }} className={`${sizeClasses} rounded-xl flex items-center justify-center border border-slate-200 text-rose-600 font-sans font-black italic select-none shadow-sm relative overflow-hidden shrink-0`}>
        <span className="relative z-10 text-[10px] uppercase tracking-tighter">MC</span>
      </div>
    );
  };

  const isValidLuhn = (cardNumber: string) => {
    const clean = cardNumber.replace(/\s+/g, "");
    if (!/^\d{13,19}$/.test(clean)) return false;
    let sum = 0;
    let doubleDigit = false;
    for (let index = clean.length - 1; index >= 0; index -= 1) {
      let digit = Number(clean[index]);
      if (doubleDigit) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      doubleDigit = !doubleDigit;
    }
    return sum % 10 === 0;
  };

  const getCheckoutEndpointForWallet = () => "/api/billing/checkout/stripe";

  const openOfficialCheckoutPopup = (checkoutUrl: string, walletName: string) => {
    const width = 480;
    const height = 720;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
    localStorage.setItem("pendingCheckoutWallet", walletName);
    const popup = window.open(
      checkoutUrl,
      `${walletName} Checkout`,
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );
    if (!popup) {
      toast.error(`El navegador bloqueó la ventana emergente de ${walletName}. Habilita pop-ups para completar el pago.`);
      return false;
    }
    popup.focus();
    return true;
  };

  const handleDigitalWalletPayment = async (walletName: string) => {
    if (isProcessingWallet || isProcessingPayment) return;
    setIsProcessingWallet(true);

    const providerForMessage = walletName === "Google Pay" ? "Stripe Checkout" : walletName;
    toast.info(`Abriendo checkout oficial de ${providerForMessage}...`, "Pago seguro");

    try {
      const checkoutPlan = checkoutPlanType || "brisa";
      let endpoint = "/api/billing/checkout/stripe";
      if (walletName === "PayPal") {
        endpoint = "/api/billing/checkout/paypal";
      } else if (walletName === "Mercado Pago" || walletName === "Mercado Libre") {
        endpoint = "/api/billing/checkout/mercadopago";
      }

      const response = await fetch(getApiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: initialProfile?.userId || "guest",
          planId: checkoutPlan,
          autoRenew: autoRenewChoice,
          payerEmail: correoPago || correoRecepcion || correoElectronico || auth.currentUser?.email || currentUserEmail || undefined
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `No se pudo iniciar el checkout oficial de ${providerForMessage}.`);
      }
      if (!data.checkoutUrl) {
        throw new Error(`La pasarela de ${providerForMessage} no devolvió una URL de pago.`);
      }

      openOfficialCheckoutPopup(data.checkoutUrl, providerForMessage);
    } catch (err: any) {
      console.error(`${walletName} payment init error:`, err);
      toast.error(err.message || `Error de conexión con ${providerForMessage}. Intenta nuevamente.`);
    } finally {
      setIsProcessingWallet(false);
    }
  };


  // Modal Bank Input States
  const [modalCvvInput, setModalCvvInput] = useState("");
  const [modalPinInput, setModalPinInput] = useState("");
  const [isProcessingWallet, setIsProcessingWallet] = useState(false);

  // Google Pay Sync States
  const [isSyncingGPay, setIsSyncingGPay] = useState(false);

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showOtherPaymentMethods, setShowOtherPaymentMethods] = useState(false);

  // Fiscal Profile state registers
  const [rfc, setRfc] = useState(savedFiscalRfc || "");
  const [razonSocial, setRazonSocial] = useState(savedFiscalName || "");
  const [regimenFiscal, setRegimenFiscal] = useState(initialProfile?.regimenFiscal || "");
  const [codigoPostal, setCodigoPostal] = useState(initialProfile?.codigoPostal || "");
  const [usoCFDI, setUsoCFDI] = useState(initialProfile?.usoCFDI || "G03");
  const [hasSavedFiscalData, setHasSavedFiscalData] = useState(() => {
    if (!initialProfile || !initialProfile.rfc || !initialProfile.razonSocial) return false;
    const isMock = initialProfile.rfc === "CABE850101ABC" || 
                   initialProfile.rfc === "GOMD850101XYZ" || 
                   initialProfile.razonSocial === "RICARDO CASTRO BECERRIL" || 
                   initialProfile.razonSocial === "CONSTRUCTORA LEGION DEL NORTE SA DE CV";
    return !isMock;
  });
  const [personalGeminiKey, setPersonalGeminiKey] = useState(initialProfile?.personalGeminiKey || "");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const constanciaInputRef = useRef<HTMLInputElement>(null);
  const [isParsingConstancia, setIsParsingConstancia] = useState(false);

  const handleConstanciaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingConstancia(true);
    toast.info("Leyendo Constancia de Situación Fiscal con IA...", "Procesando Archivo");

    try {
      const reader = new FileReader();
      const fileDataPromise = new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          resolve({ base64, mimeType: file.type });
        };
        reader.onerror = (err) => reject(err);
      });
      
      reader.readAsDataURL(file);
      const { base64, mimeType } = await fileDataPromise;

      const res = await parseConstancia({
        fileBase64: base64,
        mimeType,
        personalGeminiKey,
      });

      const data = await res.json();
      if (!res.ok || data.ocrFailed) {
        throw new Error(data.error || "No se pudo analizar la constancia sin inventar datos");
      }
      
      if (data.rfc) setRfc(data.rfc.toUpperCase().trim());
      if (data.razonSocial) setRazonSocial(data.razonSocial.toUpperCase().trim());
      if (data.regimenFiscal) setRegimenFiscal(data.regimenFiscal.trim());
      if (data.codigoPostal) setCodigoPostal(data.codigoPostal.trim());

      toast.success("¡Constancia fiscal procesada con éxito! Los datos se han rellenado solos.", "Autocompletado SAT");
    } catch (err: any) {
      console.error(err);
      toast.error("Hubo un error al extraer los datos del archivo. Intenta de nuevo o ingresa los datos de forma manual.");
    } finally {
      setIsParsingConstancia(false);
      if (constanciaInputRef.current) {
        constanciaInputRef.current.value = "";
      }
    }
  };

  // Toggle state to switch between high-fidelity dashboard (default) vs edit SAT credentials
  const [isEditingFiscal, setIsEditingFiscal] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      await onSave({
        ...initialProfile,
        rfc,
        razonSocial,
        regimenFiscal,
        codigoPostal,
        usoCFDI,
        isDeleted: true,
        status: "inactive",
        plan: "gratuito",
        deletedAt: new Date().toISOString()
      });
      toast.success("Tu cuenta ha sido desactivada y se mantendrá segura en nuestra memoria fiscal.", "Cuenta Desactivada");
      await signOut(auth);
    } catch (err) {
      console.error("Error soft-deleting account: ", err);
      toast.error("Hubo un problema al desactivar tu sesión.");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  // Cards saved in Firestore. New cards are captured only by the official processor checkout.
  const [cards, setCards] = useState<PaymentCard[]>(() => {
    if (initialProfile?.paymentCards && initialProfile.paymentCards.length > 0) {
      const filtered = initialProfile.paymentCards.filter(
        (card) =>
          card.last4 !== "Cuenta Vinculada" &&
          (card.stripePaymentMethodId || card.id)
      );
      const unique: PaymentCard[] = [];
      const seen = new Set<string>();
      for (const card of filtered) {
        const key = `${card.brand}-${card.last4}-${card.expiry}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(card);
        }
      }
      return unique;
    }
    return [];
  });

  // Keep cards in sync with backend profile snapshot.
  React.useEffect(() => {
    if (initialProfile?.paymentCards) {
      const filtered = initialProfile.paymentCards.filter(
        (card) =>
          card.last4 !== "Cuenta Vinculada" &&
          (card.stripePaymentMethodId || card.id)
      );
      const unique: PaymentCard[] = [];
      const seen = new Set<string>();
      for (const card of filtered) {
        const key = `${card.brand}-${card.last4}-${card.expiry}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(card);
        }
      }
      setCards(unique);
    }
  }, [initialProfile?.paymentCards]);

  const [isAddingCardStripe, setIsAddingCardStripe] = useState(false);

  const handleAddCardWithStripe = async () => {
    setIsAddingCardStripe(true);
    const toastId = toast.loading("Iniciando conexión segura con Stripe...");
    try {
      const payerEmail = correoPago || correoRecepcion || correoElectronico || auth.currentUser?.email || currentUserEmail;
      const response = await fetch(getApiUrl("/api/billing/setup/stripe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: initialProfile?.userId || auth.currentUser?.uid,
          payerEmail,
          holderName: "Tarjeta Stripe",
          bankName: "Stripe Wallet"
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Stripe no devolvió una sesión de registro.");
      }
      toast.dismiss(toastId);
      openOfficialCheckoutPopup(data.checkoutUrl, "Stripe");
    } catch (error: any) {
      toast.dismiss(toastId);
      toast.error(error.message || "No se pudo iniciar el registro con Stripe.");
    } finally {
      setIsAddingCardStripe(false);
    }
  };

  const resolvedUserId = initialProfile?.id || initialProfile?.userId || auth.currentUser?.uid;

  React.useEffect(() => {
    const fetchPaymentMethods = async () => {
      if (!resolvedUserId) return;
      try {
        const response = await fetch(getApiUrl(`/api/billing/payment-methods/${resolvedUserId}`));
        if (response.ok) {
          const data = await response.json();
          setCards(data);
        }
      } catch (err) {
        console.warn("Could not load Stripe payment methods:", err);
      }
    };
    fetchPaymentMethods();
  }, [resolvedUserId, isAddingCardStripe]);


  // Synchronize custom display names from the saved profile only; do not fabricate fiscal or payment data.
  React.useEffect(() => {
    const userEmail = currentUserEmail || auth.currentUser?.email;
    const userName = auth.currentUser?.displayName || (userEmail ? userEmail.split("@")[0] : "");
    if (initialProfile) {
      if (!isPlaceholderFiscalValue(initialProfile.razonSocial)) {
        setNombreCompleto(initialProfile.razonSocial);
      }
      if (!isPlaceholderFiscalValue(initialProfile.rfc)) {
        setRfc(initialProfile.rfc);
      }
      if (isPlaceholderFiscalValue(initialProfile.razonSocial) && userName) {
        setNombreCompleto(userName);
      }
      if (initialProfile.correoRecepcion) {
        setCorreoRecepcion(initialProfile.correoRecepcion);
      } else if (userEmail) {
        setCorreoRecepcion(userEmail);
      }
      if (initialProfile.correoPago) {
        setCorreoPago(initialProfile.correoPago);
      } else if (userEmail) {
        setCorreoPago(userEmail);
      }
      setCorreoElectronico(initialProfile.correoElectronico || userEmail || "");
      if (initialProfile.facturacionAutomatica !== undefined) {
        setFacturacionAutomatica(initialProfile.facturacionAutomatica);
      }
      if (initialProfile.metodoRecepcion) {
        setMetodoRecepcion(initialProfile.metodoRecepcion);
      }
    } else if (userEmail) {
      setCorreoRecepcion(userEmail);
      setCorreoPago(userEmail);
    }
    if (userEmail) {
      setCorreoElectronico(initialProfile?.correoElectronico || userEmail);
    }
  }, [currentUserEmail, initialProfile, auth.currentUser?.email]);

  // Add Card Form State
  const [addingCard, setAddingCard] = useState(false);
  const [addingMethodStep, setAddingMethodStep] = useState<"select" | "card" | "connecting">("select");
  const [selectedMethodToAdd, setSelectedMethodToAdd] = useState<"MERCADOPAGO" | "GOOGLEPAY" | "PAYPAL" | null>(null);
  const [newCardNumber, setNewCardNumber] = useState("");
  const [newCardExpiry, setNewCardExpiry] = useState("");
  const [newCardCvv, setNewCardCvv] = useState("");
  const [newCardHolder, setNewCardHolder] = useState("");
  const [newCardBrand, setNewCardBrand] = useState<"VISA" | "MASTERCARD">("VISA");

  const [newCardZip, setNewCardZip] = useState("");
  const [useAsDefault, setUseAsDefault] = useState(true);
  const [isSavingCard, setIsSavingCard] = useState(false);

  const handleSaveCardLocally = async () => {
    if (!newCardNumber || !newCardExpiry || !newCardCvv || !newCardHolder) {
      toast.error("Por favor completa los campos requeridos de la tarjeta.");
      return;
    }

    const cleanNumber = newCardNumber.replace(/\s+/g, '');
    const cleanExpiry = newCardExpiry.replace(/\s+/g, '');
    if (cleanNumber.length < 15 || cleanNumber.length > 16) {
      toast.error("Número de tarjeta inválido.");
      return;
    }

    const parts = cleanExpiry.split('/');
    if (parts.length !== 2 || parts[0].length !== 2 || parts[1].length !== 2) {
      toast.error("Formato de fecha de vencimiento inválido (MM/AA).");
      return;
    }

    const expMonth = parts[0];
    const expYear = "20" + parts[1]; // Convert AA to 20AA

    setIsSavingCard(true);
    const toastId = toast.loading("Registrando método de pago seguro...");

    try {
      // 1. Tokenize directly with Stripe Public API
      const stripePubKey = "pk_live_51TmHoCIMU9aoBatutx7aHAwiCWK6VaH0uOxeEUWLEepifuM2vl8Hq6cYTu86YkXLEIPZiZpajB4KseghUelJPF3J00eiziqqhP";
      const params = new URLSearchParams();
      params.append("type", "card");
      params.append("card[number]", cleanNumber);
      params.append("card[exp_month]", expMonth);
      params.append("card[exp_year]", expYear);
      params.append("card[cvc]", newCardCvv);
      params.append("billing_details[name]", newCardHolder);
      if (newCardZip) {
        params.append("billing_details[address][postal_code]", newCardZip);
      }

      const stripeResponse = await fetch("https://api.stripe.com/v1/payment_methods", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripePubKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString()
      });

      const stripeData = await stripeResponse.json();
      if (!stripeResponse.ok || !stripeData.id) {
        throw new Error(stripeData.error?.message || "No se pudo tokenizar la tarjeta con Stripe.");
      }

      const paymentMethodId = stripeData.id;

      // 2. Send pm_... to our backend
      const userId = initialProfile?.id || initialProfile?.userId || auth.currentUser?.uid;
      const response = await fetch(getApiUrl("/api/billing/payment-methods/attach"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId,
          paymentMethodId,
          isDefault: useAsDefault
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "No se pudo vincular la tarjeta en tu cuenta.");
      }

      const resData = await response.json();
      setCards(resData.paymentCards);
      
      // Clear fields
      setNewCardNumber("");
      setNewCardExpiry("");
      setNewCardCvv("");
      setNewCardHolder("");
      setNewCardZip("");
      setUseAsDefault(true);
      setAddingCard(false);

      toast.dismiss(toastId);
      toast.success("Tarjeta guardada y vinculada exitosamente.", "Método de pago listo");
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err.message || "Ocurrió un error al guardar la tarjeta.");
    } finally {
      setIsSavingCard(false);
    }
  };

  const renderLocalCardForm = () => {
    return (
      <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 mt-4 mb-4 animate-fade-in text-left space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#0B53F4]" />
            <div>
              <span className="text-xs font-black text-slate-850 uppercase tracking-wide block">Agregar nueva tarjeta</span>
              <span className="text-[9px] text-[#0B53F4] font-bold block mt-0.5">Pago seguro con Stripe</span>
            </div>
          </div>
          <button 
            type="button"
            onClick={() => setAddingCard(false)}
            className="text-slate-400 hover:text-slate-600 font-bold text-xs p-1 cursor-pointer bg-transparent border-none outline-none"
          >
            Cancelar
          </button>
        </div>

        <p className="text-[10px] text-slate-450 leading-relaxed font-semibold">
          Tus datos se procesan de forma segura. ZenTicket nunca almacena el número completo ni el CVV.
        </p>

        <div className="space-y-3.5">
          {/* Card Number Input */}
          <div className="space-y-1.5 text-left">
            <label className="block text-[9.5px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Número de tarjeta
            </label>
            <div className="relative">
              <input
                type="text"
                maxLength={19}
                placeholder="1234 1234 1234 1234"
                value={newCardNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  const matches = val.match(/\d{1,4}/g);
                  const formatted = matches ? matches.join(" ") : "";
                  setNewCardNumber(formatted);
                }}
                className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3.5 text-xs text-slate-800 font-medium placeholder-slate-350 outline-none transition"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300">
                <CreditCard className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Holder Name Input */}
          <div className="space-y-1.5 text-left">
            <label className="block text-[9.5px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Nombre del titular
            </label>
            <input
              type="text"
              placeholder="Como aparece en la tarjeta"
              value={newCardHolder}
              onChange={(e) => setNewCardHolder(e.target.value)}
              className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3.5 text-xs text-slate-800 font-medium placeholder-slate-350 outline-none transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Expiry Input */}
            <div className="space-y-1.5 text-left">
              <label className="block text-[9.5px] font-black text-slate-400 uppercase tracking-widest ml-1">
                MM/AA
              </label>
              <input
                type="text"
                maxLength={5}
                placeholder="MM/AA"
                value={newCardExpiry}
                onChange={(e) => {
                  let val = e.target.value.replace(/\D/g, "");
                  if (val.length > 2) {
                    val = val.substring(0, 2) + "/" + val.substring(2, 4);
                  }
                  setNewCardExpiry(val);
                }}
                className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3.5 text-xs text-slate-800 font-medium placeholder-slate-350 outline-none transition text-center"
              />
            </div>

            {/* CVV Input */}
            <div className="space-y-1.5 text-left">
              <label className="block text-[9.5px] font-black text-slate-400 uppercase tracking-widest ml-1">
                CVV
              </label>
              <input
                type="password"
                maxLength={4}
                placeholder="123"
                value={newCardCvv}
                onChange={(e) => setNewCardCvv(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3.5 text-xs text-slate-800 font-medium placeholder-slate-350 outline-none transition text-center"
              />
            </div>
          </div>

          {/* Postal Code Input */}
          <div className="space-y-1.5 text-left">
            <label className="block text-[9.5px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Código postal (opcional)
            </label>
            <input
              type="text"
              maxLength={10}
              placeholder="Código postal"
              value={newCardZip}
              onChange={(e) => setNewCardZip(e.target.value)}
              className="w-full bg-white border border-slate-200 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3.5 text-xs text-slate-800 font-medium placeholder-slate-350 outline-none transition"
            />
          </div>

          {/* Use as default checkbox */}
          <div className="flex items-center gap-2 pt-1 select-none">
            <input
              type="checkbox"
              id="useCardAsDefaultCheckbox"
              checked={useAsDefault}
              onChange={(e) => setUseAsDefault(e.target.checked)}
              className="w-4 h-4 text-[#0B53F4] border-slate-300 rounded focus:ring-[#0B53F4] cursor-pointer"
            />
            <label htmlFor="useCardAsDefaultCheckbox" className="text-xs text-slate-650 font-bold cursor-pointer">
              Usar esta tarjeta como predeterminada
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleSaveCardLocally}
            disabled={isSavingCard}
            className="flex-1 bg-[#0B53F4] hover:bg-[#0747D1] disabled:opacity-50 text-white text-xs font-black py-3.5 rounded-2xl transition cursor-pointer text-center"
          >
            {isSavingCard ? "Guardando..." : "Guardar tarjeta"}
          </button>
          <button
            type="button"
            onClick={() => setAddingCard(false)}
            className="flex-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold py-3.5 rounded-2xl transition cursor-pointer text-center"
          >
            Cancelar
          </button>
        </div>

        <div className="flex items-center gap-1.5 justify-center pt-2 text-[10px] text-slate-400 font-semibold">
          <Shield className="w-3.5 h-3.5" />
          <span>Protegido por Stripe</span>
        </div>
      </div>
    );
  };


  const currentPlan = initialProfile?.plan || "gratuito";

  // Checkout and Purchase state
  const [checkoutPlanType, setCheckoutPlanType] = useState<"gratuito" | "brisa" | "personal" | "serenidad" | "empresa" | "nirvana" | null>(() => {
    const saved = localStorage.getItem("zenticket_checkout_plan") || localStorage.getItem("selectedPlanOnSignup");
    if (saved) {
      if (saved === "gratuito" || saved === "brisa" || saved === "personal" || saved === "serenidad" || saved === "empresa" || saved === "nirvana") {
        return saved as any;
      }
    }
    return null;
  });

  React.useEffect(() => {
    if (checkoutPlanType) {
      localStorage.setItem("zenticket_checkout_plan", checkoutPlanType);
    } else {
      localStorage.removeItem("zenticket_checkout_plan");
      localStorage.removeItem("selectedPlanOnSignup");
    }
  }, [checkoutPlanType]);

  const selectedPlan = checkoutPlanType !== null ? checkoutPlanType : currentPlan;
  const [selectedCardForPlan, setSelectedCardForPlan] = useState<string>(
    (initialProfile?.paymentCards || []).find(c => c.isDefault)?.id || 
    (initialProfile?.paymentCards || [])[0]?.id || 
    "stripe_wallet"
  );
  const [isAccordionExpanded, setIsAccordionExpanded] = React.useState(false);

  // Synchronize selectedCardForPlan with default card when cards array updates
  React.useEffect(() => {
    const defaultCard = cards.find(c => c.isDefault);
    if (defaultCard) {
      setSelectedCardForPlan(defaultCard.id);
    } else if (cards.length > 0 && (selectedCardForPlan === "stripe_wallet" || !cards.some(c => c.id === selectedCardForPlan))) {
      setSelectedCardForPlan(cards[0].id);
    }
  }, [cards]);
  const [nombreCompleto, setNombreCompleto] = useState(savedFiscalName || sessionName || "");
  const [correoElectronico, setCorreoElectronico] = useState(initialProfile?.correoElectronico || sessionEmail || "");
  const [telefono, setTelefono] = useState(initialProfile?.telefono || "");
  const [correoRecepcion, setCorreoRecepcion] = useState(initialProfile?.correoRecepcion || sessionEmail || "");
  const [correoPago, setCorreoPago] = useState(initialProfile?.correoPago || sessionEmail || "");
  const [facturacionAutomatica, setFacturacionAutomatica] = useState(initialProfile?.facturacionAutomatica || false);
  const [metodoRecepcion, setMetodoRecepcion] = useState(initialProfile?.metodoRecepcion || "Ambos"); // "Correo", "Descarga", "Ambos"
  const [dosPasos, setDosPasos] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showNewPasswordText, setShowNewPasswordText] = useState(false);
  const [showConfirmPasswordText, setShowConfirmPasswordText] = useState(false);
  const [tempPassword, setTempPassword] = useState(initialProfile?.tempPassword || "");
  const [copiedTemp, setCopiedTemp] = useState(false);

  // Synchronize tempPassword with initialProfile.tempPassword when it loads
  React.useEffect(() => {
    if (initialProfile?.tempPassword) {
      setTempPassword(initialProfile.tempPassword);
    }
  }, [initialProfile?.tempPassword]);

  // Generate and set a unique, complex default password for Google users who don't have one yet
  React.useEffect(() => {
    const generateAndSetDefaultPassword = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const hasPasswordProvider = user.providerData.some(p => p.providerId === "password");
      if (hasPasswordProvider) return; // Already has a custom password, no need for temporary default

      // If we don't have a tempPassword in local state or initialProfile
      if (!tempPassword && !initialProfile?.tempPassword) {
        // First try to check the "users" collection from Firestore
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            if (data.tempPassword) {
              setTempPassword(data.tempPassword);
              // Sync to fiscalProfiles
              const docRef = doc(db, "fiscalProfiles", user.uid);
              await setDoc(docRef, { tempPassword: data.tempPassword }, { merge: true });
              return;
            }
          }
        } catch (dbErr) {
          console.warn("Could not check users collection for existing tempPassword:", dbErr);
        }

        // If still not found, generate a new one
        const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const lowercase = "abcdefghijklmnopqrstuvwxyz";
        const numbers = "0123456789";
        const symbols = "!@#$%&*";
        const allChars = uppercase + lowercase + numbers + symbols;
        
        let pass = "";
        pass += uppercase[Math.floor(Math.random() * uppercase.length)];
        pass += lowercase[Math.floor(Math.random() * lowercase.length)];
        pass += numbers[Math.floor(Math.random() * numbers.length)];
        pass += symbols[Math.floor(Math.random() * symbols.length)];
        
        for (let i = 0; i < 10; i++) {
          pass += allChars[Math.floor(Math.random() * allChars.length)];
        }
        
        const complexPass = pass.split('').sort(() => 0.5 - Math.random()).join('');

        try {
          // Link password provider or set password on Firebase Auth
          try {
            if (user.email) {
              const credential = EmailAuthProvider.credential(user.email, complexPass);
              await linkWithCredential(user, credential);
            } else {
              await updatePassword(user, complexPass);
            }
          } catch (authErr) {
            console.warn("Failed to link credential, falling back to updatePassword:", authErr);
            await updatePassword(user, complexPass);
          }
          
          // Save password to Firestore fiscalProfiles collection
          const docRef = doc(db, "fiscalProfiles", user.uid);
          await setDoc(docRef, { tempPassword: complexPass }, { merge: true });

          // Also save it to users collection
          try {
            const userRef = doc(db, "users", user.uid);
            await setDoc(userRef, { tempPassword: complexPass }, { merge: true });
          } catch (err) {
            console.warn("Could not save temp password to users doc:", err);
          }

          setTempPassword(complexPass);
          console.log("Successfully generated and set a complex, unique default password for Google user.");
        } catch (err) {
          console.error("Failed to automatically set temporary default password for Google user:", err);
        }
      }
    };

    generateAndSetDefaultPassword();
  }, [initialProfile?.tempPassword, tempPassword]);

  const handleCopyTemp = () => {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword);
    setCopiedTemp(true);
    toast.success("Contraseña temporal copiada al portapapeles.", "Copiado");
    setTimeout(() => setCopiedTemp(false), 2000);
  };

  // Detect if we are loading the success page inside the Stripe popup redirect
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const plan = params.get("plan");
    const sessionId = params.get("session_id");
    if (window.opener && status === "card_setup_success") {
      window.opener.postMessage({ type: "stripe_card_setup_success" }, "*");
      window.close();
      return;
    }
    if (window.opener && status === "success") {
      window.opener.postMessage({ type: "stripe_payment_success", plan, sessionId }, "*");
      window.close();
    }
  }, []);

  // Listen to messages from popup checkout windows
  React.useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "stripe_card_setup_success") {
        toast.success("Tarjeta vinculada correctamente con Stripe.", "Tarjeta agregada");
        window.setTimeout(() => window.location.reload(), 1200);
        return;
      }
      if (event.data?.type === "stripe_payment_success" || event.data?.type === "wallet_payment_success") {
        const { sessionId } = event.data;
        
        setIsProcessingPayment(true);
        try {
          const response = await fetch(getApiUrl("/api/billing/checkout/stripe/confirm"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              userId: initialProfile?.userId || auth.currentUser?.uid
            })
          });
          const confirmation = await response.json().catch(() => ({}));
          if (!response.ok || !confirmation.success) {
            throw new Error(confirmation.error || "Stripe todavía no confirma el pago.");
          }
          toast.success(
            `Pago confirmado. ${confirmation.planName} ya está activo con ${confirmation.invoicesLimit} facturas disponibles.`,
            "Pago exitoso"
          );
          setCheckoutPlanType(null);
          localStorage.removeItem("zenticket_checkout_plan");
          localStorage.removeItem("selectedPlanOnSignup");
          window.setTimeout(() => window.location.reload(), 1400);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "No se pudo confirmar el pago.");
        } finally {
          setIsProcessingPayment(false);
          localStorage.removeItem("pendingCheckoutWallet");
          setActiveModal(null);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [initialProfile?.userId]);

  // States for active dialog/modal settings
  const [activeModal, setActiveModal] = useState<"apariencia" | "notificaciones" | "idioma" | "faq" | "tutorial" | "soporte" | "plan" | null>(null);
  const [selectedDetailsCard, setSelectedDetailsCard] = useState<PaymentCard | null>(null);

  // Invoices cycle calculation
  const planStartDateStr = initialProfile?.planStartDate || initialProfile?.createdAt || new Date().toISOString();
  const planStartDate = new Date(planStartDateStr);
  const cycleInvoices = invoices.filter(inv => {
    if (!inv.createdAt) return false;
    return new Date(inv.createdAt) >= planStartDate;
  });
  const cycleInvoicesCount = cycleInvoices.length;
  const currentPlanLimit = initialProfile?.invoicesLimit || (
    currentPlan === "nirvana" ? 100 : 
    currentPlan === "empresa" ? 60 : 
    currentPlan === "serenidad" ? 30 : 
    currentPlan === "personal" ? 20 : 
    currentPlan === "brisa" ? 10 : 5
  );
  const getPlanDescription = (plan?: string) => {
    if (plan === "brisa") return "Para personas que facturan algunos consumos al mes y quieren evitar hacerlo manualmente. Incluye 10 facturas generadas al mes, historial ampliado de tickets y soporte por email.";
    if (plan === "personal") return "Plan intermedio para profesionistas independientes que necesitan mayor volumen. Incluye 20 facturas generadas al mes, panel de gastos y soporte por email.";
    if (plan === "serenidad") return "El plan recomendado para usuarios que facturan de forma constante y necesitan mayor control de sus tickets y gastos. Incluye 30 facturas generadas al mes, panel de gastos y soporte prioritario por email.";
    if (plan === "empresa") return "Diseñado para pequeñas y medianas empresas con requerimientos medianos. Incluye 60 facturas generadas al mes, multi-RFC, descargas masivas y soporte prioritario.";
    if (plan === "nirvana") return "Para usuarios de alto volumen, negocios pequeños o equipos que necesitan automatizar muchas facturas cada mes. Incluye 100 facturas generadas al mes, acceso completo a conectores disponibles y soporte prioritario.";
    return "Ideal para probar ZenTicket y automatizar las primeras facturas sin compromiso. Incluye 5 facturas gratis en total, soporte básico.";
  };

  const getPlanLabel = (plan?: string) => {
    if (plan === "brisa") return "Plan Brisa";
    if (plan === "serenidad") return "Plan Serenidad";
    if (plan === "nirvana") return "Plan Nirvana";
    if (plan === "personal") return "Plan Personal";
    if (plan === "empresa") return "Plan Empresa";
    return "Plan Gratuito";
  };
  const getPlanPrice = (plan?: string) => {
    if (plan === "brisa") return "$5";
    if (plan === "serenidad") return "$250";
    if (plan === "nirvana") return "$500";
    if (plan === "personal") return "$150";
    if (plan === "empresa") return "$300";
    return "$0";
  };
  const hasActivePaidPlan = currentPlan !== "gratuito" &&
    (initialProfile?.paymentStatus === "paid" || initialProfile?.paymentStatus === "subscription_active");
  const isMonthlyQuotaExhausted = currentPlan !== "gratuito" && cycleInvoicesCount >= currentPlanLimit;
  const isPayingSameActivePlan = checkoutPlanType === currentPlan && hasActivePaidPlan;
  const shouldDisablePayButton = checkoutPlanType !== "gratuito" && isPayingSameActivePlan && !isMonthlyQuotaExhausted;

  const isProfileComplete = true; // No validation locks - the app is completely open for navigation and operation

  
  const renderAddingCardForm = () => {
    if (!addingCard) return null;
    return (
      <div className="bg-slate-50 border border-slate-200/80 rounded-3xl p-5 mb-4 animate-fade-in text-left space-y-4">
        
        {addingMethodStep === "select" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-slate-850 uppercase tracking-wide block">Seleccionar Método de Registro</span>
                <span className="text-[9px] text-slate-450 font-bold block mt-0.5">Elige cómo deseas dar de alta tu tarjeta</span>
              </div>
              <button 
                onClick={() => {
                  setAddingCard(false);
                  setAddingMethodStep("select");
                }} 
                className="text-slate-450 hover:text-slate-655 font-bold text-xs p-1 cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 text-left">
              {/* Opción 1: Stripe Checkout (Google Pay, Link y Tarjeta Real) */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    const payerEmail = correoPago || correoRecepcion || correoElectronico || auth.currentUser?.email || currentUserEmail;
                    const response = await fetch(getApiUrl("/api/billing/setup/stripe"), {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        userId: initialProfile?.userId || auth.currentUser?.uid,
                        payerEmail,
                        holderName: "Tarjeta Stripe",
                        bankName: "Stripe Wallet"
                      })
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok || !data.checkoutUrl) {
                      throw new Error(data.error || "Stripe no devolvió una sesión de registro.");
                    }
                    openOfficialCheckoutPopup(data.checkoutUrl, "Stripe");
                    setAddingCard(false);
                  } catch (error: any) {
                    toast.error(error.message || "No se pudo iniciar el registro con Stripe.");
                  }
                }}
                className="flex items-center gap-4.5 p-4.5 bg-slate-50 border border-slate-200 hover:bg-slate-100/70 hover:border-[#0B53F4] hover:shadow-xs rounded-2xl transition text-left cursor-pointer group"
              >
                <div style={{ backgroundColor: '#ffffff' }} className="w-14 h-14 rounded-xl border border-slate-200 flex items-center justify-center shrink-0 p-2 shadow-3xs">
                  <img src={stripeLogo} className="w-full h-full object-contain" alt="Stripe" />
                </div>
                <div>
                  <span className="text-sm font-black text-slate-850 block">Tarjeta / Google Pay / Stripe Link</span>
                  <span className="text-xs text-slate-400 font-semibold block mt-1">Registra tu tarjeta real o vincula con Google Pay de forma rápida y segura</span>
                </div>
              </button>

              {/* Opción 2: Formulario Local Manual */}
              <button
                type="button"
                onClick={() => {
                  setAddingMethodStep("select");
                }}
                className="flex items-center gap-4.5 p-4.5 bg-slate-50 border border-slate-200 hover:bg-slate-100/70 hover:border-slate-400 hover:shadow-xs rounded-2xl transition text-left cursor-pointer group"
              >
                <div style={{ backgroundColor: '#ffffff' }} className="w-14 h-14 rounded-xl border border-slate-200 text-slate-500 flex items-center justify-center transition shrink-0">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-sm font-black text-slate-850 block">Formulario Manual Local</span>
                  <span className="text-xs text-slate-400 font-semibold block mt-1">Escribe los datos de la tarjeta en esta página</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {addingMethodStep === "card" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div>
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide block">Alta de Tarjeta</span>
                  <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Registro de tarjeta de credito o debito</span>
                </div>
              </div>
              <button 
                onClick={() => {
                  setAddingCard(false);
                  setAddingMethodStep("select");
                }} 
                className="text-slate-400 hover:text-slate-655 font-bold text-xs p-1 cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            {/* Card visual showcase with dynamic bank theme */}
            {(() => {
              const bankInfo = getCardBankInfo(newCardNumber);
              return (
                <div className="bg-[#0B53F4] text-white rounded-2xl p-5 relative overflow-hidden shadow-lg font-mono select-none h-38 flex flex-col justify-between transition-colors duration-200 border border-white/10">
                  <div className="flex justify-between items-start z-10">
                    <div className="text-left">
                      <span className="text-[8px] font-black tracking-widest text-white/50 block font-sans">RED DE PAGOS GLOBAL</span>
                      <span className="text-[10px] font-black text-white leading-none mt-0.5 block font-sans">
                        {bankInfo.bankName}
                      </span>
                    </div>
                    <span className="text-xs font-extrabold italic tracking-wider text-slate-900 bg-white/95 px-2.5 py-1 rounded-lg shadow-sm border border-slate-100 uppercase">
                      {newCardBrand}
                    </span>
                  </div>
                  <div className="text-base tracking-widest font-black my-2 z-10 text-center text-white drop-shadow-sm">
                    {newCardNumber ? `•••• •••• •••• ${newCardNumber.slice(-4).padStart(4, "•")}` : "•••• •••• •••• ••••"}
                  </div>
                  <div className="flex justify-between text-[9px] items-end font-sans z-10 border-t border-white/10 pt-1.5">
                    <div>
                      <span className="text-[7px] text-white/50 block tracking-wider uppercase leading-none mb-1">TITULAR DE LA TARJETA</span>
                      <span className="font-extrabold font-mono tracking-tight uppercase text-white/90">{newCardHolder.toUpperCase() || "NOMBRE DEL TITULAR"}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[7px] text-white/50 block tracking-wider uppercase leading-none mb-1">EXPIRA EN</span>
                      <span className="font-mono font-extrabold text-white/95">{newCardExpiry || "MM/YY"}</span>
                    </div>
                  </div>
                </div>
              );
            })()}


            <div className="grid grid-cols-2 gap-3.5">
              <div className="col-span-2 space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[9.5px] font-black text-slate-455 uppercase tracking-widest block">Numero de Tarjeta</label>
                  {newCardNumber.length >= 13 && (
                    isValidLuhn(newCardNumber) ? (
                      <span className="text-[8.5px] text-emerald-600 font-extrabold uppercase">Tarjeta valida</span>
                    ) : (
                      <span className="text-[8.5px] text-rose-500 font-extrabold uppercase">Formato invalido</span>
                    )
                  )}
                </div>
                <input 
                  type="text" 
                  maxLength={19} 
                  placeholder="4111 2222 3333 4444"
                  value={newCardNumber}
                  onChange={(e) => {
                    let val = e.target.value.replace(/\D/g, "");
                    if (val.startsWith("4")) setNewCardBrand("VISA");
                    else if (val.startsWith("5") || val.startsWith("2")) setNewCardBrand("MASTERCARD");
                    if (val.length <= 19) {
                      setNewCardNumber(val);
                    }
                  }}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 focus:border-[#0B53F4] rounded-xl px-3 py-2.5 text-slate-800 outline-none"
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-455 uppercase tracking-widest block ml-1">Expiracion</label>
                <input 
                  type="text" 
                  placeholder="MM/YY"
                  maxLength={5}
                  value={newCardExpiry}
                  onChange={(e) => {
                    let val = e.target.value.replace(/[^0-9\/]/g, "");
                    if (val.length === 2 && !val.includes("/") && e.nativeEvent.constructor.name === "InputEvent") {
                      val += "/";
                    }
                    setNewCardExpiry(val);
                  }}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 focus:border-[#0B53F4] rounded-xl px-3 py-2.5 text-slate-800 outline-none text-center font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9.5px] font-black text-slate-455 uppercase tracking-widest block ml-1">CVV</label>
                <input 
                  type="password" 
                  placeholder="***"
                  maxLength={4}
                  value={newCardCvv}
                  onChange={(e) => setNewCardCvv(e.target.value.replace(/\D/g, ""))}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 focus:border-[#0B53F4] rounded-xl px-3 py-2.5 text-slate-800 outline-none text-center font-mono"
                />
              </div>

              <div className="col-span-2 space-y-1">
                <label className="text-[9.5px] font-black text-slate-455 uppercase tracking-widest block ml-1">Nombre Completo del Titular</label>
                <input 
                  type="text" 
                  placeholder="Nombre como aparece en la tarjeta"
                  value={newCardHolder}
                  onChange={(e) => setNewCardHolder(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 focus:border-[#0B53F4] rounded-xl px-3 py-2.5 text-slate-800 outline-none uppercase"
                />
              </div>
            </div>

            <button 
              type="button"
              onClick={async () => {
                const cleanNum = newCardNumber.replace(/\s+/g, "");
                if (cleanNum.length < 13) {
                  toast.error("Por favor completa un numero de tarjeta valido.", "Numero invalido");
                  return;
                }
                if (!isValidLuhn(cleanNum)) {
                  toast.error("El numero digitado es invalido. Por favor ingresa una tarjeta de 13 a 16 digitos valida.", "Error de validacion");
                  return;
                }
                if (!cleanNum.startsWith("4") && !cleanNum.startsWith("5") && !cleanNum.startsWith("2")) {
                  toast.error("Por ahora solo se aceptan tarjetas Visa o Mastercard.", "Tarjeta no compatible");
                  return;
                }
                if (!newCardExpiry.includes("/") || newCardExpiry.length < 5) {
                  toast.error("Formato de expiracion debe ser MM/YY.", "Formato incorrecto");
                  return;
                }
                if (newCardCvv.length < 3) {
                  toast.error("Codigo CVV de seguridad incompleto.", "CVV invalido");
                  return;
                }
                if (!newCardHolder.trim()) {
                  toast.error("Por favor ingresa el nombre completo del tarjetahabiente.", "Titular vacio");
                  return;
                }

                try {
                  const payerEmail = correoPago || correoElectronico || auth.currentUser?.email || currentUserEmail;
                  const bankInfo = getCardBankInfo(cleanNum);
                  const response = await fetch(getApiUrl("/api/billing/setup/stripe"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      userId: initialProfile?.userId || auth.currentUser?.uid,
                      payerEmail,
                      holderName: newCardHolder.toUpperCase().trim(),
                      bankName: bankInfo.bankName
                    })
                  });
                  const data = await response.json().catch(() => ({}));
                  if (!response.ok || !data.checkoutUrl) {
                    throw new Error(data.error || "Stripe no devolvió una sesión de registro.");
                  }
                  openOfficialCheckoutPopup(data.checkoutUrl, "Stripe");
                  setAddingCard(false);
                  return;
                } catch (error: any) {
                  toast.error(error.message || "No se pudo vincular la tarjeta con Stripe.");
                  return;
                }

                const last4Val = cleanNum.slice(-4);
                const exists = cards.some(c => c.brand === newCardBrand && c.last4 === last4Val && c.expiry === newCardExpiry);
                if (exists) {
                  toast.error("Esta tarjeta ya se encuentra vinculada en tu cuenta.", "Tarjeta duplicada");
                  return;
                }

                // Prepare card obj
                const bankInfo = getCardBankInfo(cleanNum);
                const newCardObj: PaymentCard = {
                  id: "card_" + Date.now(),
                  brand: newCardBrand,
                  last4: last4Val,
                  expiry: newCardExpiry,
                  holderName: newCardHolder.toUpperCase().trim(),
                  isDefault: cards.length === 0,
                  bankName: bankInfo.bankName
                };

                const updatedCardsList = [...cards, newCardObj];
                setCards(updatedCardsList);
                setSelectedCardForPlan(newCardObj.id);
                setShowOtherPaymentMethods(true);
                
                // Clear fields
                setNewCardNumber("");
                setNewCardExpiry("");
                setNewCardCvv("");
                setNewCardHolder("");
                setAddingCard(false);
                setAddingMethodStep("select");

                // Instantly save to Firebase for real tests
                try {
                  await onSave({
                    userId: initialProfile?.userId || "guest",
                    rfc: rfc || initialProfile?.rfc || "",
                    razonSocial: razonSocial || initialProfile?.razonSocial || "",
                    regimenFiscal: regimenFiscal || initialProfile?.regimenFiscal || "",
                    codigoPostal: codigoPostal || initialProfile?.codigoPostal || "",
                    usoCFDI: usoCFDI || initialProfile?.usoCFDI || "G03",
                    createdAt: initialProfile?.createdAt || new Date().toISOString(),
                    personalGeminiKey: personalGeminiKey || initialProfile?.personalGeminiKey || "",
                    plan: initialProfile?.plan || "gratuito",
                    paymentCards: updatedCardsList
                  });
                  toast.success("Tarjeta vinculada con exito en tu cuenta.", "Metodo actualizado");
                } catch (e) {
                  toast.error("No se pudo guardar la tarjeta. Intenta nuevamente.");
                }
              }}
              className="w-full bg-[#0B53F4] text-white text-xs font-black py-3 rounded-2xl hover:bg-[#0747D1] transition shadow-md shadow-[#0B53F4]/10 cursor-pointer text-center active:scale-98"
            >
              Vincular Tarjeta
            </button>
          </div>
        )}

        {false && addingMethodStep === "connecting" && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center space-y-4 animate-pulse">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-[#ebf1ff] border-t-[#0B53F4] rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center font-sans font-black text-xs text-slate-500">
                {selectedMethodToAdd === "MERCADOPAGO" ? "MP" : 
                 selectedMethodToAdd === "GOOGLEPAY" ? "G" : "PP"}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-black text-slate-850 uppercase tracking-wider block">
                Conectando con {selectedMethodToAdd === "MERCADOPAGO" ? "Mercado Pago" : 
                                selectedMethodToAdd === "GOOGLEPAY" ? "Google Pay" : "PayPal"}
              </span>
              <p className="text-[10px] text-slate-400 font-bold leading-normal max-w-xs">
                Estableciendo conexión encriptada y autorizando token de facturación recurrente. Por favor espera...
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedMethodToAdd(null);
                setAddingMethodStep("select");
                setAddingCard(false);
              }}
              className="text-[10px] font-black text-[#0B53F4] hover:underline uppercase tracking-wider cursor-pointer"
            >
              Cancelar conexión
            </button>
          </div>
        )}

      </div>
    );
  };

  const renderPayButtonInline = () => {
    const isProcessing = isProcessingPayment || isProcessingWallet;
    
    return (
      <button
        type="button"
        disabled={isProcessing || shouldDisablePayButton}
        onClick={async (e) => {
          e.stopPropagation();
          
          if (shouldDisablePayButton) return;

          // If plan is free plan
          if (checkoutPlanType === "gratuito") {
            setIsProcessingPayment(true);
            try {
              await onSave({
                userId: initialProfile?.userId || "guest",
                rfc: rfc || "CABE850101ABC",
                razonSocial: razonSocial.trim().toUpperCase(),
                regimenFiscal,
                codigoPostal,
                usoCFDI,
                createdAt: initialProfile?.createdAt || new Date().toISOString(),
                personalGeminiKey: personalGeminiKey || "",
                plan: "gratuito",
                planStartDate: new Date().toISOString(),
                autoRenew: false,
                paymentCards: cards
              });
              setIsProcessingPayment(false);
              setCheckoutPlanType(null);
              localStorage.removeItem("zenticket_checkout_plan");
              localStorage.removeItem("selectedPlanOnSignup");
              toast.success("Tu plan ha sido cambiado al Plan Gratuito exitosamente.", "Suscripción actualizada");
            } catch (err) {
              setIsProcessingPayment(false);
              toast.error("Error al actualizar suscripción.", "Error");
            }
            return;
          }

          if (!selectedCardForPlan) {
            toast.error("Por favor selecciona un método de pago.");
            return;
          }

          if (selectedCardForPlan === "paypal_wallet") {
            await handleDigitalWalletPayment("PayPal");
          } else if (selectedCardForPlan === "mercadopago_wallet") {
            await handleDigitalWalletPayment("Mercado Pago");
          } else if (selectedCardForPlan === "googlepay_wallet") {
            await handleDigitalWalletPayment("Google Pay");
          } else {
            await handleDigitalWalletPayment("Stripe");
          }
        }}
        className="px-6 py-2 bg-[#0B53F4] hover:bg-[#0747D1] disabled:opacity-40 text-white text-xs font-black rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-sm shadow-[#0B53F4]/10 active:scale-95 shrink-0"
      >
        {isProcessing ? (
          <>
            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Procesando...</span>
          </>
        ) : (
          <span>{shouldDisablePayButton ? "Activo" : checkoutPlanType === "gratuito" ? "Activar Plan" : "Pagar"}</span>
        )}
      </button>
    );
  };

  const renderCheckoutSection = () => {
    const isCheckoutMode = checkoutPlanType !== null;

    return (
      <div className="space-y-4">
        {isCheckoutMode && (
          <div className="flex items-center gap-2.5 p-3.5 bg-white rounded-2xl border border-slate-200/60 text-xs text-slate-700 leading-tight select-none mt-4 mb-2">
            <input
              type="checkbox"
              id="autoRenewCheckoutChoice"
              checked={autoRenewChoice}
              onChange={(e) => setAutoRenewChoice(e.target.checked)}
              className="w-4 h-4 text-[#0B53F4] border-slate-350 rounded focus:ring-[#0B53F4] cursor-pointer shrink-0"
            />
            <label htmlFor="autoRenewCheckoutChoice" className="cursor-pointer">
              <span className="font-extrabold text-slate-800 block">Renovación automática cada mes</span>
            </label>
          </div>
        )}

        {/* 3.2 Pago Predeterminado o Seleccionado (Visual Card Principal) */}
        <div className="space-y-1.5 text-left">
          <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest block ml-0.5">
            {isCheckoutMode ? "Método de Pago Seleccionado" : "Pago Predeterminado / Tarjetas Guardadas"}
          </span>
        
          {(() => {
            const wallet = digitalWallets.find(w => w.id === selectedCardForPlan);
            if (wallet) {
              return (
                <div className="flex flex-col gap-3 p-5 bg-white dark:bg-[#0a0d19] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl w-full shadow-xs relative overflow-hidden animate-fade-in">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                      <div style={{ backgroundColor: '#ffffff' }} className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 p-2 shadow-3xs">
                        <img src={wallet.logo} className="w-full h-full object-contain" alt={wallet.name} />
                      </div>
                      <div className="text-left leading-tight min-w-0">
                        <span className="text-sm font-black text-slate-800 dark:text-white block">{wallet.displayName}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-400 font-semibold block mt-0.5 truncate">{wallet.sub}</span>
                      </div>
                    </div>
                    {/* Badges */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 text-[8.5px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider shadow-3xs">
                        <Check className="w-2.5 h-2.5 stroke-[3]" /> Vinculada con éxito
                      </span>
                      <span className="bg-slate-200/75 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-350/30 dark:border-slate-700/50 text-[8.5px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider">
                        Pago seleccionado
                      </span>
                    </div>
                  </div>
                  {isCheckoutMode && (
                    <div className="flex justify-between items-center pt-2.5 border-t border-slate-250/60 dark:border-slate-850 mt-0.5 text-left select-none">
                      <div>
                        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Método de Pago</span>
                        <span className="text-[11.5px] font-extrabold text-slate-700 dark:text-slate-200 block truncate">{wallet.displayName}</span>
                      </div>
                      <div>
                        {renderPayButtonInline()}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            const card = cards.find(c => c.id === selectedCardForPlan) || cards.find(c => c.isDefault) || cards[0];
            if (card) {
              return (
                <div className="flex flex-col gap-3 p-5 bg-white dark:bg-[#0a0d19] border border-slate-200/80 dark:border-slate-800/80 rounded-3xl w-full shadow-xs relative overflow-hidden animate-fade-in">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                      {renderVisualBrandBlock(card, "md")}
                      <div className="text-left leading-tight min-w-0">
                        <span className="text-sm font-black text-slate-800 dark:text-white block">
                          {card.bankName || (card.brand === "VISA" ? "Tarjeta Visa" : "Mastercard")}
                        </span>
                        <span className="text-xs text-slate-450 dark:text-slate-400 font-mono mt-0.5 block">
                          •••• •••• •••• {card.last4}
                        </span>
                      </div>
                    </div>
                    {/* Badges */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 text-[8.5px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider shadow-3xs">
                        <Check className="w-2.5 h-2.5 stroke-[3]" /> Vinculada con éxito
                      </span>
                      <span className="bg-[#EBF1FF] dark:bg-[#0B53F4]/10 text-[#0B53F4] dark:text-[#7fa5ff] border border-[#0B53F4]/10 dark:border-[#0B53F4]/20 text-[8.5px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider">
                        Método predeterminado
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-2.5 border-t border-slate-250/60 dark:border-slate-850 mt-0.5 text-left select-none">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Titular</span>
                      <span className="text-[11.5px] font-extrabold text-slate-700 dark:text-slate-200 block truncate max-w-[200px]">{card.holderName}</span>
                    </div>
                    
                    {isCheckoutMode ? (
                      <div className="flex items-center gap-3 shrink-0">
                        {card.expiryMonth && card.expiryYear && (
                          <div className="text-right mr-1.5 hidden sm:block">
                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Expira</span>
                            <span className="text-[11.5px] font-extrabold text-slate-700 dark:text-slate-200 block font-mono leading-none mt-0.5">{card.expiryMonth}/{card.expiryYear}</span>
                          </div>
                        )}
                        {renderPayButtonInline()}
                      </div>
                    ) : (
                      card.expiryMonth && card.expiryYear && (
                        <div className="text-right">
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Expira</span>
                          <span className="text-[11.5px] font-extrabold text-slate-700 dark:text-slate-200 block font-mono">{card.expiryMonth}/{card.expiryYear}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            }
            return (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-500">
                Selecciona un método de pago a continuación.
              </div>
            );
          })()}
        </div>

        {/* Correo para Cuentas de Pago */}
        {isCheckoutMode && (
          <div className="space-y-1 bg-white border border-slate-200/60 rounded-2xl p-4 text-left animate-fade-in">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
              Correo para Cuentas de Pago (Stripe/PayPal/Mercado Pago)
            </label>
            <div className="flex gap-2 mt-1.5">
              <input
                type="email"
                value={correoPago}
                onChange={(e) => setCorreoPago(e.target.value)}
                placeholder="Ej. mi-cuenta-de-pago@email.com"
                className="flex-grow text-xs font-semibold bg-[#F8F9FE] border border-slate-200/70 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none transition-all placeholder-slate-400"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!correoPago.trim()) {
                    toast.error("El correo no puede estar vacío.");
                    return;
                  }
                  try {
                    const trimmedEmail = correoPago.trim();
                    await onSave({
                      ...initialProfile,
                      correoPago: trimmedEmail
                    });
                    
                    setCorreoPago(trimmedEmail);
                    if (!selectedCardForPlan && cards.length > 0) {
                      setSelectedCardForPlan(cards.find(card => card.isDefault)?.id || cards[0].id);
                    }
                    toast.success("Correo guardado para Stripe Checkout y Stripe Link.", "Correo actualizado");
                  } catch (e) {
                    toast.error("No se pudo vincular el correo de pagos.");
                  }
                }}
                className="bg-[#0B53F4] hover:bg-[#0747D1] text-white text-[11px] font-black px-4 py-2.5 rounded-xl transition cursor-pointer shrink-0 active:scale-95 animate-fade-in"
              >
                Guardar
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 ml-1 leading-normal">
              Vincula automáticamente las tarjetas predeterminadas y pre-llena tus datos en las pasarelas al pagar.
            </p>
          </div>
        )}

        {/* 3.3 Menú Desplegable (Acordeón Colapsable) */}
        <div className="pt-2 select-none">
          <button
            type="button"
            onClick={() => setIsAccordionExpanded(!isAccordionExpanded)}
            className="w-full flex items-center justify-between p-4.5 bg-slate-50 border border-slate-200/80 hover:bg-slate-100/70 rounded-2xl transition cursor-pointer text-left font-black text-xs text-slate-600 uppercase tracking-wider"
          >
            <span>Cambiar método de pago / Ver opciones</span>
            <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isAccordionExpanded ? "rotate-180" : ""}`} />
          </button>
        </div>

        {isAccordionExpanded && (
          <div className="space-y-3 pt-1 animate-fade-in duration-200">
            {renderAccordionPaymentMethods()}
          </div>
        )}

        {addingCard && renderLocalCardForm()}
      </div>
    );
  };

  const renderAccordionPaymentMethods = () => {
    const selectableCards = cards.filter((card) => card.id !== selectedCardForPlan);
    const selectableWallets = digitalWallets.filter((wallet) => wallet.id !== selectedCardForPlan);

    return (
      <div className="space-y-3">
        {!addingCard && (
          <>
            {/* List other saved cards */}
            {selectableCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedCardForPlan(card.id)}
                className="w-full flex items-center gap-4.5 p-4.5 border border-slate-200 bg-slate-50 hover:bg-slate-100/70 hover:border-[#0B53F4]/50 rounded-2xl text-left transition cursor-pointer group"
              >
                {renderVisualBrandBlock(card, "md")}
                <div className="min-w-0">
                  <span className="text-sm font-black text-slate-800 block">
                    {card.bankName || (card.brand === "VISA" ? "Tarjeta Visa" : "Mastercard")}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold block mt-1 truncate">Titular: {card.holderName}</span>
                  <span className="text-xs text-slate-400 font-mono block mt-0.5">•••• {card.last4}</span>
                </div>
              </button>
            ))}

            {/* List other digital wallets */}
            {selectableWallets.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                onClick={() => setSelectedCardForPlan(wallet.id)}
                className="w-full flex items-center gap-4.5 p-4.5 border border-slate-200 bg-slate-50 hover:bg-slate-100/70 hover:border-[#0B53F4]/50 rounded-2xl text-left transition cursor-pointer group"
              >
                <div style={{ backgroundColor: '#ffffff' }} className="w-14 h-14 rounded-xl border border-slate-200 flex items-center justify-center shrink-0 p-2 shadow-3xs">
                  <img src={wallet.logo} className="w-full h-full object-contain" alt={wallet.name} />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-black text-slate-800 block">{wallet.displayName}</span>
                  <span className="text-xs text-slate-400 font-semibold block mt-1">{wallet.sub}</span>
                </div>
              </button>
            ))}
          </>
        )}
        
        <button
          type="button"
          onClick={() => setAddingCard(true)}
          className="w-full text-xs font-bold py-3.5 rounded-2xl transition cursor-pointer bg-[#0B53F4] hover:bg-[#0747D1] text-white zt-btn-primary"
        >
          Vincular nueva tarjeta
        </button>

      </div>
    );
  };

  const renderNormalSection = () => {
    if (cards.length === 0) {
      return (
        <div className="bg-white dark:bg-[#0d1225]/40 border border-slate-200/50 dark:border-slate-800/60 rounded-3xl p-6 text-center text-xs text-slate-400 font-semibold shadow-[0_4px_20px_rgba(15,23,42,0.02)] select-none">
          No tienes tarjetas dadas de alta. Agrega una arriba para realizar compras.
        </div>
      );
    }

    const currentPlan = initialProfile?.plan || "gratuito";

    return (
      <div className="space-y-4">
        {cards.map((card) => {
          const isDefault = card.isDefault;
          return (
            <div 
              key={card.id} 
              className={`border rounded-3xl p-5 relative space-y-4 text-left transition-all ${
                isDefault 
                  ? "border-[#0B53F4]/40 bg-[#070b19]/90 shadow-[0_10px_30px_rgba(11,83,244,0.04)]" 
                  : "border-slate-200 bg-white dark:border-slate-800/60 dark:bg-[#0d1225]/20"
              }`}
            >
              {/* Header row */}
              <div className="flex items-center justify-between select-none">
                <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                  {isDefault ? "Método principal" : "Método adicional"}
                </span>
                {isDefault && (
                  <span className="text-[9px] font-black bg-[#0B53F4]/10 text-[#0B53F4] border border-[#0B53F4]/20 px-2.5 py-1 rounded-lg">
                    Predeterminada
                  </span>
                )}
              </div>

              {/* Card visual block & details */}
              <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center justify-between">
                {/* Credit Card Mockup */}
                <div className="w-56 h-32 rounded-2xl bg-gradient-to-br from-[#0c1a30] to-[#040915] border border-slate-800 p-4 flex flex-col justify-between shadow-md shrink-0 select-none">
                  <div className="flex justify-between items-start">
                    <span className="font-extrabold text-sm text-white italic tracking-wider">
                      {card.brand || "VISA"}
                    </span>
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                      stripe
                    </span>
                  </div>
                  <div>
                    <span className="font-mono text-base text-white tracking-widest block py-2">
                      •••• •••• •••• {card.last4}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-mono text-slate-400">
                      Vence {card.expiry}
                    </span>
                    <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wide truncate max-w-[100px]">
                      {card.holderName}
                    </span>
                  </div>
                </div>

                {/* Sincronizada con Stripe Info */}
                <div className="flex items-start gap-2.5 text-left flex-grow">
                  <div className="w-8 h-8 rounded-full bg-[#EBF1FF] flex items-center justify-center text-[#0B53F4] shrink-0">
                    <CreditCard className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <span className="text-xs font-black text-slate-300 block">Sincronizada con Stripe</span>
                    <span className="text-[10px] text-slate-450 font-bold block mt-1 leading-normal">
                      Vinculada a tu cuenta para pagos automáticos.
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Row: default status pill & action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/40">
                {/* Green confirmation pill */}
                {isDefault ? (
                  <div className="flex items-center gap-1.5 bg-emerald-950/20 text-emerald-500 border border-emerald-900/40 px-3.5 py-2 rounded-xl text-[10.5px] font-bold select-none">
                    <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[3]" />
                    <span>Esta tarjeta se usará para tus pagos.</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch(getApiUrl("/api/billing/payment-methods/set-default"), {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            userId: initialProfile?.id || initialProfile?.userId || auth.currentUser?.uid || "guest",
                            paymentMethodId: card.id
                          })
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setCards(data.paymentCards);
                          toast.success("Se ha cambiado tu tarjeta predeterminada.", "Tarjeta Actualizada");
                        } else {
                          throw new Error("API error");
                        }
                      } catch (err) {
                        toast.error("Ocurrió un error al predeterminar tu tarjeta.");
                      }
                    }}
                    className="text-xs font-bold text-[#0B53F4] hover:underline bg-transparent border-none outline-none cursor-pointer"
                  >
                    Establecer como predeterminada
                  </button>
                )}

                {/* Right side actions: delete & pay now */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch(getApiUrl("/api/billing/payment-methods/delete"), {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            userId: initialProfile?.id || initialProfile?.userId || auth.currentUser?.uid || "guest",
                            paymentMethodId: card.id
                          })
                        });
                        if (res.ok) {
                          const data = await res.json();
                          setCards(data.paymentCards);
                          toast.success("Método de pago eliminado con éxito.", "Tarjeta Eliminada");
                        } else {
                          throw new Error("API error");
                        }
                      } catch (err) {
                        toast.error("Ocurrió un error al eliminar tu tarjeta.");
                      }
                    }}
                    className="flex items-center gap-1.5 border border-rose-950/30 hover:bg-rose-950/10 text-rose-500 px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Eliminar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutPlanType(currentPlan || "brisa");
                    }}
                    className="bg-[#0B53F4] hover:bg-[#0747D1] text-white px-5 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer active:scale-98"
                  >
                    Pagar ahora
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Apariencia states
  const [themeChoice, setThemeChoice] = useState<"light" | "dark" | "system">(
    () => (localStorage.getItem("zenticket_theme") as "light" | "dark" | "system") || "dark"
  );
  const [fontSizeChoice, setFontSizeChoice] = useState<"small" | "medium" | "large">(
    () => (localStorage.getItem("zenticket_font_size") as "small" | "medium" | "large") || "medium"
  );
  const [borderRadiusChoice, setBorderRadiusChoice] = useState<"compact" | "standard" | "extra">(
    () => (localStorage.getItem("zenticket_border_radius") as "compact" | "standard" | "extra") || "standard"
  );

  React.useEffect(() => {
    // 1. Theme
    let activeTheme = themeChoice;
    if (themeChoice === "system") {
      activeTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", activeTheme);
    if (activeTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // 2. Font Size
    document.documentElement.setAttribute("data-font-size", fontSizeChoice);

    // 3. Border Radius
    document.documentElement.setAttribute("data-radius", borderRadiusChoice);
  }, [themeChoice, fontSizeChoice, borderRadiusChoice]);

  React.useEffect(() => {
    if (initialProfile) {
      setRfc(initialProfile.rfc || "");
      setRazonSocial(initialProfile.razonSocial || "");
      setRegimenFiscal(initialProfile.regimenFiscal || "626");
      setCodigoPostal(initialProfile.codigoPostal || "");
      setUsoCFDI(initialProfile.usoCFDI || "G03");
      setPersonalGeminiKey(initialProfile.personalGeminiKey || "");
      
      const isMock = initialProfile.rfc === "CABE850101ABC" || 
                     initialProfile.rfc === "GOMD850101XYZ" || 
                     initialProfile.razonSocial === "RICARDO CASTRO BECERRIL" || 
                     initialProfile.razonSocial === "CONSTRUCTORA LEGION DEL NORTE SA DE CV";
      setHasSavedFiscalData(!!(initialProfile.rfc && initialProfile.razonSocial && initialProfile.codigoPostal && !isMock));
    }
  }, [initialProfile]);

  // Notificaciones states
  const [notifInvoices, setNotifInvoices] = useState(true);
  const [notifConnectors, setNotifConnectors] = useState(true);
  const [notifEmailDaily, setNotifEmailDaily] = useState(false);

  // Idioma states
  const [languageChoice, setLanguageChoice] = useState("es-MX");

  // Soporte states
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportEmail, setSupportEmail] = useState("");

  // FAQ accordion active state index (-1 means none open)
  const [openFaqIndex, setOpenFaqIndex] = useState<number>(-1);

  // Tutorial slide step index (0 to 2)
  const [tutorialStep, setTutorialStep] = useState<number>(0);

  // Display user details dynamically if logged in
  const currentUser = auth.currentUser;
  const userInitials = nombreCompleto
    ? nombreCompleto.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase()
    : (sessionEmail ? sessionEmail.slice(0, 2).toUpperCase() : "US");
  const userFullName = nombreCompleto || currentUser?.displayName || sessionName || sessionEmail || "Usuario";
  const userDisplayEmail = correoElectronico || currentUser?.email || sessionEmail || "";
  const paymentAccountName = currentUser?.displayName || sessionName || userFullName;
  const paymentAccountEmail = correoPago || correoRecepcion || userDisplayEmail || sessionEmail;

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error signing out: ", err);
    }
  };

  const handleSaveFiscalOnly = async () => {
    setMessage(null);

    // Basic SAT field validations
    const cleanedRFC = rfc.trim().toUpperCase();
    if (cleanedRFC.length < 12 || cleanedRFC.length > 13) {
      toast.error("El RFC debe tener exactamente 12 o 13 caracteres o un formato de Persona Física/Moral con homoclave.", "Error de Validación");
      return;
    }
    const rfcRegex = /^[A-Z\u00d1&]{3,4}\d{6}[A-Z\d]{3}$/i;
    if (!rfcRegex.test(cleanedRFC)) {
      toast.error("Formato de RFC nacional incorrecto. Por favor introduce un RFC con homoclave válido (Homo-RFC).", "Error de RFC SAT");
      return;
    }
    if (!razonSocial.trim()) {
      toast.error("La Razón Social o Nombre Legal no puede quedar vacía.", "Error de Validación");
      return;
    }
    if (codigoPostal.length !== 5 || isNaN(Number(codigoPostal))) {
      toast.error("El Código Postal del domicilio fiscal del receptor debe ser de exactamente 5 dígitos numéricos.", "Error de Validación");
      return;
    }

    try {
      await onSave({
        userId: initialProfile?.userId || "guest",
        rfc: cleanedRFC,
        razonSocial: razonSocial.trim().toUpperCase(),
        regimenFiscal,
        codigoPostal: codigoPostal.trim(),
        usoCFDI,
        createdAt: initialProfile?.createdAt || new Date().toISOString(),
        personalGeminiKey: personalGeminiKey.trim(),
        plan: initialProfile?.plan || "gratuito",
        paymentCards: initialProfile?.paymentCards || cards || [],
        correoRecepcion: correoRecepcion.trim(),
        correoPago: correoPago.trim(),
        facturacionAutomatica,
        metodoRecepcion,
        navigationDisabled: false // Deactivate navigation restriction automatically so user can navigate!
      });
      setHasSavedFiscalData(true);
      toast.success("¡Datos fiscales validados y guardados exitosamente! La navegación se ha ACTIVADO en automático para que puedas usar todas las herramientas.", "Guardado y Seguro");
      
      // Return smoothly back to view tab after short grace delay
      setTimeout(() => {
        setIsEditingFiscal(false);
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar perfil fiscal.", "Error");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // Basic SAT field validations
    // Basic SAT field validations (only if fiscal data is being filled/changed)
    const cleanedRFC = rfc.trim().toUpperCase();
    const hasFiscalInput = cleanedRFC.length > 0 || razonSocial.trim().length > 0 || codigoPostal.trim().length > 0;
    
    if (hasFiscalInput) {
      if (cleanedRFC.length < 12 || cleanedRFC.length > 13) {
        toast.error("El RFC debe tener exactamente 12 o 13 caracteres.", "Error de Validación");
        return;
      }
      if (!razonSocial.trim()) {
        toast.error("Debe ingresar una Razón Social o Nombre Legal.", "Error de Validación");
        return;
      }
      if (codigoPostal.length !== 5 || isNaN(Number(codigoPostal))) {
        toast.error("El Código Postal de la dirección fiscal debe tener 5 dígitos.", "Error de Validación");
        return;
      }
    }

    try {
      await onSave({
        userId: initialProfile?.userId || "guest",
        rfc: cleanedRFC,
        razonSocial: razonSocial.trim().toUpperCase(),
        regimenFiscal,
        codigoPostal: codigoPostal.trim(),
        usoCFDI,
        createdAt: initialProfile?.createdAt || new Date().toISOString(),
        personalGeminiKey: personalGeminiKey.trim(),
        plan: initialProfile?.plan || "gratuito",
        paymentCards: initialProfile?.paymentCards || cards || [],
        correoRecepcion: correoRecepcion.trim(),
        correoPago: correoPago.trim(),
        facturacionAutomatica,
        metodoRecepcion
      });
      toast.success("¡Perfil y preferencias guardadas exitosamente!", "Cambios Guardados");
      
      // Return smoothly back to view tab after short grace delay
      setTimeout(() => {
        setIsEditingFiscal(false);
      }, 1000);
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar perfil.", "Error");
    }
  };

  if (isEditingFiscal) {
    return (
      <div id="fiscal-form-pane" className="max-w-3xl mx-auto bg-[#F8F9FE] border border-slate-200/50 shadow-sm rounded-3xl p-5 sm:p-8 animate-fade-in_50 font-sans text-left mt-2 relative select-none">
        
        {/* TOP BAR / NAVIGATION HEADER exactly as pictured */}
        <div className="flex bg-white border-b border-slate-100 px-5 py-4 items-center justify-between sticky top-0 z-30 font-sans -mx-5 -mt-5 sm:-mx-7 sm:-mt-7 rounded-t-3xl mb-6">
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={() => setIsEditingFiscal(false)}
              className="text-[#0B53F4] hover:opacity-80 transition cursor-pointer p-1.5 focus:outline-none"
            >
              <ArrowLeft className="w-5.5 h-5.5 stroke-[2.5]" />
            </button>
            <span className="text-base font-black text-slate-900 tracking-tight">Editar Perfil</span>
          </div>
          <img 
            src={initialProfile?.photoURL || "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=200"} 
            alt="User thumbnail avatar" 
            className="w-10 h-10 rounded-full border border-slate-200/80 shadow-xs object-cover"
            referrerPolicy="no-referrer"
          />
        </div>

        {!isProfileComplete && (
          <div className="mb-6 bg-gradient-to-tr from-rose-50 to-amber-50 border border-rose-200/80 rounded-2xl p-5 text-left flex items-start gap-3.5 shadow-2xs">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
              <AlertCircle className="w-5.5 h-5.5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-black text-rose-800 uppercase tracking-widest">
                CONFIGURACION FISCAL MANDATORIA
              </h4>
              <p className="text-[11.5px] text-slate-600 leading-relaxed font-semibold">
                Es mandatorio completar tus datos fiscales certificados (RFC, Razón Social, Régimen y Código Postal) al crear una cuenta nueva antes de poder digitalizar tus tickets de compra o automatizar tus facturaciones.
              </p>
            </div>
          </div>
        )}

        {/* PROFILE PICTURE CARD CONTAINER as pictured with circle ring and blue overlay badge */}
        <div className="bg-white border border-[#EBF1FF] rounded-3xl p-6 flex flex-col items-center justify-center relative mb-6 shadow-xs">
          <div className="relative w-24 h-24 rounded-full border-[3px] border-white ring-[4px] ring-[#0B53F4]/20 flex items-center justify-center overflow-visible">
            <img 
              src={initialProfile?.photoURL || "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=200"} 
              alt={initialProfile?.name || "User Portrait"} 
              className="w-full h-full rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
            {/* Small Blue pencil badge attached exactly bottom right */}
            <button 
              type="button"
              onClick={() => toast.info("Función de cambio de fotografía estará disponible en la versión móvil nativa.", "Foto de Perfil")}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#0B53F4] hover:bg-[#0747D1] text-white flex items-center justify-center shadow-md border-2 border-white cursor-pointer transition active:scale-95"
            >
              <Pencil className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
          <button 
            type="button" 
            onClick={() => toast.info("Configura tu avatar usando Gravatar o sube tu foto directamente.", "Cambiar foto")}
            className="text-xs font-bold text-[#0B53F4] hover:underline mt-3"
          >
            Cambiar foto
          </button>
        </div>

        {/* SECTION 1: DATOS PERSONALES */}
        <h3 className="text-base font-black text-[#0B53F4] uppercase tracking-wide mb-3 mt-4 ml-1 pl-1">
          Datos Personales
        </h3>
        
        <div className="bg-white border border-slate-200/60 rounded-3xl p-5 space-y-4 shadow-2xs mb-6">
          {/* Nombre Completo */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Nombre Completo
            </label>
            <input
              type="text"
              value={nombreCompleto}
              onChange={(e) => setNombreCompleto(e.target.value)}
              className="w-full text-sm font-medium bg-[#F8F9FE] border border-slate-200/70 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3 text-slate-800 focus:outline-none transition-all placeholder-slate-400"
            />
          </div>

          {/* Correo Electrónico */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Correo Electrónico
            </label>
            <input
              type="email"
              value={correoElectronico}
              onChange={(e) => setCorreoElectronico(e.target.value)}
              className="w-full text-sm font-medium bg-[#F8F9FE] border border-slate-200/70 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3 text-slate-800 focus:outline-none transition-all placeholder-slate-400"
            />
          </div>

          {/* Teléfono */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Teléfono
            </label>
            <input
              type="text"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full text-sm font-medium bg-[#F8F9FE] border border-slate-200/70 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3 text-slate-800 focus:outline-none transition-all placeholder-slate-400"
            />
          </div>

          {/* Inline grid columns for Fecha de Registro and Plan Actual */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Fecha de Registro
              </label>
              <div className="w-full text-sm font-bold bg-[#EBF1FF]/60 border border-[#EBF1FF] rounded-2xl px-4 py-3.5 text-slate-600 cursor-not-allowed select-none">
                12 Oct 2023
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                Plan Actual
              </label>
              <div className="w-full text-sm font-black bg-[#EBF1FF]/60 border border-[#EBF1FF] rounded-2xl px-4 py-3.5 text-[#0B53F4] cursor-not-allowed select-none capitalize">
                {currentPlan === "brisa" ? "Plan Brisa" : currentPlan === "serenidad" ? "Plan Serenidad" : currentPlan === "nirvana" ? "Plan Nirvana" : "Plan Gratuito"}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: DATOS FISCALES */}
        <div className="flex items-center justify-between mb-3 mt-8 ml-1 pl-1">
          <h3 className="text-base font-black text-[#0B53F4] uppercase tracking-wide">
            Datos Fiscales
          </h3>
        </div>

        {/* Constancia Fiscal Upload Box at the beginning of the form */}
        <div className="bg-gradient-to-br from-blue-50/50 to-white border-[0.5px] border-[#0B53F4]/20 rounded-3xl p-5 mb-5 shadow-2xs text-left animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-black text-[#0B53F4] uppercase tracking-wider block">Autocompletar con IA</span>
              <p className="text-[11px] text-slate-500 leading-normal max-w-lg">
                Sube tu Constancia de Situación Fiscal (PDF o imagen) y nuestro lector inteligente completará el RFC, Razón Social, Régimen y Código Postal en segundos.
              </p>
            </div>
            
            <div className="shrink-0">
              <input
                type="file"
                ref={constanciaInputRef}
                accept="application/pdf,image/*"
                onChange={handleConstanciaUpload}
                className="hidden"
                disabled={hasSavedFiscalData}
              />
              <button
                type="button"
                disabled={isParsingConstancia || hasSavedFiscalData}
                onClick={() => constanciaInputRef.current?.click()}
                className="w-full sm:w-auto px-5 py-3.5 bg-[#0B53F4] hover:bg-[#0747D1] disabled:bg-[#0B53F4]/40 disabled:opacity-50 text-white text-xs font-bold rounded-2xl uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:cursor-not-allowed"
              >
                {isParsingConstancia ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Leyendo Constancia...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    <span>Cargar Constancia SAT</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 rounded-3xl p-5 space-y-4 shadow-2xs mb-6">
          {/* RFC */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              RFC
            </label>
            <input
              type="text"
              maxLength={13}
              value={rfc}
              disabled={hasSavedFiscalData}
              onChange={(e) => setRfc(e.target.value.toUpperCase())}
              placeholder="RFC de 12 o 13 dígitos"
              className="w-full text-sm font-mono bg-[#F8F9FE] disabled:bg-slate-50 disabled:text-slate-450 border border-slate-200/70 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3 text-slate-800 focus:outline-none transition-all placeholder-slate-400 disabled:cursor-not-allowed"
            />
          </div>

          {/* Razón Social */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Razón Social
            </label>
            <input
              type="text"
              value={razonSocial}
              disabled={hasSavedFiscalData}
              onChange={(e) => setRazonSocial(e.target.value)}
              placeholder="Tal como figura en constancia SAT"
              className="w-full text-sm font-medium bg-[#F8F9FE] disabled:bg-slate-50 disabled:text-slate-450 border border-slate-200/70 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3 text-slate-800 focus:outline-none transition-all placeholder-slate-400 disabled:cursor-not-allowed"
            />
          </div>

          {/* Régimen Fiscal */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Régimen Fiscal
            </label>
            <div className="relative">
              <select
                value={regimenFiscal}
                disabled={hasSavedFiscalData}
                onChange={(e) => setRegimenFiscal(e.target.value)}
                className="w-full text-sm font-medium bg-[#F8F9FE] disabled:bg-slate-50 disabled:text-slate-450 border border-slate-200/70 focus:border-[#0B53F4] rounded-2xl px-4 py-3.5 text-slate-800 focus:outline-none transition-all cursor-pointer appearance-none disabled:cursor-not-allowed"
              >
                <option value="601">601 - General de Ley Personas Morales</option>
                <option value="603">603 - Personas Morales con Fines no Lucrativos</option>
                <option value="605">605 - Sueldos y Salarios e Ingresos Asimilados</option>
                <option value="606">606 - Arrendamiento</option>
                <option value="612">612 - Actividades Empresariales y Profesionales</option>
                <option value="626">626 - RESICO (Régimen de Confianza)</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-450 font-bold">&#9662;</div>
            </div>
          </div>

          {/* Código Postal Fiscal */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Código Postal Fiscal
            </label>
            <input
              type="text"
              maxLength={5}
              value={codigoPostal}
              disabled={hasSavedFiscalData}
              onChange={(e) => setCodigoPostal(e.target.value.replace(/\D/g, ""))}
              placeholder="02000"
              className="w-full text-sm font-mono bg-[#F8F9FE] disabled:bg-slate-50 disabled:text-slate-450 border border-slate-200/70 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3 text-slate-800 focus:outline-none transition-all placeholder-slate-400 disabled:cursor-not-allowed"
            />
          </div>

          {/* Uso CFDI Predeterminado */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Uso CFDI Predeterminado
            </label>
            <div className="relative">
              <select
                value={usoCFDI}
                disabled={hasSavedFiscalData}
                onChange={(e) => setUsoCFDI(e.target.value)}
                className="w-full text-sm font-medium bg-[#F8F9FE] disabled:bg-slate-50 disabled:text-slate-450 border border-slate-200/70 focus:border-[#0B53F4] rounded-2xl px-4 py-3.5 text-slate-800 focus:outline-none transition-all cursor-pointer appearance-none disabled:cursor-not-allowed"
              >
                <option value="G01">G01 - Adquisición de mercancías</option>
                <option value="G03">G03 - Gastos en general</option>
                <option value="D01">D01 - Honorarios médicos, dentales y hospitalarios</option>
                <option value="D02">D02 - Gastos médicos por incapacidad o discapacidad</option>
                <option value="D04">D04 - Donativos</option>
                <option value="S01">S01 - Sin efectos fiscales</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-450 font-bold">&#9662;</div>
            </div>
          </div>

          {/* Correo para Recepción de Facturas */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Correo para Recepción de Facturas
            </label>
            <input
              type="email"
              value={correoRecepcion}
              disabled={hasSavedFiscalData}
              onChange={(e) => setCorreoRecepcion(e.target.value)}
              className="w-full text-sm font-medium bg-[#F8F9FE] disabled:bg-slate-50 disabled:text-slate-455 border border-slate-200/70 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-2xl px-4 py-3 text-slate-800 focus:outline-none transition-all placeholder-slate-400 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        {/* Botón Guardar Datos Fiscales */}
        <div className="mb-8">
          <button
            type="button"
            disabled={hasSavedFiscalData}
            onClick={handleSaveFiscalOnly}
            className="w-full bg-[#0B53F4] hover:bg-[#0747D1] disabled:bg-slate-300 disabled:text-slate-500 disabled:opacity-90 disabled:shadow-none text-white text-xs font-black py-4 rounded-2xl transition shadow-lg shadow-[#0B53F4]/15 cursor-pointer text-center flex items-center justify-center gap-2 active:scale-98 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4 text-white disabled:text-slate-400" />
            <span>{hasSavedFiscalData ? "DATOS FISCALES GUARDADOS Y CERTIFICADOS - NAVEGACION LIBRE Y ACCESIBLE" : "GUARDAR DATOS FISCALES"}</span>
          </button>
        </div>


        {/* SECTION 3: PREFERENCIAS */}
        <h3 className="text-base font-black text-[#0B53F4] uppercase tracking-wide mb-3 mt-8 ml-1 pl-1">
          Preferencias
        </h3>

        <div className="bg-white border border-slate-200/60 rounded-3xl p-5 space-y-5 shadow-2xs mb-6">
          {/* Facturación Automática Switch Row */}
          <div className="flex items-center justify-between gap-4">
            <div className="text-left leading-tight">
              <span className="text-sm font-bold text-slate-800 block">Facturación Automática</span>
              <span className="text-[11px] text-slate-400 block mt-1">Generar CFDI al detectar pago</span>
            </div>
            {/* iOS Styled Premium Toggle Switch Inactive by default matching picture */}
            <button
              type="button"
              onClick={() => setFacturacionAutomatica(!facturacionAutomatica)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                facturacionAutomatica ? "bg-[#0B53F4]" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  facturacionAutomatica ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Método de Recepción Label & Horizontal Button Grid */}
          <div className="space-y-2 pt-2 border-t border-slate-100/70">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Método de Recepción
            </label>
            <div className="flex gap-3">
              {["Correo", "Descarga", "Ambos"].map((option) => {
                const isActive = metodoRecepcion === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMetodoRecepcion(option)}
                    className={`flex-1 py-3 text-xs font-bold rounded-xl transition cursor-pointer select-none border ${
                      isActive 
                        ? "bg-[#EBF1FF]/75 border-2 border-[#0B53F4] text-[#0B53F4] shadow-xs" 
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* SECTION 4: SEGURIDAD */}
        <h3 className="text-base font-black text-[#0B53F4] uppercase tracking-wide mb-3 mt-8 ml-1 pl-1">
          Seguridad
        </h3>

        <div className="bg-white border border-slate-200/60 rounded-3xl p-5 space-y-4 shadow-2xs mb-6">
          {/* Cambiar Contraseña list row */}
          {(() => {
            const hasPasswordProvider = auth.currentUser?.providerData.some(p => p.providerId === "password");
            return (
              <div className="border border-slate-150 rounded-2xl overflow-hidden bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                  className="w-full flex items-center justify-between p-4 hover:bg-[#EBF1FF]/20 transition text-left focus:outline-none cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <Lock className="w-5 h-5 text-[#0B53F4]/80 stroke-[2.2]" />
                    <span className="text-sm font-bold text-slate-800">
                      {hasPasswordProvider ? "Cambiar Contraseña" : "Crear / Establecer Contraseña"}
                    </span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showPasswordForm ? "rotate-180" : ""}`} />
                </button>

                {showPasswordForm && (
                  <div className="p-4.5 bg-white border-t border-slate-100 space-y-4 text-left animate-fade-in">
                    {!hasPasswordProvider && tempPassword && (
                      <div className="bg-blue-50 border border-blue-200/50 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed text-slate-700 font-semibold mb-2">
                        <Info className="w-4 h-4 text-[#0B53F4] shrink-0 mt-0.5" />
                        <div className="flex-1">
                          Iniciaste sesión con Google y no tienes una contraseña definida en la app. 
                          Tu contraseña temporal por defecto es: <strong className="text-slate-800 font-black select-all bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-mono">{tempPassword}</strong>
                          <button
                            type="button"
                            onClick={handleCopyTemp}
                            className="ml-2 inline-flex items-center gap-1 text-[#0B53F4] hover:underline cursor-pointer font-bold align-middle"
                          >
                            {copiedTemp ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Copiado</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>. 
                          Te recomendamos crear una contraseña personalizada abajo para poder ingresar sin Google.
                        </div>
                      </div>
                    )}

                    <div className="space-y-3.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
                          Nueva Contraseña
                        </label>
                        <div className="relative">
                          <input 
                            type={showNewPasswordText ? "text" : "password"}
                            placeholder="Mínimo 6 caracteres"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full text-xs font-semibold bg-[#F8F9FE] border border-slate-200/70 focus:border-[#0B53F4] rounded-xl pl-3.5 pr-10 py-2.5 text-slate-800 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPasswordText(!showNewPasswordText)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer focus:outline-none flex items-center justify-center"
                          >
                            {showNewPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">
                          Confirmar Nueva Contraseña
                        </label>
                        <div className="relative">
                          <input 
                            type={showConfirmPasswordText ? "text" : "password"}
                            placeholder="Repite la contraseña"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full text-xs font-semibold bg-[#F8F9FE] border border-slate-200/70 focus:border-[#0B53F4] rounded-xl pl-3.5 pr-10 py-2.5 text-slate-800 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPasswordText(!showConfirmPasswordText)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer focus:outline-none flex items-center justify-center"
                          >
                            {showConfirmPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isUpdatingPassword || newPassword.length < 6 || confirmPassword.length < 6}
                        onClick={async () => {
                          if (newPassword !== confirmPassword) {
                            toast.error("Las contraseñas no coinciden.", "Error de confirmación");
                            return;
                          }
                          setIsUpdatingPassword(true);
                          try {
                            const user = auth.currentUser;
                            if (!user) throw new Error("No hay usuario autenticado.");

                            // Link credential if password provider does not exist
                            const hasPasswordProvider = user.providerData.some(p => p.providerId === "password");
                            if (!hasPasswordProvider && user.email) {
                              try {
                                const credential = EmailAuthProvider.credential(user.email, newPassword);
                                await linkWithCredential(user, credential);
                              } catch (linkErr) {
                                console.warn("Failed to link credential, falling back to updatePassword:", linkErr);
                                await updatePassword(user, newPassword);
                              }
                            } else {
                              await updatePassword(user, newPassword);
                            }

                            // Remove tempPassword from Firestore collections
                            const docRef = doc(db, "fiscalProfiles", user.uid);
                            await setDoc(docRef, { tempPassword: "" }, { merge: true });

                            try {
                              const userRef = doc(db, "users", user.uid);
                              await setDoc(userRef, { tempPassword: "" }, { merge: true });
                            } catch (uErr) {
                              console.warn("Failed to clear tempPassword in users collection:", uErr);
                            }

                            setTempPassword("");
                            toast.success("Tu contraseña ha sido guardada. Ahora puedes iniciar sesión con tu correo y esta contraseña.", "Contraseña Guardada");
                            setNewPassword("");
                            setConfirmPassword("");
                            setShowPasswordForm(false);
                          } catch (err: any) {
                            console.error("Error updating password:", err);
                            if (err.code === "auth/requires-recent-login") {
                              toast.error("Por seguridad, debes volver a iniciar sesión antes de cambiar tu contraseña.");
                            } else {
                              toast.error(err.message || "No se pudo actualizar la contraseña.");
                            }
                          } finally {
                            setIsUpdatingPassword(false);
                          }
                        }}
                        className="w-full bg-[#0B53F4] hover:bg-[#0747D1] disabled:opacity-40 text-white text-xs font-black py-2.5 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 shadow-md shadow-[#0B53F4]/10"
                      >
                        {isUpdatingPassword ? "Guardando..." : "Guardar Contraseña"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Autenticación en dos pasos switch wrapper */}
          <div className="flex items-center justify-between gap-4 py-2 border-t border-slate-100/70">
            <div className="text-left leading-tight">
              <span className="text-sm font-bold text-slate-800 block">Autenticación en Dos Pasos</span>
              <span className="text-[11px] text-slate-400 block mt-1">Protege tu cuenta con SMS o App</span>
            </div>
            {/* iOS Styled switch */}
            <button
              type="button"
              onClick={() => {
                setDosPasos(!dosPasos);
                toast.success(dosPasos ? "Doble autenticación desactivada." : "Autenticación de dos pasos configurada correctamente.", "Seguridad 2FA");
              }}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                dosPasos ? "bg-[#0B53F4]" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  dosPasos ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Dispositivos Vinculados block with nested iPhone Item */}
          <div className="space-y-2.5 pt-3 border-t border-slate-100/70 text-left">
            <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">
              Dispositivos Vinculados
            </span>

            <div className="flex items-center justify-between p-4.5 bg-[#FAF9FE] border border-slate-200/50 rounded-2xl shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#EBF1FF] rounded-full flex items-center justify-center text-[#0B53F4] shrink-0">
                  <Smartphone className="w-5.5 h-5.5 stroke-[2.2]" />
                </div>
                <div className="leading-tight text-left">
                  <span className="text-sm font-bold text-slate-800 block">{getDeviceModel().name}</span>
                  <span className="text-[10px] text-slate-400 block mt-1 font-medium">{getDeviceModel().os} - Activo ahora</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => toast.warning("La desactivación del dispositivo principal requiere re-autenticar la aplicación.", "Dispositivos")}
                className="text-[#E11D48] hover:text-rose-700 text-xs font-bold select-none cursor-pointer hover:underline bg-transparent"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM GLOBAL GUARDAR CAMBIOS ACTION BUTTON */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving}
          className="w-full bg-[#0B53F4] hover:bg-[#0747D1] disabled:opacity-50 text-white font-black text-sm py-4.5 rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-[#0B53F4]/15 active:scale-[0.98] mt-8 select-none"
        >
          <Save className="w-4.5 h-4.5 text-white stroke-[2.2]" />
          <span>{isSaving ? "Guardando..." : "Guardar Cambios"}</span>
        </button>

      </div>
    );
  }

  if (activeModal !== null) {
    return (
      <div id="subpage-form-pane" className="max-w-3xl mx-auto bg-[#F8F9FE] border border-slate-200/50 shadow-sm rounded-3xl p-5 sm:p-8 animate-fade-in_50 font-sans text-left mt-2 relative select-none">
        
        {/* TOP BAR / NAVIGATION HEADER exactly as pictured */}
        <div className="flex bg-white border-b border-slate-100 px-5 py-4 items-center justify-between sticky top-0 z-30 font-sans -mx-5 -mt-5 sm:-mx-7 sm:-mt-7 rounded-t-3xl mb-6">
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={() => setActiveModal(null)}
              className="text-[#0B53F4] hover:opacity-80 transition cursor-pointer p-1.5 focus:outline-none"
            >
              <ArrowLeft className="w-5.5 h-5.5 stroke-[2.5]" />
            </button>
            <span className="text-base font-black text-slate-900 tracking-tight">
              {activeModal === "plan" ? "Gestionar Plan" : 
               activeModal === "apariencia" ? "Apariencia" : 
               activeModal === "notificaciones" ? "Notificaciones" : 
               activeModal === "idioma" ? "Seleccionar Idioma" : 
               activeModal === "faq" ? "Preguntas Frecuentes" : 
               activeModal === "tutorial" ? "Guía Rápida" : 
               "Soporte Técnico"}
            </span>
          </div>
          <img 
            src={initialProfile?.photoURL || "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=200"} 
            alt="User thumbnail avatar" 
            className="w-10 h-10 rounded-full border border-slate-200/80 shadow-xs object-cover"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* CONTAINER CONTENT */}
        <div className="space-y-6">
          {activeModal === "plan" && (
            <div className="space-y-5">
              {/* Header Banner */}
              <div className="text-center px-2 py-1 space-y-2">
                <h2 className="text-[21px] font-black leading-tight text-slate-900 tracking-tight">
                  Lleva tu contabilidad al<br />siguiente nivel
                </h2>
                <p className="text-xs text-slate-450 font-semibold leading-relaxed max-w-xs mx-auto">
                  Automatización total en un clic. Olvídate de la carga administrativa y enfócate en crecer.
                </p>
              </div>
              <div className="bg-white border border-[#EBF1FF] rounded-2xl p-4.5 shadow-2xs space-y-4 select-none">
                <div className="flex items-center justify-between">
                  <div className="text-left leading-tight">
                    <span className="text-[9.5px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">
                      TU PLAN ACTUAL
                    </span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-base font-black text-slate-800">
                        {getPlanLabel(currentPlan)}
                      </span>
                      <span className="bg-emerald-50 text-emerald-600 border border-emerald-100 text-[8.5px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider flex items-center gap-0.5 shadow-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Activo
                      </span>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      toast.success("Mostrando tu historial de CFDI timbrados en el Buzón Activo.", "Facturas y Recibos");
                    }}
                    className="bg-[#EBF1FF] hover:bg-[#DDECFF] text-[#0B53F4] text-[11px] font-extrabold px-3.5 py-2.5 rounded-xl transition cursor-pointer"
                  >
                    Ver recibos
                  </button>
                </div>

                {/* Progress Tracking */}
                <div className="pt-3 border-t border-slate-100 space-y-2 text-left">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Consumo del ciclo:</span>
                    <span className="font-extrabold text-slate-800">
                      {cycleInvoicesCount} de {currentPlanLimit} {(currentPlanLimit as number) === 1 ? "factura" : "facturas"}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-[#0B53F4] h-1.5 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.min((cycleInvoicesCount / currentPlanLimit) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10.5px] text-slate-450 pt-1">
                    <span>Inicio de ciclo: {planStartDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <span className="font-bold text-[#0B53F4]">
                      {initialProfile?.autoRenew ? "Auto-renovacion" : "Renovacion manual"}
                    </span>
                  </div>
                </div>
              </div>

              {/* PLANS SECTIONS COLUMN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                
                {/* Plan Gratuito */}
                <div className={`bg-white dark:bg-[#0d1225]/40 border rounded-3xl p-5 shadow-[0_3px_10px_rgba(0,0,0,0.01)] relative text-left transition-all ${
                  selectedPlan === "gratuito" ? "border-2 border-[#0B53F4]" : "border-slate-200/60 dark:border-slate-800/60"
                }`}>
                  <div className="flex justify-between items-start mb-2.5">
                    <div>
                      <h4 className="text-base font-black text-slate-800 dark:text-white">Plan Gratuito</h4>
                      <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Ideal para personas físicas comenzando.</p>
                    </div>
                    <div className="text-right leading-none">
                      <span className={`text-base font-extrabold ${selectedPlan === "gratuito" ? "text-[#0B53F4]" : "text-slate-900 dark:text-white"}`}>$0</span>
                      <span className={`text-[9px] font-black block mt-1 uppercase tracking-wider ${selectedPlan === "gratuito" ? "text-[#0B53F4]" : "text-slate-400"}`}>MXN/mes</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-3 border-t border-slate-50 dark:border-slate-800/40 mb-4 flex flex-col">
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>5 facturas gratis en total</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Soporte básico</span>
                    </div>
                  </div>
                  
                  <button 
                    type="button"
                    onClick={() => {
                      setCheckoutPlanType("gratuito");
                      setSelectedCardForPlan("");
                    }}
                    className={`w-full text-xs font-black py-3 rounded-xl transition cursor-pointer text-center active:scale-98 border-2 ${
                      selectedPlan === "gratuito"
                        ? "bg-[#0B53F4] text-white border-[#0B53F4]"
                        : "bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 border-[#0B53F4] text-[#0B53F4]"
                    }`}
                  >
                    {selectedPlan === "gratuito" ? "Seleccionado" : "Elegir Gratuito"}
                  </button>
                </div>

                {/* Plan Brisa */}
                <div className={`bg-white dark:bg-[#0d1225]/40 border rounded-3xl p-5 shadow-xs relative text-left transition-all ${
                  selectedPlan === "brisa" ? "border-2 border-[#0B53F4]" : "border-slate-200/60 dark:border-slate-800/60"
                }`}>
                  <div className="flex justify-between items-start mb-2.5">
                    <div>
                      <h4 className="text-base font-black text-slate-800 dark:text-white">Plan Brisa</h4>
                      <p className="text-[11px] text-slate-455 dark:text-slate-400 font-semibold mt-0.5">Para personas con consumos bajos.</p>
                    </div>
                    <div className="text-right leading-none">
                      <span className={`text-base font-extrabold ${selectedPlan === "brisa" ? "text-[#0B53F4]" : "text-slate-900 dark:text-white"}`}>$5</span>
                      <span className={`text-[9px] font-black block mt-1 uppercase tracking-wider ${selectedPlan === "brisa" ? "text-[#0B53F4]" : "text-slate-400"}`}>MXN/mes</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-3 border-t border-slate-50 dark:border-slate-800/40 mb-4 flex flex-col">
                    <div className="flex items-center gap-2.5 text-xs font-black text-[#0B53F4]">
                      <Sparkles className="w-4 h-4 text-[#0B53F4] fill-[#0B53F4]/10 stroke-[2.2]" />
                      <span>10 facturas/mes</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Todo lo del plan Gratuito</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Historial ampliado de tickets</span>
                    </div>
                  </div>
                  
                  <button 
                    type="button"
                    onClick={() => {
                      setCheckoutPlanType("brisa");
                      setSelectedCardForPlan(cards.find(c => c.isDefault)?.id || cards[0]?.id || "stripe_wallet");
                    }}
                    className={`w-full text-xs font-black py-3 rounded-xl transition cursor-pointer text-center active:scale-98 ${
                      selectedPlan === "brisa"
                        ? "bg-[#0B53F4] text-white shadow-md shadow-[#0B53F4]/10"
                        : "bg-[#EBF1FF]/80 hover:bg-[#DDECFF] text-[#0B53F4]"
                    }`}
                  >
                    {selectedPlan === "brisa" ? "Seleccionado" : "Elegir Plan Brisa"}
                  </button>
                </div>

                {/* Plan Personal */}
                <div className={`bg-white dark:bg-[#0d1225]/40 border rounded-3xl p-5 shadow-xs relative text-left transition-all ${
                  selectedPlan === "personal" ? "border-2 border-[#0B53F4]" : "border-slate-200/60 dark:border-slate-800/60"
                }`}>
                  <div className="flex justify-between items-start mb-2.5">
                    <div>
                      <h4 className="text-base font-black text-slate-800 dark:text-white">Plan Personal</h4>
                      <p className="text-[11px] text-slate-455 dark:text-slate-400 font-semibold mt-0.5">Plan intermedio para profesionistas independientes.</p>
                    </div>
                    <div className="text-right leading-none">
                      <span className={`text-base font-extrabold ${selectedPlan === "personal" ? "text-[#0B53F4]" : "text-slate-900 dark:text-white"}`}>$150</span>
                      <span className={`text-[9px] font-black block mt-1 uppercase tracking-wider ${selectedPlan === "personal" ? "text-[#0B53F4]" : "text-slate-400"}`}>MXN/mes</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-3 border-t border-slate-50 dark:border-slate-800/40 mb-4 flex flex-col">
                    <div className="flex items-center gap-2.5 text-xs font-black text-[#0B53F4]">
                      <Sparkles className="w-4 h-4 text-[#0B53F4] fill-[#0B53F4]/10 stroke-[2.2]" />
                      <span>20 facturas/mes</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Todo lo del plan Brisa</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Soporte prioritario</span>
                    </div>
                  </div>
                  
                  <button 
                    type="button"
                    onClick={() => {
                      setCheckoutPlanType("personal");
                      setSelectedCardForPlan(cards.find(c => c.isDefault)?.id || cards[0]?.id || "stripe_wallet");
                    }}
                    className={`w-full text-xs font-black py-3 rounded-xl transition cursor-pointer text-center active:scale-98 ${
                      selectedPlan === "personal"
                        ? "bg-[#0B53F4] text-white shadow-md shadow-[#0B53F4]/10"
                        : "bg-[#EBF1FF]/80 hover:bg-[#DDECFF] text-[#0B53F4]"
                    }`}
                  >
                    {selectedPlan === "personal" ? "Seleccionado" : "Elegir Personal"}
                  </button>
                </div>

                {/* Plan Serenidad (RECOMMENDED) */}
                <div className={`bg-white dark:bg-[#0d1225]/40 border rounded-3xl p-5 shadow-xs relative text-left overflow-visible transition-all ${
                  selectedPlan === "serenidad" ? "border-2 border-[#0B53F4]" : "border-slate-200/60 dark:border-slate-800/60"
                }`}>
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#0B53F4] text-white text-[8.5px] uppercase font-black px-4 py-1 rounded-full tracking-widest shadow-sm select-none z-10">
                    RECOMENDADO
                  </div>
                  
                  <div className="flex justify-between items-start mb-2.5 mt-0.5">
                    <div>
                      <h4 className="text-base font-black text-slate-800 dark:text-white">Plan Serenidad</h4>
                      <p className="text-[11px] text-slate-455 dark:text-slate-400 font-semibold mt-0.5">El plan recomendado para uso constante.</p>
                    </div>
                    <div className="text-right leading-none">
                      <span className={`text-base font-extrabold ${selectedPlan === "serenidad" ? "text-[#0B53F4]" : "text-slate-900 dark:text-white"}`}>$250</span>
                      <span className={`text-[9px] font-black block mt-1 uppercase tracking-wider ${selectedPlan === "serenidad" ? "text-[#0B53F4]" : "text-slate-400"}`}>MXN/mes</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-3 border-t border-slate-50 dark:border-slate-800/40 mb-4 flex flex-col">
                    <div className="flex items-center gap-2.5 text-xs font-black text-[#0B53F4]">
                      <Sparkles className="w-4 h-4 text-[#0B53F4] fill-[#0B53F4]/10 stroke-[2.2]" />
                      <span>30 facturas/mes</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Todo lo del plan Brisa</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Panel de gastos y resumen</span>
                    </div>
                  </div>
                  
                  <button 
                    type="button"
                    onClick={() => {
                      setCheckoutPlanType("serenidad");
                      setSelectedCardForPlan(cards.find(c => c.isDefault)?.id || cards[0]?.id || "stripe_wallet");
                    }}
                    className={`w-full text-xs font-black py-3 rounded-xl transition cursor-pointer text-center active:scale-98 ${
                      selectedPlan === "serenidad"
                        ? "bg-[#0B53F4] text-white shadow-md shadow-[#0B53F4]/10 animate-bounce"
                        : "bg-[#EBF1FF]/80 hover:bg-[#DDECFF] text-[#0B53F4]"
                    }`}
                  >
                    {selectedPlan === "serenidad" ? "Seleccionado" : "Elegir Serenidad"}
                  </button>
                </div>

                {/* Plan Empresa */}
                <div className={`bg-white dark:bg-[#0d1225]/40 border rounded-3xl p-5 shadow-xs relative text-left transition-all ${
                  selectedPlan === "empresa" ? "border-2 border-[#0B53F4]" : "border-slate-200/60 dark:border-slate-800/60"
                }`}>
                  <div className="flex justify-between items-start mb-2.5">
                    <div>
                      <h4 className="text-base font-black text-slate-800 dark:text-white">Plan Empresa</h4>
                      <p className="text-[11px] text-slate-455 dark:text-slate-400 font-semibold mt-0.5">Diseñado para pequeñas y medianas empresas.</p>
                    </div>
                    <div className="text-right leading-none">
                      <span className={`text-base font-extrabold ${selectedPlan === "empresa" ? "text-[#0B53F4]" : "text-slate-900 dark:text-white"}`}>$300</span>
                      <span className={`text-[9px] font-black block mt-1 uppercase tracking-wider ${selectedPlan === "empresa" ? "text-[#0B53F4]" : "text-slate-400"}`}>MXN/mes</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-3 border-t border-slate-50 dark:border-slate-800/40 mb-4 flex flex-col">
                    <div className="flex items-center gap-2.5 text-xs font-black text-[#0B53F4]">
                      <Sparkles className="w-4 h-4 text-[#0B53F4] fill-[#0B53F4]/10 stroke-[2.2]" />
                      <span>60 facturas/mes</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Todo lo del plan Serenidad</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Multi-RFC y descargas masivas</span>
                    </div>
                  </div>
                  
                  <button 
                    type="button"
                    onClick={() => {
                      setCheckoutPlanType("empresa");
                      setSelectedCardForPlan(cards.find(c => c.isDefault)?.id || cards[0]?.id || "stripe_wallet");
                    }}
                    className={`w-full text-xs font-black py-3 rounded-xl transition cursor-pointer text-center active:scale-98 ${
                      selectedPlan === "empresa"
                        ? "bg-[#0B53F4] text-white shadow-md shadow-[#0B53F4]/10"
                        : "bg-[#EBF1FF]/80 hover:bg-[#DDECFF] text-[#0B53F4]"
                    }`}
                  >
                    {selectedPlan === "empresa" ? "Seleccionado" : "Elegir Empresa"}
                  </button>
                </div>

                {/* Plan Nirvana */}
                <div className={`bg-white dark:bg-[#0d1225]/40 border rounded-3xl p-5 shadow-xs relative text-left transition-all ${
                  selectedPlan === "nirvana" ? "border-2 border-[#0B53F4]" : "border-slate-200/60 dark:border-slate-800/60"
                }`}>
                  <div className="flex justify-between items-start mb-2.5">
                    <div>
                      <h4 className="text-base font-black text-slate-800 dark:text-white">Plan Nirvana</h4>
                      <p className="text-[11px] text-slate-455 dark:text-slate-400 font-semibold mt-0.5">Para alto volumen de facturación.</p>
                    </div>
                    <div className="text-right leading-none">
                      <span className={`text-base font-extrabold ${selectedPlan === "nirvana" ? "text-[#0B53F4]" : "text-slate-900 dark:text-white"}`}>$500</span>
                      <span className={`text-[9px] font-black block mt-1 uppercase tracking-wider ${selectedPlan === "nirvana" ? "text-[#0B53F4]" : "text-slate-400"}`}>MXN/mes</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2 pt-3 border-t border-slate-50 dark:border-slate-800/40 mb-4 flex flex-col">
                    <div className="flex items-center gap-2.5 text-xs font-black text-[#0B53F4]">
                      <Sparkles className="w-4 h-4 text-[#0B53F4] fill-[#0B53F4]/10 stroke-[2.2]" />
                      <span>100 facturas/mes</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Todo lo del plan Serenidad</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-bold text-slate-650 dark:text-slate-350">
                      <Check className="w-4 h-4 text-[#0B53F4] stroke-[3.5]" />
                      <span>Acceso completo a conectores</span>
                    </div>
                  </div>
                  
                  <button 
                    type="button"
                    onClick={() => {
                      setCheckoutPlanType("nirvana");
                      setSelectedCardForPlan(cards.find(c => c.isDefault)?.id || cards[0]?.id || "stripe_wallet");
                    }}
                    className={`w-full text-xs font-black py-3 rounded-xl transition cursor-pointer text-center active:scale-98 ${
                      selectedPlan === "nirvana"
                        ? "bg-[#0B53F4] text-white shadow-md shadow-[#0B53F4]/10"
                        : "bg-[#EBF1FF]/80 hover:bg-[#DDECFF] text-[#0B53F4]"
                    }`}
                  >
                    {selectedPlan === "nirvana" ? "Seleccionado" : "Elegir Nirvana"}
                  </button>
                </div>

                {/* Botón flotante inferior para confirmar cambio de plan */}
                <div className="pt-6 border-t border-slate-100 flex justify-center gap-3 select-none">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                    }}
                    className="px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition cursor-pointer text-xs"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      toast.success(`Plan seleccionado: ${getPlanLabel(checkoutPlanType || "gratuito")}. Completa el pago en tu cuenta para activarlo.`, "Plan Elegido");
                    }}
                    className="px-8 py-3.5 bg-[#0B53F4] hover:bg-[#0747D1] text-white font-black rounded-2xl transition shadow-md shadow-[#0B53F4]/10 cursor-pointer text-xs active:scale-[0.98]"
                  >
                    Cambiar Plan
                  </button>
                </div>

              </div>
            </div>
          )}

          {activeModal === "apariencia" && (
            <div className="space-y-6 text-left">
              {/* Theme Choice Segment */}
              <div className="space-y-2.5">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1">
                  Selecciona el Tema
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: "light", label: "Claro", icon: Palette },
                    { id: "dark", label: "Oscuro", icon: Palette },
                    { id: "system", label: "Sistema", icon: Sliders }
                  ].map((item) => {
                    const isActive = themeChoice === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setThemeChoice(item.id as "light" | "dark" | "system");
                          toast.success(`Estilo visual ${item.label} seleccionado exitosamente.`, "Configuración Guardada");
                        }}
                        className={`flex flex-col items-center justify-center p-4 rounded-2xl transition cursor-pointer border-2 text-center select-none active:scale-95 ${
                          isActive 
                            ? "bg-[#EBF1FF] border-[#0B53F4] text-[#0B53F4]" 
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-55"
                        }`}
                      >
                        <item.icon className="w-5 h-5 mb-1.5" />
                        <span className="text-xs font-extrabold">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Size Selector */}
              <div className="space-y-2.5 pt-4 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1">
                  Tamaño de la Fuente (In-App)
                </label>
                <div className="flex gap-2.5">
                  {[
                    { id: "small", label: "Chico" },
                    { id: "medium", label: "Estándar" },
                    { id: "large", label: "Grande" }
                  ].map((item) => {
                    const isActive = fontSizeChoice === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setFontSizeChoice(item.id as "small" | "medium" | "large");
                          toast.success(`Escala tipográfica fijada en ${item.label}.`, "Configuración Guardada");
                        }}
                        className={`flex-1 py-3.5 text-xs font-black rounded-2xl transition cursor-pointer border ${
                          isActive 
                            ? "bg-[#EBF1FF] border-[#0B53F4] text-[#0B53F4]" 
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-55"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Border Radius */}
              <div className="space-y-2.5 pt-4 border-t border-slate-100">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1">
                  Redondeado de Tarjetas
                </label>
                <div className="flex gap-2.5">
                  {[
                    { id: "compact", label: "Compacto" },
                    { id: "standard", label: "Estándar" },
                    { id: "extra", label: "Extra" }
                  ].map((item) => {
                    const isActive = borderRadiusChoice === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setBorderRadiusChoice(item.id as "compact" | "standard" | "extra");
                          toast.success(`Redondeado visual fijado en ${item.label}.`, "Configuración Guardada");
                        }}
                        className={`flex-1 py-3.5 text-xs font-black rounded-2xl transition cursor-pointer border ${
                          isActive 
                            ? "bg-[#EBF1FF] border-[#0B53F4] text-[#0B53F4]" 
                            : "bg-white border-slate-200 text-slate-600 hover:bg-slate-55"
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Save Action */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem("zenticket_theme", themeChoice);
                    localStorage.setItem("zenticket_font_size", fontSizeChoice);
                    localStorage.setItem("zenticket_border_radius", borderRadiusChoice);
                    setActiveModal(null);
                    toast.success("Las preferencias estéticas se guardaron en la memoria persistente local y se aplicaron.", "Apariencia");
                  }}
                  className="w-full py-4.5 bg-[#0B53F4] hover:bg-[#0747D1] text-white text-sm font-black rounded-2xl transition shadow-md shadow-[#0B53F4]/10 cursor-pointer text-center active:scale-98"
                >
                  Confirmar y Aplicar
                </button>
              </div>
            </div>
          )}

          {activeModal === "notificaciones" && (
            <div className="space-y-5 text-left">
              <p className="text-xs text-slate-455 font-bold ml-1 mb-3">
                Establece qué actividades emitirán notificaciones automáticas inmediatas e informes consolidados.
              </p>

              <div className="bg-white border border-slate-200/50 rounded-3xl overflow-hidden divide-y divide-slate-100">
                {/* Switch Row Item 1 */}
                <div className="flex items-center justify-between p-4.5">
                  <div className="text-left leading-tight pr-3">
                    <span className="text-sm font-bold text-slate-800 block">Nuevas Facturas Descargadas</span>
                    <span className="text-[11px] text-slate-400 block mt-1">Avisar inmediatamente al timbrar nuevos folios</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifInvoices(!notifInvoices)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      notifInvoices ? "bg-[#0B53F4]" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        notifInvoices ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Switch Row Item 2 */}
                <div className="flex items-center justify-between p-4.5">
                  <div className="text-left leading-tight pr-3">
                    <span className="text-sm font-bold text-slate-800 block">Alertas de Conectores</span>
                    <span className="text-[11px] text-slate-400 block mt-1">Desconexiones técnicas o peticiones de CAPTCHA del SAT</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifConnectors(!notifConnectors)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      notifConnectors ? "bg-[#0B53F4]" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        notifConnectors ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Switch Row Item 3 */}
                <div className="flex items-center justify-between p-4.5">
                  <div className="text-left leading-tight pr-3">
                    <span className="text-sm font-bold text-slate-800 block">Resumen Diario Consolidado</span>
                    <span className="text-[11px] text-slate-400 block mt-1">Envío por correo de movimientos contables clave del día</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotifEmailDaily(!notifEmailDaily)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      notifEmailDaily ? "bg-[#0B53F4]" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        notifEmailDaily ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    toast.success("Notificaciones programadas de forma satisfactoria.", "Configuración Guardada");
                  }}
                  className="w-full py-4.5 bg-[#0B53F4] hover:bg-[#0747D1] text-white text-sm font-black rounded-2xl transition shadow-md shadow-[#0B53F4]/10 cursor-pointer text-center active:scale-98"
                >
                  Guardar Ajustes
                </button>
              </div>
            </div>
          )}

          {activeModal === "idioma" && (
            <div className="space-y-4 text-left">
              <p className="text-xs text-slate-455 font-bold ml-1 mb-3">
                Establece el idioma nativo para la interfaz de ZenTicket, correos informativos y exportaciones contables.
              </p>

              <div className="bg-white border border-slate-200/50 rounded-3xl overflow-hidden divide-y divide-slate-100">
                {[
                  { id: "es-MX", label: "Espanol (America Latina)", flag: "MX" },
                  { id: "en-US", label: "English (United States)", flag: "US" },
                  { id: "pt-BR", label: "Portugues (Brasil)", flag: "BR" }
                ].map((item) => {
                  const isSelected = languageChoice === item.id;
                  return (
                    <div 
                      key={item.id}
                      onClick={() => {
                        setLanguageChoice(item.id);
                        toast.success(`Idioma cambiado a ${item.label}`, "Cambio Aplicado");
                      }}
                      className="flex items-center justify-between p-4.5 hover:bg-slate-50 transition cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl shrink-0">{item.flag}</span>
                        <span className="text-sm font-bold text-slate-700">{item.label}</span>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                        isSelected ? "border-[#0B53F4] bg-[#0B53F4]/10" : "border-slate-300"
                      }`}>
                        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#0B53F4]" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-full py-4.5 bg-[#0B53F4] hover:bg-[#0747D1] text-white text-sm font-black rounded-2xl transition shadow-md shadow-[#0B53F4]/15 cursor-pointer text-center active:scale-98"
                >
                  Confirmar Idioma
                </button>
              </div>
            </div>
          )}

          {activeModal === "faq" && (
            <div className="space-y-4 text-left">
              <p className="text-xs text-slate-455 font-bold ml-1 mb-2">
                ¿Tienes dudas sobre los procesos fiscales o el timbrado automático del SAT? Consulta nuestro manual guiado inmediato.
              </p>

              <div className="space-y-3">
                {[
                  {
                    q: "¿Cómo se descargan automáticamente las facturas?",
                    a: "ZenTicket se conecta a las APIs privadas del SAT y de tus proveedores de forma cifrada mediante tokens seguros, leyendo tus CFDI emitidos y recibidos de inmediato cada vez que se emiten."
                  },
                  {
                    q: "¿El timbrado consume saldo secundario de timbrado?",
                    a: "No. Con ZenTicket tienes timbrados directos cubiertos integralmente en tus facturas periódicas de acuerdo a los límites autorizados en tu suscripción mensual."
                  },
                  {
                    q: "¿Qué sucede si un ticket de comercio falla en el reconocimiento?",
                    a: "Nuestra IA OCR inteligente cuenta con tolerancia y reintentos automáticos. Si un ticket es de baja calidad o tiene datos ambiguos, se enviará de inmediato al Buzón de Espera para un ajuste manual visual rápido."
                  },
                  {
                    q: "¿Es seguro resguardar mis sellos fiscales CSD?",
                    a: "Totalmente. Los Certificados de Sello Digital (CSD) y credenciales CIEC se almacenan y resguardan bajo encriptación de estándar bancario militar AES-256 en reposo, garantizando el máximo nivel de cumplimiento y confidencialidad."
                  }
                ].map((item, index) => {
                  const isOpen = openFaqIndex === index;
                  return (
                    <div 
                      key={index}
                      className="bg-white border border-slate-100 rounded-2xl p-4.5 shadow-5xs transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? -1 : index)}
                        className="w-full flex items-center justify-between text-left focus:outline-none bg-transparent border-none outline-none cursor-pointer"
                      >
                        <span className="text-xs font-black text-slate-800 pr-4">{item.q}</span>
                        <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-90 text-[#0B53F4]" : ""}`} />
                      </button>
                      
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1, marginTop: 12 }}
                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                            className="overflow-hidden"
                          >
                            <p className="text-[11.5px] text-slate-500 font-medium leading-relaxed border-t border-slate-50 pt-3">
                              {item.a}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black rounded-2xl transition cursor-pointer text-center"
                >
                  Cerrar Glosario
                </button>
              </div>
            </div>
          )}

          {activeModal === "tutorial" && (
            <div className="space-y-6 text-center">
              {/* Slides Panel */}
              <div className="py-4.5 px-3 flex flex-col items-center justify-center">
                {tutorialStep === 0 && (
                  <motion.div 
                    key="step0"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    <div className="w-18 h-18 rounded-3xl bg-[#EBF1FF] text-[#0B53F4] flex items-center justify-center mx-auto shadow-md shadow-[#0B53F4]/10">
                      <Plus className="w-9 h-9 stroke-[2.2]" />
                    </div>
                    <h3 className="text-lg font-black text-slate-850">1. Sube tus Tickets</h3>
                    <p className="text-xs text-slate-450 font-bold max-w-xs mx-auto leading-relaxed">
                      Carga una foto de tu ticket de compra o arrastra el archivo. Nuestro procesador OCR leerá automáticamente la fecha, emisor, RFC e importe desglosado en un par de segundos.
                    </p>
                  </motion.div>
                )}

                {tutorialStep === 1 && (
                  <motion.div 
                    key="step1"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    <div className="w-18 h-18 rounded-3xl bg-[#EBF1FF] text-[#0B53F4] flex items-center justify-center mx-auto shadow-md shadow-[#0B53F4]/10">
                      <Sliders className="w-8 h-8 stroke-[2.2]" />
                    </div>
                    <h3 className="text-lg font-black text-slate-850">2. Activa tus Conectores</h3>
                    <p className="text-xs text-slate-450 font-bold max-w-xs mx-auto leading-relaxed">
                      Vincula ZenTicket con tus servicios recurrentes preferidos (Uber, Didi, Starbucks) para que descargue tus CFDI sin que tengas que acceder a cada portal uno a uno.
                    </p>
                  </motion.div>
                )}

                {tutorialStep === 2 && (
                  <motion.div 
                    key="step2"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-4"
                  >
                    <div className="w-18 h-18 rounded-3xl bg-[#EBF1FF] text-[#0B53F4] flex items-center justify-center mx-auto shadow-md shadow-[#0B53F4]/10">
                      <Sparkles className="w-8 h-8 fill-[#0B53F4]/10 stroke-[2.2]" />
                    </div>
                    <h3 className="text-lg font-black text-slate-855">3. Genera tus CFDI SAT</h3>
                    <p className="text-xs text-slate-450 font-bold max-w-xs mx-auto leading-relaxed">
                      Una vez validados, ZenTicket timbra tus CFDIs oficiales bajo las últimas normativas fiscales de Facturación 4.0 del SAT y los deposita directamente en tu nube.
                    </p>
                  </motion.div>
                )}
              </div>

              {/* Stepper Dots Indicator */}
              <div className="flex items-center justify-center gap-1.5">
                {[0, 1, 2].map((dot) => (
                  <div 
                    key={dot}
                    className={`h-2 rounded-full transition-all duration-200 ${
                      tutorialStep === dot ? "w-6 bg-[#0B53F4]" : "w-2 bg-slate-200"
                    }`}
                  />
                ))}
              </div>

              {/* Stepper Buttons */}
              <div className="flex gap-3 pt-3 border-t border-slate-100">
                {tutorialStep > 0 ? (
                  <button
                    type="button"
                    onClick={() => setTutorialStep(tutorialStep - 1)}
                    className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-black rounded-xl transition cursor-pointer"
                  >
                    Anterior
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-500 hover:bg-slate-55 text-xs font-black rounded-xl transition cursor-pointer"
                  >
                    Omitir
                  </button>
                )}

                {tutorialStep < 2 ? (
                  <button
                    type="button"
                    onClick={() => setTutorialStep(tutorialStep + 1)}
                    className="flex-1 py-3.5 bg-[#0B53F4] text-white text-xs font-black rounded-xl transition hover:bg-[#0747D1] cursor-pointer"
                  >
                    Siguiente
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      toast.success("¡Bienvenido al sistema! Ahora estás capacitado para utilizar ZenTicket.", "Guía Completada");
                    }}
                    className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition cursor-pointer shadow-md shadow-emerald-500/10"
                  >
                    ¡Comenzar!
                  </button>
                )}
              </div>
            </div>
          )}

          {activeModal === "soporte" && (
            <div className="space-y-4 text-left">
              <p className="text-xs text-slate-450 font-bold ml-1 mb-2">
                Si tienes problemas con la autenticación CIEC SAT, facturas rechazadas o descargas, envía un reporte directo a nuestros ingenieros de guardia.
              </p>

              <div className="space-y-3.5">
                {/* Subject Selection */}
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Categoría del Incidente
                  </label>
                  <select 
                    value={supportSubject}
                    onChange={(e) => setSupportSubject(e.target.value)}
                    className="w-full text-xs font-bold bg-white border border-slate-200/80 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-xl px-3.5 py-3 text-slate-800 focus:outline-none transition-all cursor-pointer"
                  >
                    <option value="error_conector">Error con Conectores (Didi/Uber/Starbucks)</option>
                    <option value="duda_sat">Problema de Timbrado SAT Facturación 4.0</option>
                    <option value="billing">Dudas de Facturación y Planes de Pago</option>
                    <option value="ocr_problem">Error de Escáneo / Lectura OCR Ticket</option>
                  </select>
                </div>

                {/* Correo Electrónico de contacto */}
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Correo Electrónico de Respuesta
                  </label>
                  <input 
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder="tu-correo@empresa.com"
                    className="w-full text-xs font-medium bg-white border border-slate-200/80 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-xl px-3.5 py-3 text-slate-800 focus:outline-none transition-all placeholder-slate-400"
                  />
                </div>

                {/* Text area message description */}
                <div className="space-y-1">
                  <label className="block text-[10.5px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Descripción Detallada
                  </label>
                  <textarea 
                    rows={4}
                    value={supportMessage}
                    onChange={(e) => setSupportMessage(e.target.value)}
                    placeholder="Describe qué conector falló o el folio del ticket con error..."
                    className="w-full text-xs font-medium bg-white border border-slate-200/80 focus:border-[#0B53F4] focus:ring-1 focus:ring-[#0B53F4]/20 rounded-xl px-4 py-3 text-slate-800 focus:outline-none transition-all placeholder-slate-400 resize-none"
                  />
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!supportMessage.trim()) {
                      toast.error("Por favor complete la descripción de su incidente técnico.", "Falta Información");
                      return;
                    }
                    setActiveModal(null);
                    toast.success("Tu ticket de soporte #FBT-9428 se ha emitido correctamente. Nos pondremos en contacto contigo en un plazo menor a 15 minutos.", "Solicitud Registrada");
                  }}
                  className="w-full py-4 bg-[#0B53F4] hover:bg-[#0747D1] text-white text-xs font-black rounded-2xl transition flex items-center justify-center gap-1.5 shadow-md shadow-[#0B53F4]/10 cursor-pointer text-center active:scale-98"
                >
                  <MessageSquare className="w-4 h-4 text-white" />
                  <span>Enviar a Soporte Técnico</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="account-tab-dashboard" className="max-w-6xl mx-auto space-y-8 font-body text-left animate-fade-in_50 pb-8 select-none">
      
      {!isProfileComplete && (
        <div className="bg-gradient-to-tr from-rose-50 to-amber-50 border border-rose-200/80 rounded-2xl p-6 text-left flex items-start gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0 shadow-2xs">
            <AlertCircle className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-black text-rose-800 uppercase tracking-widest leading-none mb-1 shadow-2xs">
              CONFIGURACION FISCAL MANDATORIA REQUERIDA
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed font-semibold">
              Tu cuenta se encuentra en estado inactivo. Es mandatorio completar el registro de tus datos fiscales oficiales de contribuyente (RFC, Razón Social, Régimen y Código Postal) para poder digitalizar tickets de compra y solicitar facturaciones.
            </p>
            <button
              onClick={() => setIsEditingFiscal(true)}
              className="mt-3 bg-rose-600 hover:bg-rose-700 text-white text-[10.5px] font-black px-4.5 py-2.5 rounded-xl uppercase tracking-wider transition cursor-pointer inline-flex items-center gap-1.5 focus:outline-none"
            >
              Completar Datos Fiscales Ahora
            </button>
          </div>
        </div>
      )}

      {initialProfile?.navigationDisabled && (
        <div className="bg-gradient-to-tr from-amber-50/70 to-blue-50/70 border border-amber-200/70 rounded-2xl p-6 text-left flex items-start gap-4 shadow-sm animate-fade-in_50">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0 shadow-2xs">
            <Lock className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-black text-amber-800 uppercase tracking-widest leading-none mb-1">
              NAVEGACION DESACTIVADA (MANDATO FISCAL)
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed font-semibold">
              Has guardado los datos fiscales válidos. Con el fin de cumplir con el flujo restringido de ZenTicket, todas las opciones de navegación del panel lateral y del menú móvil han sido completamente bloqueadas de manera permanente.
            </p>
            <button
              onClick={async () => {
                try {
                  await onSave({
                    ...initialProfile,
                    navigationDisabled: false
                  });
                  toast.success("Navegación reactivada con éxito. Ya puedes volver a usar los menús del panel.", "Pruebas Habilitadas");
                } catch (e) {
                  toast.error("Ocurrió un error al intentar activar la navegación.");
                }
              }}
              className="mt-3 bg-[#0B53F4] hover:bg-[#0747D1] text-white text-[10.5px] font-black px-4.5 py-2.5 rounded-xl uppercase tracking-wider transition cursor-pointer inline-flex items-center gap-1.5 focus:outline-none"
            >
              Volver a activar navegacion (Desbloquear)
            </button>
          </div>
        </div>
      )}

      {/* Container layout stacked in a single, clean column */}
      <div className="max-w-2xl mx-auto space-y-6">
          {/* 1. Profile card with larger rounded border andJD Avatar */}
      <div className="bg-white border border-slate-200/40 rounded-3xl p-5 shadow-sm flex items-center justify-between font-body">
        <div className="flex items-center gap-4">
          {/* Blue initials circular emblem */}
          <div className="w-14 h-14 rounded-full bg-[#0B53F4] flex items-center justify-center text-white text-lg font-bold font-display tracking-wide shrink-0 shadow-sm shadow-[#0B53F4]/15">
            {userInitials}
          </div>
          <div className="leading-tight text-left">
            <h4 className="font-display font-extrabold text-base text-slate-800">
              {userFullName}
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              {userDisplayEmail}
            </p>
          </div>
        </div>

        {/* Edit Button styled Indigo like screenshot */}
        <button
          onClick={() => setIsEditingFiscal(true)}
          className="bg-[#ebf1ff] hover:bg-[#dee8ff] text-[#0B53F4] text-xs font-bold px-4 py-2 rounded-xl transition active:scale-[0.98] cursor-pointer"
        >
          Editar
        </button>
      </div>

      {/* 2. SUSCRIPCION Header & Detail Panel */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between select-none">
          <span className="text-[11px] font-extrabold text-[#0B53F4]/80 uppercase tracking-widest font-display">
            Suscripción
          </span>
        </div>

        <div className="bg-white border border-slate-200/40 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between">
            <div className="text-left font-body">
              <div className="flex items-center gap-2">
                <span className="font-display font-extrabold text-sm text-slate-800 capitalize">
                  {getPlanLabel(selectedPlan)}
                </span>
                <span className={`text-[9.5px] uppercase font-black px-2 py-0.5 rounded-md tracking-wider leading-none ${checkoutPlanType !== null ? "bg-amber-100 text-amber-700" : "bg-[#ebf1ff] text-[#0B53F4]"}`}>
                  {checkoutPlanType !== null ? "Por pagar" : "Activo"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {checkoutPlanType !== null 
                  ? "Elegiste este plan. Por favor, confirma el pago abajo para activarlo." 
                  : (currentPlan === "gratuito" ? "Plan de prueba permanente" : `Facturado mensual - Prox: ${new Date(planStartDate.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`)}
              </p>
            </div>
            {/* Amount details */}
            <div className="text-right flex items-baseline gap-1">
              <span className="text-lg font-mono font-extrabold text-slate-800">
                {getPlanPrice(selectedPlan)}
              </span>
              <span className="text-[10px] text-slate-400 font-bold font-display">/mes<br/><span className="text-[8px] tracking-wide block text-right">(MXN)</span></span>
            </div>
          </div>

          {/* Usage with progress bar */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-450 font-extrabold font-display">Uso del Ciclo</span>
              <span className="text-[#0B53F4] font-mono font-black">{cycleInvoicesCount} de {checkoutPlanType !== null ? (selectedPlan === "nirvana" ? 100 : selectedPlan === "empresa" ? 60 : selectedPlan === "serenidad" ? 30 : selectedPlan === "personal" ? 20 : selectedPlan === "brisa" ? 10 : 5) : currentPlanLimit} Facturas</span>
            </div>
            <div className="w-full bg-[#EBF1FF] rounded-full h-2 overflow-hidden">
              <div 
                className="bg-[#0B53F4] h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min((cycleInvoicesCount / (checkoutPlanType !== null ? (selectedPlan === "nirvana" ? 100 : selectedPlan === "empresa" ? 60 : selectedPlan === "serenidad" ? 30 : selectedPlan === "personal" ? 20 : selectedPlan === "brisa" ? 10 : 5) : currentPlanLimit)) * 100, 105)}%` }}
              />
            </div>
          </div>

          {/* Action button */}
          <button 
            onClick={() => {
              setActiveModal("plan");
            }}
            className="w-full zt-btn-primary hover:transform-none text-white text-xs font-bold py-3.5 rounded-full transition flex items-center justify-center gap-1.5 shadow-md shadow-[#0B53F4]/15 cursor-pointer active:scale-[0.98]"
          >
            <span>Gestionar Plan</span>
          </button>
        </div>
      </div>

        {/* 3. MÉTODOS DE PAGO */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between select-none">
            <span className="text-[11px] font-extrabold text-[#0B53F4]/80 uppercase tracking-widest font-display">
              Métodos de pago
            </span>
            <span className="flex items-center gap-1 bg-emerald-50 text-emerald-600 border border-emerald-100 text-[8.5px] uppercase font-black px-2 py-0.5 rounded-full tracking-wider shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Stripe vinculado
            </span>
          </div>

          {renderCheckoutSection()}
        </div>



      <div className="pt-2">
              {/* 4. CONFIGURACION Header & Options List with interactive components */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                  Configuración
                </span>
        
                <div className="bg-white border border-slate-200/50 rounded-3xl overflow-hidden divide-y divide-slate-100 shadow-[0_4px_20px_rgba(15,23,42,0.02)]">
                  
                  {/* Item #1: Apariencia */}
                  <div 
                    onClick={() => setActiveModal("apariencia")}
                    className="flex items-center justify-between p-4.5 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-full bg-[#ebf1ff] flex items-center justify-center text-[#0B53F4]">
                        <Palette className="w-5 h-5 stroke-[2]" />
                      </div>
                      <span className="text-sm font-bold text-slate-800">Apariencia</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400 font-bold">
                        {themeChoice === "light" ? "Claro" : themeChoice === "dark" ? "Oscuro" : "Sistema"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-350" />
                    </div>
                  </div>
        
                  {/* Item #2: Notificaciones */}
                  <div 
                    onClick={() => setActiveModal("notificaciones")}
                    className="flex items-center justify-between p-4.5 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-full bg-[#ebf1ff] flex items-center justify-center text-[#0B53F4]">
                        <Bell className="w-5 h-5 stroke-[2]" />
                      </div>
                      <span className="text-sm font-bold text-slate-800">Notificaciones</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-350" />
                  </div>
        
                  {/* Item #3: Idioma */}
                  <div 
                    onClick={() => setActiveModal("idioma")}
                    className="flex items-center justify-between p-4.5 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-full bg-[#ebf1ff] flex items-center justify-center text-[#0B53F4]">
                        <Globe className="w-5 h-5 stroke-[2]" />
                      </div>
                      <span className="text-sm font-bold text-slate-800">Idioma</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-400 font-bold">
                        {languageChoice === "es-MX" ? "Espanol (MX)" : languageChoice === "en-US" ? "English (US)" : "Portugues (BR)"}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-350" />
                    </div>
                  </div>
        
        
        
                  {/* Item #4: Seguridad y Privacidad -> triggers editable Form! */}
                  <div 
                    onClick={() => setIsEditingFiscal(true)}
                    className="flex items-center justify-between p-4.5 hover:bg-slate-55 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-full bg-[#ebf1ff] flex items-center justify-center text-[#0B53F4]">
                        <Shield className="w-5 h-5 stroke-[2]" />
                      </div>
                      <div className="text-left leading-tight">
                        <span className="text-sm font-bold text-slate-800 block">Datos Fiscales (SAT)</span>
                        <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">Seguridad y timbrado CFDI v4.0</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#0B53F4]" />
                  </div>
                </div>
      </div>
      </div>




      </div>

      {/* 5. AYUDA Header & Columns */}
      <div className="space-y-2.5">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
          Ayuda
        </span>

        <div className="grid grid-cols-3 gap-3">
          {/* FAQ */}
          <div 
            onClick={() => { setActiveModal("faq"); setOpenFaqIndex(-1); }}
            className="bg-white border border-slate-200/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 hover:bg-slate-50 transition text-center shadow-[0_4px_20px_rgba(15,23,42,0.02)] py-5 cursor-pointer active:scale-95"
          >
            <div className="w-10 h-10 rounded-full bg-[#ebf1ff] flex items-center justify-center text-[#0B53F4]">
              <HelpCircle className="w-5.5 h-5.5 stroke-[2.5]" />
            </div>
            <span className="text-xs font-black text-slate-800 tracking-tight">FAQ</span>
          </div>

          {/* Tutoriales */}
          <div 
            onClick={() => { setActiveModal("tutorial"); setTutorialStep(0); }}
            className="bg-white border border-slate-200/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 hover:bg-slate-50 transition text-center shadow-[0_4px_20px_rgba(15,23,42,0.02)] py-5 cursor-pointer active:scale-95"
          >
            <div className="w-10 h-10 rounded-full bg-[#ebf1ff] flex items-center justify-center text-[#0B53F4]">
              <BookOpen className="w-5.5 h-5.5 stroke-[2.5]" />
            </div>
            <span className="text-xs font-black text-slate-800 tracking-tight">Tutoriales</span>
          </div>

          {/* Soporte */}
          <div 
            onClick={() => { setActiveModal("soporte"); setSupportSubject("error_conector"); setSupportMessage(""); setSupportEmail(currentUser?.email || sessionEmail || ""); }}
            className="bg-white border border-slate-200/50 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 hover:bg-slate-50 transition text-center shadow-[0_4px_20px_rgba(15,23,42,0.02)] py-5 cursor-pointer active:scale-95"
          >
            <div className="w-10 h-10 rounded-full bg-[#ebf1ff] flex items-center justify-center text-[#0B53F4]">
              <MessageSquare className="w-5.5 h-5.5 stroke-[2.5]" />
            </div>
            <span className="text-xs font-black text-slate-800 tracking-tight">Soporte</span>
          </div>
        </div>
      </div>

      {/* 6. Cerrar Sesión & Eliminar Cuenta buttons */}
      <div className="space-y-4 pt-4">
        {/* White prominent border Cerrar Sesión */}
        <button
          onClick={handleLogout}
          className="w-full py-4 bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 text-[#0B53F4] font-black text-sm rounded-2xl flex items-center justify-center gap-2 transition duration-150 active:scale-[0.98] shadow-2xs cursor-pointer border-none"
        >
          <LogOut className="w-4 h-4 text-slate-500" />
          <span>Cerrar Sesión</span>
        </button>

        {showDeleteConfirm ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-3.5 text-left animate-fade-in">
            <h4 className="text-xs font-black text-rose-800 uppercase tracking-widest flex items-center gap-1.5 leading-none">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              ¡Sincronización de Memoria Inactiva!
            </h4>
            <p className="text-[11px] text-slate-600 leading-relaxed font-semibold">
              Por seguridad fiscal, límites de consumo y prevención de cuentas múltiples fraudulentas, ZenTicket mantendrá una copia de seguridad segura de tus datos fiscales y comprobantes emitidos. Si confirmas, tu sesión finalizará y tu cuenta se desactivará, pero conservaremos todo tu historial si inicias sesión nuevamente.
            </p>
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={handleDeleteAccount}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-xl uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
              >
                {isDeletingAccount ? "Desactivando..." : "Sí, Desactivar"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 bg-[#ebf1ff] hover:bg-[#ebf1ff]/80 text-[#0B53F4] font-black text-xs rounded-xl uppercase tracking-wider transition cursor-pointer border-none shadow-2xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          /* Gray/Red small trash Eliminar Cuenta button */
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-rose-500 hover:text-rose-600 font-bold text-xs bg-transparent border-none outline-none cursor-pointer tracking-wide font-sans"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Eliminar Cuenta</span>
          </button>
        )}
      </div>

    </div>
  );
}
