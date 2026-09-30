import React, { useEffect, useState, useRef } from "react";
import { ArrowUp, ChatTeardropText, X } from "@phosphor-icons/react";
import type { Language } from "../app/shared";

interface SiteUtilitiesProps {
  lang: Language;
  isDrawerOpen?: boolean;
}

export function SiteUtilities({ lang, isDrawerOpen = false }: SiteUtilitiesProps) {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const panelRef = useRef<HTMLFormElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Close contact panel when clicking outside
  useEffect(() => {
    if (!isContactOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(event.target as Node)
      ) {
        setIsContactOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsContactOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isContactOpen]);

  const scrollToTop = () => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scrollOpts: ScrollToOptions = { top: 0, behavior: prefersReduced ? "instant" : "smooth" };
    window.scrollTo(scrollOpts);
    document.documentElement?.scrollTo?.(scrollOpts);
    document.body?.scrollTo?.(scrollOpts);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    setStatus(null);

    // Save to localStorage or console log for feedback recording
    try {
      const existingSubmissions = JSON.parse(localStorage.getItem("motkarta_contact_submissions") || "[]");
      existingSubmissions.push({
        name,
        email,
        message,
        timestamp: new Date().toISOString(),
      });
      localStorage.setItem("motkarta_contact_submissions", JSON.stringify(existingSubmissions));
    } catch {
      // Ignore storage errors
    }

    setTimeout(() => {
      setIsSubmitting(false);
      setStatus(
        lang === "sv"
          ? "Tack för ditt meddelande! Vi återkommer så snart vi kan."
          : "Thank you for reaching out! We will get back to you shortly."
      );
      setName("");
      setEmail("");
      setMessage("");

      setTimeout(() => {
        setIsContactOpen(false);
        setStatus(null);
      }, 3500);
    }, 400);
  };

  if (isDrawerOpen) return null;

  return (
    <div className="site-utilities" aria-label={lang === "sv" ? "Snabbval" : "Quick actions"}>
      <button
        className={`back-to-top ${showBackToTop ? "is-visible" : ""}`}
        type="button"
        onClick={scrollToTop}
        aria-label={lang === "sv" ? "Till toppen" : "Back to top"}
        title={lang === "sv" ? "Till toppen" : "Back to top"}
      >
        <ArrowUp size={20} weight="bold" />
      </button>

      <div className="contact-widget">
        <button
          ref={toggleBtnRef}
          className="contact-toggle"
          type="button"
          onClick={() => setIsContactOpen((prev) => !prev)}
          aria-expanded={isContactOpen}
          aria-label={lang === "sv" ? "Prata med oss" : "Talk to us"}
        >
          <ChatTeardropText size={18} weight="bold" />
          <span>{lang === "sv" ? "Prata med oss" : "Ask us"}</span>
        </button>

        {isContactOpen && (
          <form ref={panelRef} className="contact-panel" onSubmit={handleSubmit}>
            <div className="contact-panel-header">
              <p>Motkarta Studio</p>
              <button
                type="button"
                onClick={() => setIsContactOpen(false)}
                aria-label={lang === "sv" ? "Stäng kontaktformulär" : "Close contact form"}
                className="icon-btn"
              >
                <X size={20} weight="bold" />
              </button>
            </div>

            <label>
              <span>{lang === "sv" ? "Namn" : "Name"}</span>
              <input
                name="name"
                type="text"
                placeholder={lang === "sv" ? "Ditt namn" : "Your name"}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label>
              <span>{lang === "sv" ? "E-post" : "Email"}</span>
              <input
                name="email"
                type="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label>
              <span>{lang === "sv" ? "Meddelande" : "Message"}</span>
              <textarea
                name="message"
                rows={4}
                placeholder={
                  lang === "sv"
                    ? "Berätta vad du letar efter eller ställ en fråga..."
                    : "Tell us what you are looking for..."
                }
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>

            <button className="contact-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? lang === "sv"
                  ? "Skickar..."
                  : "Sending..."
                : lang === "sv"
                  ? "Skicka meddelande"
                  : "Send message"}
            </button>

            {status && (
              <p className="contact-status" role="status">
                {status}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
