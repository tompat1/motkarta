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
  Question,
  Star,
} from "@phosphor-icons/react";
import { useCms, CmsEditFlag } from "../app/cms";

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
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(true);

  if (!isOpen) return null;

  const { t } = useCms();
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
      titleKey: "principle1Title",
      titleLabel: "Panel 1: Motström (Rubrik)",
      title: t.principle1Title || (isSv ? "1. Motström — Opartisk & Fri" : "1. Counter-Stream — Unbiased & Free"),
      taglineKey: "principle1Tagline",
      taglineLabel: "Panel 1: Tagline",
      tagline: t.principle1Tagline || (isSv ? "MOTSTRÖM APPAREL" : "COUNTER MOVEMENT"),
      descKey: "principle1Desc",
      descLabel: "Panel 1: Beskrivning",
      description: t.principle1Desc || (isSv
        ? "Ingen betald ranking, inga köpta placeringar och inga sponsrade avgifter. Alla ställen rankas strikt på verifierbar kvalitet och transparens."
        : "No paid rankings, no sponsored placements, no hidden fees. Places are ranked strictly on audited quality and transparency."),
      icon: ShieldCheck,
    },
    {
      id: "auditable-data",
      titleKey: "principle2Title",
      titleLabel: "Panel 2: Auditerbar Data (Rubrik)",
      title: t.principle2Title || (isSv ? "2. Auditerbar Data & Kontroll" : "2. Auditable Data & Inspections"),
      taglineKey: "principle2Tagline",
      taglineLabel: "Panel 2: Tagline",
      tagline: t.principle2Tagline || (isSv ? "RÅDATA LOGO SHEET" : "PRECISION AUDIT"),
      descKey: "principle2Desc",
      descLabel: "Panel 2: Beskrivning",
      description: t.principle2Desc || (isSv
        ? "Kombinerar officiella kommunala miljö- och livsmedelsinspektioner, serveringstillstånd och oberoende redaktionella guider."
        : "Integrates official municipal food control inspections, liquor permits, and independent editorial restaurant guides."),
      icon: CheckCircle,
    },
    {
      id: "open-data",
      titleKey: "principle3Title",
      titleLabel: "Panel 3: Öppen Grunddata (Rubrik)",
      title: t.principle3Title || (isSv ? "3. Öppen Grunddata" : "3. Open Data Baseline"),
      taglineKey: "principle3Tagline",
      taglineLabel: "Panel 3: Tagline",
      tagline: t.principle3Tagline || (isSv ? "RÅDATA BASELINE" : "RAW DATA BASELINE"),
      descKey: "principle3Desc",
      descLabel: "Panel 3: Beskrivning",
      description: t.principle3Desc || (isSv
        ? "Öppen källkod och geografisk baseline från OpenStreetMap och Stockholms stad — tillgängligt för alla."
        : "Open source and geographical baseline from OpenStreetMap and the City of Stockholm — accessible to everyone."),
      icon: Sparkle,
    },
    {
      id: "neighborhood",
      titleKey: "principle4Title",
      titleLabel: "Panel 4: Nollpunkt (Rubrik)",
      title: t.principle4Title || (isSv ? "4. Nollpunkt & Kvarter" : "4. Neighborhood Precision"),
      taglineKey: "principle4Tagline",
      taglineLabel: "Panel 4: Tagline",
      tagline: t.principle4Tagline || (isSv ? "NOLLPUNKT STREET" : "STREET LEVEL GRID"),
      descKey: "principle4Desc",
      descLabel: "Panel 4: Beskrivning",
      description: t.principle4Desc || (isSv
        ? "Precision på gatunivå. Hitta dolda pärlor, specialty coffee och kvarterskrogar från Södermalm och Vasastan till Gamla Stan."
        : "Street-level accuracy. Discover hidden gems, specialty coffee, and local bistros from Södermalm to Vasastan."),
      icon: MapPin,
    },
    {
      id: "table-by-table",
      titleKey: "principle5Title",
      titleLabel: "Panel 5: Stockholm Bord för Bord (Rubrik)",
      title: t.principle5Title || (isSv ? "5. Stockholm, Bord för Bord" : "5. Stockholm, Table by Table"),
      taglineKey: "principle5Tagline",
      taglineLabel: "Panel 5: Tagline",
      tagline: t.principle5Tagline || (isSv ? "STOCKHOLM, BORD FÖR BORD" : "STOCKHOLM, TABLE BY TABLE"),
      descKey: "principle5Desc",
      descLabel: "Panel 5: Beskrivning",
      description: t.principle5Desc || (isSv
        ? "Kurerat urval över 3 190+ restauranger, caféer, bagerier och baristabarer i hela Stockholm."
        : "Curated directory of over 3,190+ restaurants, bakeries, cafes, and roasteries across Stockholm."),
      icon: Compass,
      action: {
        label: t.onboardingAskConcierge || (isSv ? "Fråga Conciergen" : "Ask Concierge"),
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
      titleKey: "principle6Title",
      titleLabel: "Panel 6: Privatsynk & QR (Rubrik)",
      title: t.principle6Title || (isSv ? "6. Privatsynk & QR-kod" : "6. Zero-Login QR Sync"),
      taglineKey: "principle6Tagline",
      taglineLabel: "Panel 6: Tagline",
      tagline: t.principle6Tagline || (isSv ? "ENHETSSYNKRONISERING" : "CROSS-DEVICE SYNC"),
      descKey: "principle6Desc",
      descLabel: "Panel 6: Beskrivning",
      description: t.principle6Desc || (isSv
        ? "Synka dina sparade favoritställen sömlöst mellan alla dina enheter via QR-kod eller 6-ställig kod — helt utan konto eller e-post."
        : "Seamlessly sync your saved favorite places across all your devices using a QR code or 6-character code — zero login or email required."),
      icon: QrCode,
      stepsTitle: isSv ? "💡 Hur funkar det? (3 enkla steg)" : "💡 How does it work? (3 simple steps)",
      steps: [
        {
          step: "1",
          title: isSv ? "Spara dina favoritställen" : "Save your favorite places",
          desc: isSv
            ? "Tryck på stjärnknappen (★ Sparade) på dina favoritställen på kartan eller i listan."
            : "Tap the star button (★ Saved) on your favorite places on the map or in the list.",
        },
        {
          step: "2",
          title: isSv ? "Öppna 'Synka enheter'" : "Open 'Sync Devices'",
          desc: isSv
            ? "Klicka på 'Synka enheter' i snabbfiltret eller knappen nedan för din QR-kod."
            : "Click 'Sync Devices' in the filter bar or the button below for your QR code.",
        },
        {
          step: "3",
          title: isSv ? "Skanna med mobilkameran" : "Scan with your phone camera",
          desc: isSv
            ? "Rikta mobilkameran mot QR-koden (eller knappa in koden) för direktsynkning helt utan konto."
            : "Point your camera at the QR code (or type the code) for instant sync without an account.",
        },
      ],
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
            {t.onboardingBadge || (isSv ? "MANIFEST & PRINCIPER" : "MANIFESTO & PRINCIPLES")}
            <CmsEditFlag cmsKey="onboardingBadge" label="Principer: Modal Ögonbryn" />
          </span>
          <h2>
            {t.principlesHeading ? `MOTKARTA — ${t.principlesHeading}` : `MOTKARTA — ${isSv ? "Stockholms Fria Matkarta" : "Stockholm Independent Food Map"}`}
            <CmsEditFlag cmsKey="principlesHeading" label="Principer: Huvudrubrik" />
          </h2>
          <p className="onboarding-subtitle">
            {t.onboardingSubtitle || (isSv
              ? "Stockholm, bord för bord. En oberoende matkarta byggd på öppen data och verifierbara källor."
              : "Stockholm, table by table. An independent food map built on open data and auditable evidence.")}
            <CmsEditFlag cmsKey="onboardingSubtitle" label="Principer: Modal Underrubrik" />
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
              {t.onboardingBannerCaption || (isSv
                ? "🎨 Klicka på korten nedan för att fälla ut eller ihop text och källor."
                : "🎨 Click cards below to collapse or extend text and sources.")}
              <CmsEditFlag cmsKey="onboardingBannerCaption" label="Principer: Banner Bildtext" />
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
                key={p.taglineKey}
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
                  <div className="principle-card-icon-tag" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <IconComponent size={18} weight="bold" />
                    <span className="principle-card-tagline">{p.tagline}</span>
                    <CmsEditFlag cmsKey={p.taglineKey} label={p.taglineLabel} />
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

                <h4 style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                  <span>{p.title}</span>
                  <CmsEditFlag cmsKey={p.titleKey} label={p.titleLabel} />
                </h4>

                {isExpanded ? (
                  <div className="principle-card-body">
                    <p>
                      {p.description}
                      <CmsEditFlag cmsKey={p.descKey} label={p.descLabel} />
                    </p>

                    {isSync ? (
                      <div className="sync-how-it-works-container" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="sync-how-it-works-toggle-btn"
                          onClick={() => setShowHowItWorks((prev) => !prev)}
                        >
                          <Question size={15} weight="bold" />
                          <span>{isSv ? "Hur funkar det?" : "How does it work?"}</span>
                          {showHowItWorks ? <CaretUp size={13} weight="bold" /> : <CaretDown size={13} weight="bold" />}
                        </button>

                        {showHowItWorks && p.steps ? (
                          <div className="sync-how-it-works-box">
                            <span className="sync-how-it-works-title">{p.stepsTitle}</span>
                            <div className="sync-steps-list">
                              {p.steps.map((st) => (
                                <div key={st.step} className="sync-step-item">
                                  <span className="sync-step-badge">{st.step}</span>
                                  <div className="sync-step-content">
                                    <strong>{st.title}</strong>
                                    <span>{st.desc}</span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            {onOpenSyncModal ? (
                              <button
                                type="button"
                                className="principle-action-btn sync-action-btn"
                                style={{ marginTop: "8px", width: "100%", justifyContent: "center" }}
                                onClick={() => {
                                  onClose();
                                  onOpenSyncModal();
                                }}
                              >
                                <QrCode size={15} weight="bold" />
                                <span>{isSv ? "Starta synk & visa QR-kod" : "Start sync & show QR code"}</span>
                                <ArrowRight size={14} weight="bold" />
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : p.action ? (
                      <button
                        type="button"
                        className="principle-action-btn"
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
            <div style={{ display: "inline-flex", alignItems: "center" }}>
              <button
                type="button"
                className="onboarding-sync-btn"
                onClick={() => {
                  onClose();
                  onOpenSyncModal();
                }}
              >
                <QrCode size={18} weight="bold" />
                {t.onboardingSyncDevices || (isSv ? "Synka Enheter (QR-kod)" : "Sync Devices (QR Code)")}
              </button>
              <CmsEditFlag cmsKey="onboardingSyncDevices" label="Principer: Synka Enheter knapp" />
            </div>
          ) : null}

          <div style={{ display: "inline-flex", alignItems: "center" }}>
            <button
              type="button"
              className="onboarding-primary-btn"
              onClick={onClose}
            >
              <Compass size={18} weight="bold" />
              {t.onboardingExploreMap || (isSv ? "Utforska Kartan" : "Explore Map")}
            </button>
            <CmsEditFlag cmsKey="onboardingExploreMap" label="Principer: Utforska Kartan knapp" />
          </div>

          <div style={{ display: "inline-flex", alignItems: "center" }}>
            <button
              type="button"
              className="onboarding-secondary-btn"
              onClick={() => {
                onClose();
                onOpenConcierge();
              }}
            >
              <MagnifyingGlass size={18} weight="bold" />
              {t.onboardingAskConcierge || (isSv ? "Fråga Conciergen" : "Ask Concierge")}
            </button>
            <CmsEditFlag cmsKey="onboardingAskConcierge" label="Principer: Fråga Conciergen knapp" />
          </div>
        </div>
      </div>
    </div>
  );
};
