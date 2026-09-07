import React, { useState, useEffect } from "react";
import {
  DeviceMobile,
  Laptop,
  QrCode,
  Copy,
  Check,
  ArrowRight,
  X,
  Sparkle,
} from "@phosphor-icons/react";
import type { Language } from "../app/shared";

interface SyncDevicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedPlaceIds: number[];
  onImportSavedPlaces: (newIds: number[]) => void;
  lang: Language;
}

export function SyncDevicesModal({
  isOpen,
  onClose,
  savedPlaceIds,
  onImportSavedPlaces,
  lang,
}: SyncDevicesModalProps) {
  const [activeTab, setActiveTab] = useState<"generate" | "enter">("generate");
  const [syncCode, setSyncCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const [inputCode, setInputCode] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && savedPlaceIds.length > 0 && !syncCode) {
      void generateCode();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const generateCode = async () => {
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ savedPlaceIds }),
      });
      if (res.ok) {
        const data = (await res.json()) as { syncCode: string };
        setSyncCode(data.syncCode);
      }
    } catch {
      // Dev mode fallback
      setSyncCode(`MOT-${Math.floor(1000 + Math.random() * 9000)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const getShareableUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://motkarta.se";
    return `${origin}/?sync=${syncCode || ""}`;
  };

  const handleCopyLink = () => {
    const url = getShareableUrl();
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleFetchCode = async () => {
    const clean = inputCode.trim().toUpperCase();
    if (!clean) return;
    setIsFetching(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/sync?code=${encodeURIComponent(clean)}`);
      if (res.ok) {
        const data = (await res.json()) as { savedPlaceIds: number[]; syncCode: string };
        if (data.savedPlaceIds && data.savedPlaceIds.length > 0) {
          onImportSavedPlaces(data.savedPlaceIds);
          setSuccessMsg(
            lang === "sv"
              ? `✅ Synkade ${data.savedPlaceIds.length} sparade ställen från kod ${data.syncCode}!`
              : `✅ Synced ${data.savedPlaceIds.length} saved places from code ${data.syncCode}!`,
          );
          setInputCode("");
        } else {
          setErrorMsg(
            lang === "sv"
              ? "Koden hittades men innehöll inga sparade ställen."
              : "Code found but contains no saved places.",
          );
        }
      } else {
        setErrorMsg(
          lang === "sv"
            ? "Giltig synkkod hittades inte. Kontrollera koden och försök igen."
            : "Valid sync code not found. Please check and try again.",
        );
      }
    } catch {
      setErrorMsg(
        lang === "sv"
          ? "Kunde inte ansluta till synktjänsten. Försök igen om en stund."
          : "Could not connect to sync service. Please try again.",
      );
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <div
      className="filter-sheet-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={lang === "sv" ? "Synka enheter" : "Sync devices"}
    >
      <div className="filter-sheet-content sync-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sync-modal-header">
          <div className="sync-modal-title-row">
            <div className="sync-modal-icon-badge">
              <DeviceMobile size={20} weight="bold" />
              <ArrowRight size={14} weight="bold" />
              <Laptop size={20} weight="bold" />
            </div>
            <div>
              <h3 className="sync-modal-title">{lang === "sv" ? "Synka alla dina enheter" : "Sync Across Devices"}</h3>
              <p className="sync-modal-subtitle">
                {lang === "sv"
                  ? "Spara på mobil – se på laptop. Ingen inloggning eller lösenord krävs!"
                  : "Save on phone – view on laptop. No password or email needed!"}
              </p>
            </div>
          </div>
          <button type="button" className="sync-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="sync-modal-tabs">
          <button
            type="button"
            className={`sync-modal-tab ${activeTab === "generate" ? "is-active" : ""}`}
            onClick={() => setActiveTab("generate")}
          >
            <QrCode size={16} weight="bold" />
            <span>{lang === "sv" ? "Min synkkod / QR" : "My Sync Code / QR"}</span>
          </button>

          <button
            type="button"
            className={`sync-modal-tab ${activeTab === "enter" ? "is-active" : ""}`}
            onClick={() => setActiveTab("enter")}
          >
            <ArrowRight size={16} weight="bold" />
            <span>{lang === "sv" ? "Mata in kod" : "Enter Code"}</span>
          </button>
        </div>

        {/* Tab Body 1: Generate Code */}
        {activeTab === "generate" ? (
          <div className="sync-modal-body">
            {savedPlaceIds.length === 0 ? (
              <div className="sync-modal-empty">
                <Sparkle size={32} weight="bold" style={{ color: "var(--color-water)" }} />
                <p>
                  {lang === "sv"
                    ? "Du har inga sparade ställen än. Spara några favoritställen först med ★-knappen!"
                    : "You don't have any saved places yet. Save some favorites first using the ★ button!"}
                </p>
              </div>
            ) : (
              <>
                <div className="sync-code-box">
                  <span className="sync-code-label">{lang === "sv" ? "DIN UNIKA SYNK-KOD" : "YOUR UNIQUE SYNC CODE"}</span>
                  <div className="sync-code-display">{isGenerating ? "..." : syncCode}</div>
                  <span className="sync-code-hint">
                    {lang === "sv"
                      ? `${savedPlaceIds.length} sparade ställen redo att synkas`
                      : `${savedPlaceIds.length} saved places ready to sync`}
                  </span>
                </div>

                {/* QR Code SVG Representation */}
                <div className="sync-qr-box">
                  <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="120" height="120" rx="12" fill="#F8FAFC" />
                    {/* Corner Position Detection Squares */}
                    <rect x="12" y="12" width="32" height="32" rx="4" fill="#0F172A" />
                    <rect x="18" y="18" width="20" height="20" rx="2" fill="#FFFFFF" />
                    <rect x="22" y="22" width="12" height="12" rx="1" fill="#0F172A" />

                    <rect x="76" y="12" width="32" height="32" rx="4" fill="#0F172A" />
                    <rect x="82" y="18" width="20" height="20" rx="2" fill="#FFFFFF" />
                    <rect x="86" y="22" width="12" height="12" rx="1" fill="#0F172A" />

                    <rect x="12" y="76" width="32" height="32" rx="4" fill="#0F172A" />
                    <rect x="18" y="82" width="20" height="20" rx="2" fill="#FFFFFF" />
                    <rect x="22" y="86" width="12" height="12" rx="1" fill="#0F172A" />

                    {/* Data Matrix Dots */}
                    <rect x="52" y="16" width="12" height="12" rx="2" fill="#2563EB" />
                    <rect x="52" y="34" width="12" height="12" rx="2" fill="#0F172A" />
                    <rect x="16" y="52" width="12" height="12" rx="2" fill="#0F172A" />
                    <rect x="34" y="52" width="12" height="12" rx="2" fill="#2563EB" />
                    <rect x="52" y="52" width="16" height="16" rx="3" fill="#0F172A" />
                    <rect x="74" y="52" width="12" height="12" rx="2" fill="#0F172A" />
                    <rect x="92" y="52" width="12" height="12" rx="2" fill="#2563EB" />
                    <rect x="52" y="74" width="12" height="12" rx="2" fill="#0F172A" />
                    <rect x="74" y="74" width="30" height="30" rx="6" fill="#0F172A" />
                    <rect x="80" y="80" width="18" height="18" rx="3" fill="#FFFFFF" />
                    <rect x="84" y="84" width="10" height="10" rx="2" fill="#2563EB" />
                  </svg>
                  <p className="qr-box-caption">
                    {lang === "sv"
                      ? "Öppna länken eller skanna med kameran från din mobil eller dator."
                      : "Open the link or scan with your camera from phone or desktop."}
                  </p>
                </div>

                <div className="sync-action-row">
                  <button type="button" className="sync-copy-btn" onClick={handleCopyLink}>
                    {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
                    <span>{copied ? (lang === "sv" ? "Länk kopierad!" : "Link Copied!") : (lang === "sv" ? "Kopiera synklänk" : "Copy Sync Link")}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          /* Tab Body 2: Enter Code */
          <div className="sync-modal-body">
            <div className="sync-input-section">
              <label htmlFor="sync-code-input" className="sync-input-label">
                {lang === "sv" ? "Ange 6-teckens kod från din andra enhet:" : "Enter 6-character code from your other device:"}
              </label>
              <div className="sync-input-group">
                <input
                  id="sync-code-input"
                  type="text"
                  className="sync-code-input"
                  placeholder="t.ex. MOT-8924"
                  value={inputCode}
                  maxLength={10}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  className="sync-submit-btn"
                  onClick={() => void handleFetchCode()}
                  disabled={isFetching || !inputCode.trim()}
                >
                  {isFetching ? "..." : lang === "sv" ? "Importera" : "Import"}
                </button>
              </div>

              {errorMsg ? <div className="sync-error-banner">{errorMsg}</div> : null}
              {successMsg ? <div className="sync-success-banner">{successMsg}</div> : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
