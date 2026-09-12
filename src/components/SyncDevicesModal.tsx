import React, { useState, useEffect, useMemo } from "react";
import QRCode from "qrcode";
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
import { CANONICAL_SYNC_URL, getSyncShareableUrl } from "../app/sync-utils";
export { CANONICAL_SYNC_URL, getSyncShareableUrl };

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
  const [qrSvg, setQrSvg] = useState<string>("");
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);

  const [inputCode, setInputCode] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const shareableUrl = useMemo(() => {
    return getSyncShareableUrl(syncCode, savedPlaceIds);
  }, [syncCode, savedPlaceIds]);

  useEffect(() => {
    if (isOpen && savedPlaceIds.length > 0 && !syncCode) {
      void generateCode();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || savedPlaceIds.length === 0) {
      setQrSvg("");
      return;
    }
    let cancelled = false;
    setIsGeneratingQr(true);

    QRCode.toString(shareableUrl, {
      type: "svg",
      margin: 2,
      errorCorrectionLevel: "M",
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
    })
      .then((svg) => {
        if (!cancelled) {
          setQrSvg(svg);
          setIsGeneratingQr(false);
        }
      })
      .catch((err) => {
        console.error("QR generation failed", err);
        if (!cancelled) {
          setIsGeneratingQr(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shareableUrl, isOpen, savedPlaceIds.length]);

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

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(shareableUrl);
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

                {/* Real Scannable QR Code */}
                <div className="sync-qr-box">
                  {qrSvg ? (
                    <div
                      className="sync-qr-code-wrapper"
                      dangerouslySetInnerHTML={{ __html: qrSvg }}
                      role="img"
                      aria-label={lang === "sv" ? "QR-kod för att synka enheter" : "QR code to sync devices"}
                    />
                  ) : (
                    <div className="sync-qr-loading">
                      <span>{isGeneratingQr || isGenerating ? "..." : ""}</span>
                    </div>
                  )}
                  <div className="sync-qr-url-badge" title={shareableUrl}>
                    <span className="sync-qr-url-text">{shareableUrl}</span>
                  </div>
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
