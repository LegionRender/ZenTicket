import React from "react";
import { ZenLogo } from "@/shared/brand/ZenLogo";
import { TID } from "@/shared/utils/testIds";

const Footer = () => {
  return (
    <footer
      data-testid={TID.footer.root}
      className="text-white"
      style={{ background: "#04060f" }}
    >
      <div className="max-w-[1240px] mx-auto px-6 lg:px-8 py-7 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ZenLogo size={48} theme="dark" />
        </div>
        <p className="text-[12px] text-white/40">
          © {new Date().getFullYear()} ZenTicket. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
