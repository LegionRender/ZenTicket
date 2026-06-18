import React, { useState } from "react";
import { toast } from "sonner";
import { createLead } from "@/services/api/leadsService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TID } from "@/lib/testIds";

const LeadModal = ({ open, onOpenChange, plan }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Por favor completa tu nombre y correo.");
      return;
    }
    setLoading(true);
    try {
      await createLead({
        name: name.trim(),
        email: email.trim(),
        plan: plan || "general",
      });
      toast.success("¡Listo! Pronto te contactaremos.");
      setName("");
      setEmail("");
      onOpenChange(false);
    } catch (err) {
      toast.error("No pudimos enviar tu solicitud. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid={TID.leadModal.root} className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display text-[22px]">
            Empieza con ZenTicket
          </DialogTitle>
          <DialogDescription>
            Déjanos tus datos y te enviaremos un acceso para probar la app.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-2 space-y-3">
          <div>
            <label className="text-[12.5px] font-medium text-slate-700">
              Nombre
            </label>
            <input
              data-testid={TID.leadModal.name}
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              placeholder="Tu nombre"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              required
            />
          </div>
          <div>
            <label className="text-[12.5px] font-medium text-slate-700">
              Correo electrónico
            </label>
            <input
              data-testid={TID.leadModal.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="tu@correo.com"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              required
            />
          </div>
          <button
            data-testid={TID.leadModal.submit}
            type="submit"
            disabled={loading}
            className="w-full zt-btn-primary text-white font-semibold py-3 rounded-full disabled:opacity-60"
          >
            {loading ? "Enviando…" : "Probar Gratis"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LeadModal;
