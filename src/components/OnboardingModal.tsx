import React, { useState } from "react";
import { Compass, ShieldCheck, Sparkle, MagnifyingGlass, CheckCircle, MapPin } from "@phosphor-icons/react";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenConcierge: () => void;
  lang: "sv" | "en";
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onOpenConcierge,
  lang,
}) => {
  const [activeStep, setActiveStep] = useState<number>(0);

  if (!isOpen) return null;

  const isSv = lang === "sv";

  const principles = [
    {
      title: isSv ? "1. Motström — Opartisk & Fri" : "1. Counter-Stream — Unbiased & Free",
      tagline: isSv ? "MOTSTRÖM APPAREL" : "COUNTER MOVEMENT",
      description: isSv
        ? "Ingen betald ranking, inga köpta placeringar och inga sponsrade avgifter. Alla ställen rankas strikt på verifierbar kvalitet och transparens."
        : "No paid rankings, no sponsored placements, no hidden fees. Places are ranked strictly on audited quality and transparency.",
      icon: ShieldCheck,
    },
    {
      title: isSv ? "2. Auditerbar Data & Kontroll" : "2. Auditable Data & Inspections",
      tagline: isSv ? "RÅDATA LOGO SHEET" : "PRECISION AUDIT",
      description: isSv
        ? "Kombinerar officiella kommunala miljö- och livsmedelsinspektioner, serveringstillstånd och oberoende redaktionella guider."
        : "Integrates official municipal food control inspections, liquor permits, and independent editorial restaurant guides.",
      icon: CheckCircle,
    },
    {
      title: isSv ? "3. Öppen Grunddata" : "3. Open Data Baseline",
      tagline: isSv ? "RÅDATA BASELINE" : "RAW DATA BASELINE",
      description: isSv
        ? "Öppen källkod och geografisk baseline från OpenStreetMap och Stockholms stad — tillgängligt för alla."
        : "Open source and geographical baseline from OpenStreetMap and the City of Stockholm — accessible to everyone.",
      icon: Sparkle,
    },
    {
      title: isSv ? "4. Nollpunkt & Kvarter" : "4. Neighborhood Precision",
      tagline: isSv ? "NOLLPUNKT STREET" : "STREET LEVEL GRID",
      description: isSv
        ? "Precision på gatunivå. Hitta dolda pärlor, specialty coffee och kvarterskrogar från Södermalm och Vasastan till Gamla Stan."
        : "Street-level accuracy. Discover hidden gems, specialty coffee, and local bistros from Södermalm to Vasastan.",
      icon: MapPin,
    },
    {
      title: isSv ? "5. Stockholm, Bord för Bord" : "5. Stockholm, Table by Table",
      tagline: isSv ? "STOCKHOLM, BORD FÖR BORD" : "STOCKHOLM, TABLE BY TABLE",
      description: isSv
        ? "Kurerat urval över 3 190+ restauranger, caféer, bagerier och baristabarer i hela Stockholm."
        : "Curated directory of over 3,190+ restaurants, bakeries, cafes, and roasteries across Stockholm.",
      icon: Compass,
    },
  ];

  return (
    <div className="lightbox-overlay onboarding-overlay" onClick={onClose}>
      <div className="onboarding-modal-content" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="lightbox-close-btn onboarding-close-btn"
          onClick={onClose}
          aria-label="Close onboarding"
        >
          ✕
        </button>

        <div className="onboarding-header">
          <span className="onboarding-badge">
            {isSv ? "MANIFEST & PRINCIPER" : "MANIFESTO & PRINCIPLES"}
          </span>
          <h2>MOTKARTA — {isSv ? "Stockholms Fria Matkarta" : "Stockholm Independent Food Map"}</h2>
          <p className="onboarding-subtitle">
            {isSv
              ? "Stockholm, bord för bord. En oberoende matkarta byggd på öppen data och verifierbara källor."
              : "Stockholm, table by table. An independent food map built on open data and auditable evidence."}
          </p>
        </div>

        {/* Exhibition Poster Collage Banner */}
        <div className="onboarding-banner-frame">
          <img
            src="/onboarding-collage.webp"
            alt="Motkarta Onboarding Exhibition Posters"
            className="onboarding-collage-img"
          />
          <div className="onboarding-banner-caption">
            <span>
              {isSv
                ? "🎨 Fem principer som driver Motkarta — från opartisk ranking till rådata på gatunivå."
                : "🎨 Five core principles driving Motkarta — from unbiased ranking to street-level raw data."}
            </span>
          </div>
        </div>

        {/* 5 Principles Grid / Tabs */}
        <div className="onboarding-principles-grid">
          {principles.map((p, idx) => {
            const IconComponent = p.icon;
            const isActive = activeStep === idx;
            return (
              <button
                key={p.tagline}
                type="button"
                className={`onboarding-principle-card ${isActive ? "active" : ""}`}
                onClick={() => setActiveStep(idx)}
              >
                <div className="principle-card-header">
                  <IconComponent size={18} weight="bold" />
                  <span className="principle-card-tagline">{p.tagline}</span>
                </div>
                <h4>{p.title}</h4>
                <p>{p.description}</p>
              </button>
            );
          })}
        </div>

        {/* Footer Action Buttons */}
        <div className="onboarding-actions">
          <button
            type="button"
            className="onboarding-primary-btn"
            onClick={onClose}
          >
            <Compass size={18} weight="bold" />
            {isSv ? "Utforska Kartan" : "Explore Map"}
          </button>
          <button
            type="button"
            className="onboarding-secondary-btn"
            onClick={() => {
              onClose();
              onOpenConcierge();
            }}
          >
            <MagnifyingGlass size={18} weight="bold" />
            {isSv ? "Fråga Conciergen" : "Ask Concierge"}
          </button>
        </div>
      </div>
    </div>
  );
};
