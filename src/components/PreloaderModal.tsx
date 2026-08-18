import { useEffect, useState } from "react";
import { ArrowRight, CaretRight, Sparkle, X } from "@phosphor-icons/react";

export type Language = "sv" | "en";

export type PreloaderSlide = {
  id: number;
  image: string;
  badgeSv: string;
  badgeEn: string;
  titleSv: string;
  titleEn: string;
  descSv: string;
  descEn: string;
};

export const PRELOADER_SLIDES: PreloaderSlide[] = [
  {
    id: 1,
    image: "/preloader/slide1.webp",
    badgeSv: "01 / GATUNÄT & KVARTER",
    badgeEn: "01 / STREET GRID & NEIGHBORHOOD",
    titleSv: "STOCKHOLM, BORD FÖR BORD",
    titleEn: "STOCKHOLM, TABLE BY TABLE",
    descSv: "Kartlagt gatu- och kvartersnät över 3 190+ oberoende restauranger, bagerier, caféer och espressobarer.",
    descEn: "Mapped street grid across 3,190+ independent restaurants, bakeries, cafes, and espresso bars.",
  },
  {
    id: 2,
    image: "/preloader/slide2.webp",
    badgeSv: "02 / MANIFESTO",
    badgeEn: "02 / MANIFESTO",
    titleSv: "INTE SPONSRAT. ÄT UTAN ALGORITMEN.",
    titleEn: "NOT SPONSORED. EAT WITHOUT THE ALGORITHM.",
    descSv: "Ingen köpt synlighet. Varje betyg och ranking bygger på auditerbara öppna källor och livsmedelsdata.",
    descEn: "Zero paid placement. Every rating and ranking relies on auditable open data and health inspection records.",
  },
  {
    id: 3,
    image: "/preloader/slide3.webp",
    badgeSv: "03 / NOLLPUNKT",
    badgeEn: "03 / ZERO POINT",
    titleSv: "MOTKARTA: INGEN BETALD RANKING",
    titleEn: "MOTKARTA: NO PAID RANKINGS",
    descSv: "En oberoende digital stadsguide för dig som söker hantverk och lokala kvarterskrogar utan kommersiell bias.",
    descEn: "An independent city guide for discovering artisanal craftsmanship without commercial bias.",
  },
  {
    id: 4,
    image: "/preloader/slide4.webp",
    badgeSv: "04 / NOLLPUNKT PINS",
    badgeEn: "04 / ZERO POINT PINS",
    titleSv: "UPPTÄCK ÄKTA KVARTERSKROGAR NÄRA DIG",
    titleEn: "DISCOVER AUTHENTIC LOCAL PLACES NEAR YOU",
    descSv: "Navigera karta, auditerade källor och concierge för att hitta din nästa matupplevelse i Stockholm.",
    descEn: "Explore map, verified data sources, and AI concierge to discover your next food experience in Stockholm.",
  },
];

export function PreloaderModal({
  isOpen,
  onClose,
  lang = "sv",
}: {
  isOpen: boolean;
  onClose: () => void;
  lang?: Language;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFading, setIsFading] = useState(false);

  const isSv = lang === "sv";
  const slide = PRELOADER_SLIDES[currentIndex];
  const isLast = currentIndex === PRELOADER_SLIDES.length - 1;

  // Auto-advance slides every 3.8s
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      handleNextSlide();
    }, 3800);

    return () => clearInterval(timer);
  }, [currentIndex, isOpen]);

  const goToSlide = (index: number) => {
    if (index === currentIndex || isFading) return;
    setIsFading(true);
    setTimeout(() => {
      setCurrentIndex(index);
      setIsFading(false);
    }, 250);
  };

  const handleNextSlide = () => {
    if (isFading) return;
    if (isLast) {
      onClose();
    } else {
      goToSlide(currentIndex + 1);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="preloader-fullscreen-overlay">
      {/* Background Image Container with Crossfade */}
      <div className="preloader-media-wrapper">
        {PRELOADER_SLIDES.map((s, idx) => (
          <div
            key={s.id}
            className={`preloader-slide-img ${idx === currentIndex ? "active" : ""}`}
            style={{ backgroundImage: `url(${s.image})` }}
          />
        ))}
        <div className="preloader-backdrop-gradient" />
      </div>

      {/* Top Header Bar */}
      <div className="preloader-topbar">
        <div className="preloader-brand">
          <img src="/motkarta_drop_divided_black_red.svg" alt="Pin" className="preloader-pin-icon" />
          <img src="/logo.webp" alt="MOTKARTA" className="preloader-logo-img" />
          <span className="preloader-tag">{isSv ? "PRE-LOADER" : "INTRO"}</span>
        </div>

        <button
          type="button"
          className="preloader-skip-btn"
          onClick={onClose}
          aria-label="Skip intro"
        >
          <span>{isSv ? "Hoppa över" : "Skip intro"}</span>
          <X size={14} weight="bold" />
        </button>
      </div>

      {/* Center / Bottom Content Card */}
      <div className="preloader-content-container">
        <div className={`preloader-caption-box ${isFading ? "fading" : ""}`}>
          <div className="preloader-badge">
            <Sparkle size={12} weight="bold" />
            <span>{isSv ? slide.badgeSv : slide.badgeEn}</span>
          </div>

          <h1 className="preloader-title">{isSv ? slide.titleSv : slide.titleEn}</h1>
          <p className="preloader-desc">{isSv ? slide.descSv : slide.descEn}</p>

          {/* Stepper Dots & Navigation Controls */}
          <div className="preloader-controls">
            <div className="preloader-dots">
              {PRELOADER_SLIDES.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`preloader-dot ${idx === currentIndex ? "active" : ""}`}
                  onClick={() => goToSlide(idx)}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              className="preloader-next-btn"
              onClick={handleNextSlide}
            >
              <span>{isLast ? (isSv ? "ENTRÉ MOTKARTA" : "ENTER MOTKARTA") : (isSv ? "NÄSTA" : "NEXT")}</span>
              {isLast ? <ArrowRight size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
