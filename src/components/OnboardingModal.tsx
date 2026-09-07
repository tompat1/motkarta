import React, { useState } from "react";
import {
  Compass,
  ShieldCheck,
  Sparkle,
  MagnifyingGlass,
  CheckCircle,
  MapPin,
  QrCode,
  CaretDown,
  CaretUp,
  ArrowRight,
} from "@phosphor-icons/react";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenConcierge: () => void;
  onOpenSyncModal?: () => void;
  lang: "sv" | "en";
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onOpenConcierge,
  onOpenSyncModal,
  lang,
}) => {
  // Panel 0 (Motström) and Panel 5 (Zero-Login QR Sync) expanded by default
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set([0, 5]));

  if (!isOpen) return null;

  const isSv = lang === "sv";

  const toggleExpand = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const principles = [
    {
      id: "counter-stream",
      title: isSv ? "1. Motström — Opartisk & Fri" : "1. Counter-Stream — Unbiased & Free",
      tagline: isSv ? "MOTSTRÖM APPAREL" : "COUNTER MOVEMENT",
      description: isSv
        ? "Ingen betald ranking, inga köpta placeringar och inga sponsrade avgifter. Alla ställen rankas strikt på verifierbar kvalitet och transparens."
        : "No paid rankings, no sponsored placements, no hidden fees. Places are ranked strictly on audited quality and transparency.",
      icon: ShieldCheck,
    },
    {
      id: "auditable-data",
      title: isSv ? "2. Auditerbar Data & Kontroll" : "2. Auditable Data & Inspections",
      tagline: isSv ? "RÅDATA LOGO SHEET" : "PRECISION AUDIT",
      description: isSv
        ? "Kombinerar officiella kommunala miljö- och livsmedelsinspektioner, serveringstillstånd och oberoende redaktionella guider."
        : "Integrates official municipal food control inspections, liquor permits, and independent editorial restaurant guides.",
      icon: CheckCircle,
    },
    {
      id: "open-data",
      title: isSv ? "3. Öppen Grunddata" : "3. Open Data Baseline",
      tagline: isSv ? "RÅDATA BASELINE" : "RAW DATA BASELINE",
      description: isSv
        ? "Öppen källkod och geografisk baseline från OpenStreetMap och Stockholms stad — tillgängligt för alla."
        : "Open source and geographical baseline from OpenStreetMap and the City of Stockholm — accessible to everyone.",
      icon: Sparkle,
    },
    {
      id: "neighborhood",
      title: isSv ? "4. Nollpunkt & Kvarter" : "4. Neighborhood Precision",
      tagline: isSv ? "NOLLPUNKT STREET" : "STREET LEVEL GRID",
      description: isSv
        ? "Precision på gatunivå. Hitta dolda pärlor, specialty coffee och kvarterskrogar från Södermalm och Vasastan till Gamla Stan."
        : "Street-level accuracy. Discover hidden gems, specialty coffee, and local bistros from Södermalm to Vasastan.",
      icon: MapPin,
    },
    {
      id: "table-by-table",
      title: isSv ? "5. Stockholm, Bord för Bord" : "5. Stockholm, Table by Table",
      tagline: isSv ? "STOCKHOLM, BORD FÖR BORD" : "STOCKHOLM, TABLE BY TABLE",
      description: isSv
        ? "Kurerat urval över 3 190+ restauranger, caféer, bagerier och baristabarer i hela Stockholm."
        : "Curated directory of over 3,190+ restaurants, bakeries, cafes, and roasteries across Stockholm.",
      icon: Compass,
      action: {
        label: isSv ? "Fråga Conciergen" : "Ask Concierge",
        icon: MagnifyingGlass,
        onClick: () => {
          onClose();
          onOpenConcierge();
        },
      },
    },
    {
      id: "qr-sync",
      isSyncCard: true,
      title: isSv ? "6. Privatsynk & QR-kod" : "6. Zero-Login QR Sync",
      tagline: isSv ? "ENHETSSYNKRONISERING" : "CROSS-DEVICE SYNC",
      description: isSv
        ? "Synka dina sparade favoritställen sömlöst mellan alla dina enheter via QR-kod eller 6-ställig kod — helt utan konto eller e-post."
        : "Seamlessly sync your saved favorite places across all your devices using a QR code or 6-character code — zero login or email required.",
      icon: QrCode,
      action: {
        label: isSv ? "Visa QR-kod & Synka Enheter" : "Show QR Code & Sync Devices",
        icon: QrCode,
        onClick: () => {
          onClose();
          onOpenSyncModal?.();
        },
      },
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
                ? "🎨 Klicka på korten nedan för att fälla ut eller ihop text och källor."
                : "🎨 Click cards below to collapse or extend text and sources."}
            </span>
          </div>
        </div>

        {/* 6 Principles Grid with Collapsible Text */}
        <div className="onboarding-principles-grid">
          {principles.map((p, idx) => {
            const IconComponent = p.icon;
            const isExpanded = expandedIndices.has(idx);
            const isSync = p.isSyncCard;

            return (
              <div
                key={p.tagline}
                className={`onboarding-principle-card ${isExpanded ? "expanded" : "collapsed"} ${
                  isSync ? "sync-featured-card" : ""
                }`}
                onClick={() => toggleExpand(idx)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleExpand(idx);
                  }
                }}
                aria-expanded={isExpanded}
              >
                <div className="principle-card-header">
                  <div className="principle-card-icon-tag">
                    <IconComponent size={18} weight="bold" />
                    <span className="principle-card-tagline">{p.tagline}</span>
                  </div>
                  <button
                    type="button"
                    className="principle-card-toggle-btn"
                    aria-label={isExpanded ? "Fäll ihop" : "Fäll ut"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(idx);
                    }}
                  >
                    {isExpanded ? <CaretUp size={15} weight="bold" /> : <CaretDown size={15} weight="bold" />}
                  </button>
                </div>

                <h4>{p.title}</h4>

                {isExpanded ? (
                  <div className="principle-card-body">
                    <p>{p.description}</p>
                    {p.action ? (
                      <button
                        type="button"
                        className={`principle-action-btn ${isSync ? "sync-action-btn" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          p.action?.onClick();
                        }}
                      >
                        <p.action.icon size={15} weight="bold" />
                        <span>{p.action.label}</span>
                        <ArrowRight size={14} weight="bold" />
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <span className="principle-card-expand-hint">
                    {isSv ? "Klicka för att fälla ut →" : "Click to extend →"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Action Buttons */}
        <div className="onboarding-actions">
          {onOpenSyncModal ? (
            <button
              type="button"
              className="onboarding-sync-btn"
              onClick={() => {
                onClose();
                onOpenSyncModal();
              }}
            >
              <QrCode size={18} weight="bold" />
              {isSv ? "Synka Enheter (QR-kod)" : "Sync Devices (QR Code)"}
            </button>
          ) : null}

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
