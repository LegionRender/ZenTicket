import React, { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/context/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/services/firebase/client";
import Logo from "@/shared/brand/ProductLogo";

export const AuthModal = ({ open, onOpenChange, initialMode = "signin" }) => {
  const [mode, setMode] = useState(initialMode); // "signin" or "signup"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const result = await loginWithGoogle();
      const user = result.user;

      // Ensure user profile is registered in Firestore
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        try {
          localStorage.setItem("is_new_signup_" + user.uid, "true");
        } catch (e) {
          console.warn("Unable to save signup flag:", e);
        }
        await setDoc(userRef, {
          uid: user.uid,
          name: user.displayName || "Usuario de ZenTicket",
          email: user.email,
          createdAt: new Date().toISOString(),
        });
      }

      toast.success(`¡Bienvenido de vuelta, ${user.displayName || user.email}!`);
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Error al iniciar sesión con Google.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error("Por favor completa los campos.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      toast.error("Por favor ingresa tu nombre.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const result = await registerWithEmail(email.trim(), password);
        const user = result.user;

        try {
          localStorage.setItem("is_new_signup_" + user.uid, "true");
        } catch (e) {
          console.warn("Unable to save signup flag:", e);
        }

        // Save user details to Firestore users collection
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          name: name.trim(),
          email: user.email,
          createdAt: new Date().toISOString(),
        });

        toast.success("¡Tu cuenta ha sido creada con éxito!");
      } else {
        const result = await loginWithEmail(email.trim(), password);
        toast.success(`Sesión iniciada como ${result.user.email}`);
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      let errMsg = "Credenciales incorrectas o error en el sistema.";
      if (err.code === "auth/email-already-in-use") {
        errMsg = "Este correo electrónico ya está registrado.";
      } else if (err.code === "auth/weak-password") {
        errMsg = "La contraseña debe tener al menos 6 caracteres.";
      } else if (err.code === "auth/invalid-credential") {
        errMsg = "Correo o contraseña no válidos.";
      }
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] bg-[#070a16] text-white border-white/10 p-6 rounded-2xl">
        <DialogHeader className="items-center text-center">
          <div className="flex justify-center mb-5 mt-1 select-none">
            <Logo size="md" variant="horizontal" theme="dark" />
          </div>
          <DialogTitle className="font-display text-[24px] font-extrabold tracking-tight">
            {mode === "signup" ? "Crea tu cuenta gratis" : "Iniciar Sesión"}
          </DialogTitle>
          <DialogDescription className="text-white/60 text-[14px]">
            {mode === "signup"
              ? "Prueba ZenTicket y automatiza tus facturas hoy."
              : "Ingresa tus credenciales para acceder a tu panel."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 zt-btn-ghost-dark text-white rounded-full py-3 text-[14.5px] font-semibold hover:bg-white/5 transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M5.266 9.765A7.077 7.077 0 0112 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.642 1.091 14.982 0 12 0 7.345 0 3.327 2.691 1.345 6.618l3.92 3.147z"
              />
              <path
                fill="#4285F4"
                d="M23.491 12.273c0-.818-.082-1.609-.218-2.364H12v4.545h6.464a5.532 5.532 0 01-2.4 3.627l3.745 2.9a11.895 11.895 0 004.145-8.708z"
              />
              <path
                fill="#FBBC05"
                d="M5.266 14.235a7.086 7.086 0 01-.364-2.235c0-.782.136-1.536.364-2.235L1.345 6.618A11.936 11.936 0 000 12c0 1.927.455 3.755 1.255 5.373l4.01-3.138z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.245 0 5.973-1.073 7.964-2.918l-3.745-2.9a7.065 7.065 0 01-4.218 1.182c-3.69 0-6.8-2.491-7.927-5.855l-4.01 3.136C3.327 21.309 7.345 24 12 24z"
              />
            </svg>
            <span>Continuar con Google</span>
          </button>

          <div className="relative flex items-center justify-center my-4">
            <div className="absolute inset-x-0 h-px bg-white/10" />
            <span className="relative z-10 px-3 text-[12px] uppercase text-white/45 bg-[#070a16]">
              o con tu correo
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-[12px] font-semibold text-white/70">
                  Nombre completo
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  placeholder="Ej. Juan Pérez"
                  className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-[14px] text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400/50"
                  required
                />
              </div>
            )}

            <div>
              <label className="text-[12px] font-semibold text-white/70">
                Correo electrónico
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="tu@correo.com"
                className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-[14px] text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400/50"
                required
              />
            </div>

            <div>
              <label className="text-[12px] font-semibold text-white/70">
                Contraseña
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="••••••••"
                className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3.5 py-2.5 text-[14px] text-white outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400/50"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 zt-btn-primary text-white font-semibold py-3 rounded-full disabled:opacity-60 transition-all text-[15px]"
            >
              {loading
                ? "Cargando…"
                : mode === "signup"
                ? "Registrarse y Empezar"
                : "Iniciar Sesión"}
            </button>
          </form>

          <p className="text-center text-[13px] text-white/50 mt-4">
            {mode === "signup" ? (
              <>
                ¿Ya tienes cuenta?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="text-blue-400 hover:underline font-semibold"
                >
                  Inicia sesión
                </button>
              </>
            ) : (
              <>
                ¿No tienes cuenta?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="text-blue-400 hover:underline font-semibold"
                >
                  Regístrate gratis
                </button>
              </>
            )}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
export default AuthModal;
