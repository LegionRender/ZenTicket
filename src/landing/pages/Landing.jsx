import React, { useState } from "react";
import Navbar from "@/landing/sections/Navbar";
import Hero from "@/landing/sections/Hero";
import LogosBar from "@/landing/sections/LogosBar";
import ProblemSection from "@/landing/sections/ProblemSection";
import AssistantSection from "@/landing/sections/AssistantSection";
import HowItWorks from "@/landing/sections/HowItWorks";
import BenefitsCarousel from "@/landing/sections/BenefitsCarousel";
import ComparisonTable from "@/landing/sections/ComparisonTable";
import StatsBar from "@/landing/sections/StatsBar";
import PricingSection from "@/landing/sections/PricingSection";
import TestimonialsSection from "@/landing/sections/TestimonialsSection";
import FAQSection from "@/landing/sections/FAQSection";
import FinalCTA from "@/landing/sections/FinalCTA";
import Footer from "@/landing/sections/Footer";
import AuthModal from "@/auth/components/AuthModal";

const Landing = () => {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin"); // "signin" or "signup"

  const triggerAuth = (mode = "signup") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <main className="zt-landing overflow-hidden bg-white">
      <Navbar 
        onCtaClick={() => triggerAuth("signup")} 
        onLoginClick={() => triggerAuth("signin")} 
      />
      <Hero onCtaClick={() => triggerAuth("signup")} />
      <LogosBar />
      <ProblemSection />
      <AssistantSection />
      <HowItWorks />
      <BenefitsCarousel />
      <ComparisonTable />
      <StatsBar />
      <PricingSection onChoose={() => triggerAuth("signup")} />
      <TestimonialsSection />
      <FAQSection />
      <FinalCTA
        onCtaClick={() => triggerAuth("signup")}
        onDemoClick={() => triggerAuth("signup")}
      />
      <Footer />

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} />
    </main>
  );
};

export default Landing;
