import React, { useState } from "react";
import { ThumbsUp, ThumbsDown, X, Check, ChatText, Sparkle } from "@phosphor-icons/react";
import type { Language } from "../app/shared";

export interface FeedbackData {
  targetId: number | string;
  targetName: string;
  isPositive: boolean;
  selectedReasons: string[];
  comment: string;
  timestampMs: number;
}

export interface PlaceFeedbackModalProps {
  isOpen: boolean;
  targetId: number | string;
  targetName: string;
  initialType?: "up" | "down";
  mode?: "standard" | "nominate_gem";
  lang: Language;
  onClose: () => void;
  onSubmitFeedback?: (data: FeedbackData) => void;
}

const POSITIVE_REASONS_SV = [
  "Bra stämning & härlig miljö",
  "Genuint & fantastisk mat/kaffe",
  "Exakt rätt område & bra läge",
  "Bra ny upptäckt & dold pärla",
  "Prisvärt & bra meny",
];

const POSITIVE_REASONS_EN = [
  "Great atmosphere & vibe",
  "Authentic & fantastic food/coffee",
  "Accurate area & great location",
  "Great hidden gem discovery",
  "Good value for money",
];

const NEGATIVE_REASONS_SV = [
  "Ändrade öppettider eller permanent stängt",
  "Motsvarade inte förväntan eller fel kök",
  "Inte en äkta dold pärla / för kommersiellt",
  "För dyrt i förhållande till kvalitet",
  "Felaktig plats eller adress på kartan",
];

const NEGATIVE_REASONS_EN = [
  "Outdated hours or closed",
  "Did not match expectations or wrong cuisine",
  "Not a real hidden gem / too mainstream",
  "Overpriced for quality",
  "Incorrect location or address on map",
];

const GEM_REASONS_SV = [
  "Hantverk / Eget bageri eller rosteri",
  "Lokal doldis utan marknadsföring",
  "Unikt koncept & exceptionell kvalitet",
  "Familjeägt / Liten lokal eldsjäl",
  "Prisvärt & genuint smultronställe",
];

const GEM_REASONS_EN = [
  "Craft / In-house baking or roasting",
  "Local favorite with minimal marketing",
  "Unique concept & exceptional quality",
  "Family-owned / Passionate local team",
  "Great value & authentic neighborhood gem",
];

export function PlaceFeedbackModal({
  isOpen,
  targetId,
  targetName,
  initialType = "up",
  mode = "standard",
  lang,
  onClose,
  onSubmitFeedback,
}: PlaceFeedbackModalProps) {
  const isNominateGem = mode === "nominate_gem";
  const [feedbackType, setFeedbackType] = useState<"up" | "down">(initialType);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (!isOpen) return null;

  const reasons = isNominateGem
    ? lang === "sv"
      ? GEM_REASONS_SV
      : GEM_REASONS_EN
    : feedbackType === "up"
    ? lang === "sv"
      ? POSITIVE_REASONS_SV
      : POSITIVE_REASONS_EN
    : lang === "sv"
    ? NEGATIVE_REASONS_SV
    : NEGATIVE_REASONS_EN;

  const toggleReason = (reason: string) => {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: FeedbackData = {
      targetId,
      targetName,
      isPositive: isNominateGem ? true : feedbackType === "up",
      selectedReasons,
      comment: comment.trim(),
      timestampMs: Date.now(),
    };

    if (isNominateGem) {
      // 1. Save to user nominated gems in localStorage
      try {
        const existingRaw = localStorage.getItem("motkarta_user_nominated_gems");
        const existing: Record<string, unknown>[] = existingRaw ? JSON.parse(existingRaw) : [];
        existing.push({
          targetId,
          targetName,
          selectedReasons,
          comment: comment.trim(),
          timestampMs: Date.now(),
        });
        localStorage.setItem("motkarta_user_nominated_gems", JSON.stringify(existing.slice(-100)));
      } catch {
        // Ignore storage errors
      }

      // 2. Post nomination event to recommendation telemetry backend API
      void fetch("/api/recommendation-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              eventType: "would_return",
              establishmentId: typeof targetId === "number" ? targetId : 0,
              mode: "hidden_gems",
              sortMode: "motkarta",
              queryContextJson: JSON.stringify({
                action: "nominate_hidden_gem",
                targetName,
                selectedReasons,
                comment: comment.trim(),
              }),
              contextWindowSize: 1,
              clientTimestampMs: Date.now(),
            },
          ],
        }),
      }).catch(() => {});
    } else {
      // Standard feedback logic
      try {
        const existingRaw = localStorage.getItem("motkarta_rag_learning_feedback");
        const existing: FeedbackData[] = existingRaw ? JSON.parse(existingRaw) : [];
        existing.push(data);
        localStorage.setItem("motkarta_rag_learning_feedback", JSON.stringify(existing.slice(-100)));
      } catch {
        // Ignore storage errors
      }

      void fetch("/api/recommendation-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              eventType: feedbackType === "up" ? "would_return" : "rejected",
              establishmentId: typeof targetId === "number" ? targetId : 0,
              mode: "fast_feedback",
              sortMode: "motkarta",
              queryContextJson: JSON.stringify({
                targetName,
                feedbackType,
                selectedReasons,
                comment: comment.trim(),
              }),
              contextWindowSize: 1,
              clientTimestampMs: Date.now(),
            },
          ],
        }),
      }).catch(() => {});
    }

    if (onSubmitFeedback) {
      onSubmitFeedback(data);
    }

    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      onClose();
    }, 1400);
  };

  return (
    <div
      className="sync-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        boxSizing: "border-box",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        className="feedback-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-white, #ffffff)",
          border: "1px solid var(--color-mist, #e2e8f0)",
          borderRadius: "16px",
          maxWidth: "480px",
          width: "100%",
          maxHeight: "calc(100dvh - 32px)",
          overflowY: "auto",
          padding: "24px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.18)",
          position: "relative",
          margin: "auto",
          boxSizing: "border-box",
          animation: "modalFadeIn 0.2s ease-out",
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-slate-500, #64748b)",
            padding: "4px",
            borderRadius: "50%",
          }}
          aria-label="Close"
        >
          <X size={20} weight="bold" />
        </button>

        {isSubmitted ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                background: isNominateGem ? "#fef3c7" : "#dcfce7",
                color: isNominateGem ? "#b45309" : "#166534",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isNominateGem ? <Sparkle size={28} weight="fill" /> : <Check size={28} weight="bold" />}
            </div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "var(--color-ink)" }}>
              {isNominateGem
                ? (lang === "sv" ? "Tack för din nominering!" : "Thank you for your nomination!")
                : (lang === "sv" ? "Tack för din feedback!" : "Thank you for your feedback!")}
            </h3>
            <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>
              {isNominateGem
                ? (lang === "sv"
                    ? "Sparad som din personliga pärla och skickad till redaktionens granskning."
                    : "Saved as your personal gem and forwarded for editorial review.")
                : (lang === "sv"
                    ? "Dina synpunkter förbättrar RAG-modellen och rekommendationerna."
                    : "Your insights continuously train our RAG engine and recommendations.")}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: isNominateGem ? "#d97706" : "var(--color-water, #2563eb)",
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <Sparkle size={14} weight={isNominateGem ? "fill" : "bold"} />
                {isNominateGem
                  ? (lang === "sv" ? "Dold pärla nominering" : "Hidden gem nomination")
                  : (lang === "sv" ? "Feedback loop" : "Feedback loop")}
              </div>
              <h3 style={{ margin: "4px 0 0 0", fontSize: "18px", fontWeight: 700, color: "var(--color-ink)" }}>
                {targetName}
              </h3>
            </div>

            {/* Banner or Up / Down Selection */}
            {isNominateGem ? (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "10px",
                  padding: "12px",
                  marginBottom: "16px",
                  fontSize: "13px",
                  color: "#92400e",
                  lineHeight: 1.4,
                }}
              >
                {lang === "sv"
                  ? "Vad gör denna plats till en sann dold pärla? Ditt tips sparas som din personliga pärla och granskas för officiell märkning."
                  : "What makes this place a true hidden gem? Your tip is saved as your personal gem and reviewed for official badge promotion."}
              </div>
            ) : (
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setFeedbackType("up");
                    setSelectedReasons([]);
                  }}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: `2px solid ${feedbackType === "up" ? "#2563eb" : "#e2e8f0"}`,
                    background: feedbackType === "up" ? "#eff6ff" : "#ffffff",
                    color: feedbackType === "up" ? "#1e40af" : "#475569",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <ThumbsUp size={18} weight={feedbackType === "up" ? "fill" : "bold"} />
                  {lang === "sv" ? "Hjälpsam / Bra" : "Helpful / Good"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFeedbackType("down");
                    setSelectedReasons([]);
                  }}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: `2px solid ${feedbackType === "down" ? "#dc2626" : "#e2e8f0"}`,
                    background: feedbackType === "down" ? "#fef2f2" : "#ffffff",
                    color: feedbackType === "down" ? "#991b1b" : "#475569",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <ThumbsDown size={18} weight={feedbackType === "down" ? "fill" : "bold"} />
                  {lang === "sv" ? "Inte hjälpsam" : "Not helpful"}
                </button>
              </div>
            )}

            {/* Checkmark Statements */}
            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "#475569",
                  marginBottom: "8px",
                }}
              >
                {isNominateGem
                  ? (lang === "sv" ? "Hantverk & unika egenskaper" : "Craft & unique attributes")
                  : (lang === "sv" ? "Vad beror det på? (välj en eller flera)" : "Why specifically? (select one or more)")}
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {reasons.map((reason) => {
                  const isChecked = selectedReasons.includes(reason);
                  const activeBorder = isNominateGem ? "#d97706" : "#2563eb";
                  const activeBg = isNominateGem ? "#fef3c7" : "#f0f9ff";
                  const activeColor = isNominateGem ? "#92400e" : "#0369a1";
                  return (
                    <label
                      key={reason}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        border: `1px solid ${isChecked ? activeBorder : "#f1f5f9"}`,
                        background: isChecked ? activeBg : "#f8fafc",
                        fontSize: "13px",
                        color: isChecked ? activeColor : "#334155",
                        cursor: "pointer",
                        fontWeight: isChecked ? 600 : 400,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleReason(reason)}
                        style={{ accentColor: isNominateGem ? "#d97706" : "#2563eb", width: "16px", height: "16px", cursor: "pointer" }}
                      />
                      <span>{reason}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Textarea Input */}
            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "#475569",
                  marginBottom: "6px",
                }}
              >
                <ChatText size={14} weight="bold" />
                {lang === "sv" ? "Övriga synpunkter (valfritt)" : "Additional notes (optional)"}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  isNominateGem
                    ? (lang === "sv"
                        ? "T.ex. deras surdegsbröd bakas i stenugn, eller de rostar bönorna själva..."
                        : "E.g. their sourdough is stone-baked, or they roast their own beans...")
                    : (lang === "sv"
                        ? "Berätta mer för att hjälpa RAG-modellen..."
                        : "Tell us more to train the RAG engine...")
                }
                rows={2}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Submit CTA Button */}
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                background: isNominateGem ? "#b45309" : "var(--color-water, #2563eb)",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "14px",
                border: "none",
                cursor: "pointer",
                boxShadow: isNominateGem
                  ? "0 4px 12px rgba(180, 83, 9, 0.25)"
                  : "0 4px 12px rgba(37, 99, 235, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {isNominateGem ? <Sparkle size={18} weight="fill" /> : <Check size={18} weight="bold" />}
              {isNominateGem
                ? (lang === "sv" ? "Tipsa & spara som din pärla" : "Nominate & save as your gem")
                : (lang === "sv" ? "Skicka feedback & lär RAG" : "Submit Feedback & Train RAG")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
