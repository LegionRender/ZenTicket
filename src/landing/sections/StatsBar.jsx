import React from "react";
import { Ticket, Users, Building2, Smile } from "lucide-react";
import { TID } from "@/lib/testIds";

const stats = [
  {
    icon: Ticket,
    value: "+120,000",
    label: "Tickets procesados",
    color: "text-emerald-300",
    iconBg: "bg-emerald-500/15 text-emerald-300",
  },
  {
    icon: Users,
    value: "+15,000",
    label: "Usuarios felices",
    color: "text-amber-300",
    iconBg: "bg-amber-500/15 text-amber-300",
  },
  {
    icon: Building2,
    value: "+350",
    label: "Empresas compatibles",
    color: "text-sky-300",
    iconBg: "bg-sky-500/15 text-sky-300",
  },
  {
    icon: Smile,
    value: "98%",
    label: "Satisfacción de usuarios",
    color: "text-fuchsia-300",
    iconBg: "bg-fuchsia-500/15 text-fuchsia-300",
  },
];

const StatsBar = () => {
  return (
    <section
      data-testid={TID.stats.root}
      className="text-white"
      style={{
        background:
          "linear-gradient(180deg, #06091a 0%, #070b1f 100%)",
      }}
    >
      <div className="max-w-[1240px] mx-auto px-6 lg:px-8 py-10 lg:py-12">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-8">
          {stats.map((s, i) => (
            <div
              key={s.label}
              className={`flex items-center gap-4 ${
                i !== 0 ? "lg:border-l lg:border-white/5 lg:pl-8" : ""
              }`}
            >
              <div
                className={`w-11 h-11 rounded-xl grid place-items-center ${s.iconBg}`}
              >
                <s.icon size={18} />
              </div>
              <div>
                <div className={`font-display font-extrabold text-[26px] leading-none ${s.color}`}>
                  {s.value}
                </div>
                <div className="text-[12.5px] text-white/60 mt-1.5">
                  {s.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsBar;
