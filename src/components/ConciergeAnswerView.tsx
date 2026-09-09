import { useMemo, useState } from "react";
import { parseConciergeAnswer } from "../../lib/concierge-parser";
import type { ConciergeResponse } from "../../lib/concierge/contracts";
import { safeUrl } from "../../lib/concierge/facts";
import { resolveConciergeMapPlace } from "../../lib/concierge/map-identity";
import type { PlaceInput } from "../../lib/scoring";
import type { Language } from "../app/shared";
import { ArrowSquareOut, CheckCircle, Globe, MagnifyingGlass, MapPin, MapTrifold, PlusCircle, Sliders, Sparkle, ThumbsDown, ThumbsUp, X } from "@phosphor-icons/react";
import { PlaceFeedbackModal } from "./PlaceFeedbackModal";

export function ConciergeAnswerView({
  answer,
  response,
  places,
  onSelectPlace,
  onRefineQuery,
  onTriggerAction,
  lang = "sv",
  onClose,
  messages,
}: {
  answer: string;
  response?: ConciergeResponse;
  places: PlaceInput[];
  onSelectPlace: (id: number) => void;
  onRefineQuery?: (extra: string) => void;
  onTriggerAction?: (action: 'add_place', prefillName?: string) => void;
  lang?: Language;
  onClose?: () => void;
  messages?: import("../../lib/concierge/contracts").ChatMessage[];
}) {
  const parsed = useMemo(() => response ? {
    intro: response.intro, cards: response.cards, charter: [],
    clarification: response.status === 'clarification' ? { queryTerm: response.query, question: response.intro } : undefined,
  } : parseConciergeAnswer(answer), [answer, response]);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<"up" | "down">("up");

  const handleSelect = (placeName: string, explicitId?: number) => {
    if (explicitId !== undefined) {
      onSelectPlace(explicitId);
      const target = document.getElementById("place-workspace") || document.getElementById("map");
      target?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    const cleanQuery = placeName
      .replace(/^\d+[\.\)]\s*/, "")
      .replace(/\s*\([^)]*\)/g, "")
      .trim()
      .toLowerCase();

    const match =
      places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase() === cleanQuery) ||
      places.find((p) => {
        const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        return pClean.startsWith(cleanQuery) || cleanQuery.startsWith(pClean);
      }) ||
      places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase().includes(cleanQuery)) ||
      places.find((p) => {
        const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        return cleanQuery.includes(pClean) && pClean.length > 4;
      }) ||
      places.find((p) => {
        const tokens = cleanQuery.split(/\s+/).filter((t) => t.length > 2);
        const pLower = p.name.toLowerCase();
        return tokens.length > 0 && tokens.every((t) => pLower.includes(t));
      });

    if (match) {
      onSelectPlace(match.id);
      const target = document.getElementById("place-workspace") || document.getElementById("map");
      target?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="concierge-results">
      {onClose ? (
        <div className="concierge-results-header">
          <span className="concierge-results-title-badge">
            <Sparkle size={15} weight="bold" /> {lang === "sv" ? "AI-Concierge Svar" : "AI Concierge Result"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="concierge-results-dismiss-btn"
            title={lang === "sv" ? "Dölj svar" : "Dismiss"}
          >
            <X size={13} weight="bold" /> {lang === "sv" ? "Dölj svar" : "Dismiss"}
          </button>
        </div>
      ) : null}
      {messages && messages.length > 0 ? (
        <div className="concierge-chat-history">
          <div className="concierge-chat-history-title">
            💬 {lang === "sv" ? "Konversationshistorik" : "Conversation History"}
          </div>
          {messages.map((msg, idx) => (
            <div key={idx} className="concierge-chat-bubble">
              <strong className={`concierge-chat-role ${msg.role}`}>
                {msg.role === "user" ? (lang === "sv" ? "Du" : "You") : "Concierge"}:
              </strong>{" "}
              <span>{msg.content}</span>
            </div>
          ))}
        </div>
      ) : null}
      {parsed.clarification ? (
        <div className="concierge-clarification-box">
          <p className="concierge-clarification-title"><Sliders size={16} /> {lang === 'sv' ? 'Förtydliga sökningen' : 'Refine your search'}</p>
          <p className="concierge-clarification-question">{parsed.clarification.question}</p>
          <form onSubmit={(event) => {
            event.preventDefault();
            const input = event.currentTarget.elements.namedItem('refinedQuery') as HTMLInputElement;
            if (input.value.trim()) onRefineQuery?.(input.value.trim());
          }} className="concierge-clarification-form">
            <input name="refinedQuery" type="text" maxLength={1000}
              aria-label={lang === 'sv' ? 'Ny sökning' : 'New search'}
              placeholder={lang === 'sv' ? 'T.ex. pierogi på Södermalm' : 'E.g. pierogi in Södermalm'}
              className="concierge-clarification-input" />
            <button type="submit" className="concierge-btn primary">{lang === 'sv' ? 'Sök igen' : 'Search again'}</button>
          </form>
        </div>
      ) : parsed.intro ? <p className="concierge-intro">{parsed.intro}</p> : null}

      {parsed.cards.length === 0 && (response?.query || answer) ? (
        <div className="concierge-web-fallback">
          <div className="concierge-web-fallback-header">
            <Globe size={16} weight="bold" />
            <span>{lang === "sv" ? "Hittar du inte det du söker i katalogen?" : "Can't find what you're looking for in the catalog?"}</span>
          </div>
          <p className="concierge-web-fallback-desc">
            {lang === "sv"
              ? "Sök på öppna webben eller tipsa oss om ett oberoende ställe i Stockholm så lägger vi till det!"
              : "Search the open web or suggest an independent Stockholm place to have it added to Motkarta!"}
          </p>
          <div className="concierge-web-fallback-actions">
            {response?.webSearch?.links ? (
              response.webSearch.links.map((link) => (
                <a
                  key={link.provider}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`concierge-web-btn ${link.provider}`}
                >
                  <MagnifyingGlass size={13} weight="bold" /> {link.title} <ArrowSquareOut size={12} />
                </a>
              ))
            ) : (
              <>
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${response?.query || answer} Stockholm café restaurang mat`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="concierge-web-btn google"
                >
                  <MagnifyingGlass size={13} weight="bold" /> {lang === "sv" ? "Sök på Google" : "Search on Google"} <ArrowSquareOut size={12} />
                </a>
                <a
                  href={`https://duckduckgo.com/?q=${encodeURIComponent(`${response?.query || answer} Stockholm mat café`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="concierge-web-btn duckduckgo"
                >
                  <Globe size={13} weight="bold" /> {lang === "sv" ? "Sök på DuckDuckGo" : "Search on DuckDuckGo"} <ArrowSquareOut size={12} />
                </a>
              </>
            )}
            <button
              type="button"
              onClick={() => onTriggerAction?.('add_place', response?.query || undefined)}
              className="concierge-web-btn add-place"
            >
              <PlusCircle size={14} weight="bold" /> {lang === "sv" ? "Tipsa / Lägg till ställe" : "Suggest / Add place"}
            </button>
          </div>

          {response?.webSearch?.externalResults && response.webSearch.externalResults.length > 0 ? (
            <div className="concierge-external-results">
              <div className="concierge-external-results-title">
                🌐 {lang === "sv" ? "Externa webbträffar (ej verifierade i Motkarta än):" : "External web results (unverified in Motkarta):"}
              </div>
              <div className="concierge-external-results-list">
                {response.webSearch.externalResults.map((ext, extIdx) => (
                  <a
                    key={extIdx}
                    href={ext.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="concierge-external-result-card"
                  >
                    <div className="concierge-external-result-domain">{ext.domain}</div>
                    <div className="concierge-external-result-title">{ext.title} <ArrowSquareOut size={12} /></div>
                    {ext.snippet ? <div className="concierge-external-result-snippet">{ext.snippet}</div> : null}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {parsed.cards.map((card, idx) => {
        const cardNameClean = card.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
        const matchedPlace =
          (response && response.cards[idx] ? resolveConciergeMapPlace(response.cards[idx], places) : undefined) ||
          (card.id !== undefined ? places.find((p) => p.id === card.id) : undefined) ||
          places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase() === cardNameClean) ||
          places.find((p) => {
            const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
            return pClean.startsWith(cardNameClean) || cardNameClean.startsWith(pClean);
          }) ||
          places.find((p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase().includes(cardNameClean)) ||
          places.find((p) => {
            const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
            return cardNameClean.includes(pClean) && pClean.length > 4;
          });

        const areaStr = card.area ?? matchedPlace?.area ?? "Stockholm";
        const hoursConf = card.hoursConfidence ?? (lang === "sv" ? "Uppgift saknas" : "Unknown");
        const hasHours = Boolean(card.hoursConfidence && !card.hoursConfidence.toLowerCase().includes("saknas") && !card.hoursConfidence.toLowerCase().includes("unknown"));

        const queryStr = `${card.name} ${areaStr} Stockholm`;
        const osmUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(queryStr)}`;
        const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryStr)}`;
        const websiteUrl = safeUrl(card.website ?? matchedPlace?.website);

        return (
          <article key={card.id ?? `${card.name}-${idx}`} className="concierge-card">
            <div className="concierge-card-head">
              <h3 className="concierge-card-title">
                <button
                  type="button"
                  disabled={!matchedPlace && card.id === undefined}
                  onClick={() => handleSelect(card.name, matchedPlace?.id ?? card.id)}
                  title="Click to view and highlight on map"
                >
                  {card.name}
                </button>
              </h3>
              <div className="concierge-badges">
                <span className="concierge-badge area">{areaStr}</span>
                <span className={`concierge-badge ${hasHours ? "high" : "low"}`}>
                  {hasHours ? `🕒 ${lang === "sv" ? "Listade tider" : "Listed hours"}` : (lang === "sv" ? "⚠️ Öppettider saknas" : "⚠️ Hours missing")}
                </span>
              </div>
            </div>

            {card.whyItMatches ? (
              <div className="concierge-match-box">
                <b>{lang === 'sv' ? 'Varför det matchar:' : 'Why it matches:'}</b> {card.whyItMatches}
              </div>
            ) : null}

            <div className="concierge-details">
              {card.hoursConfidence ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">{lang === 'sv' ? 'Öppettider:' : 'Opening Hours:'}</span>
                  <span>{card.hoursConfidence}</span>
                </div>
              ) : null}

              {card.priceConfidence ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">{lang === 'sv' ? 'Prisuppgift:' : 'Price Info:'}</span>
                  <span>{card.priceConfidence}</span>
                </div>
              ) : null}

              {card.dataSources ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">{lang === 'sv' ? 'Källor:' : 'Data Sources:'}</span>
                  <span>{card.dataSources}</span>
                </div>
              ) : null}

              {card.lastVerified ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">{lang === 'sv' ? 'Senast verifierat:' : 'Last Verified:'}</span>
                  <span>{card.lastVerified}</span>
                </div>
              ) : null}

              {card.missingInfo ? (
                <div className="concierge-detail-row">
                  <span className="concierge-label">{lang === 'sv' ? 'Saknat eller osäkert:' : 'Missing/Uncertain Info:'}</span>
                  <span style={{ color: "#854d0e" }}>{card.missingInfo}</span>
                </div>
              ) : null}
            </div>

            {card.distanceKm !== undefined ? <p>{lang === 'sv' ? 'Avstånd' : 'Distance'}: {card.distanceKm.toFixed(1)} km</p> : null}
            {card.citations?.some((fact) => safeUrl(fact.url)) ? (
              <ul aria-label={lang === 'sv' ? 'Källor' : 'Sources'}>
                {Array.from(new Map(card.citations.filter((fact) => safeUrl(fact.url)).map((fact) => [fact.url, fact])).values()).map((fact) => (
                  <li key={fact.id}><a href={safeUrl(fact.url)} target="_blank" rel="noopener noreferrer">{fact.source}</a>{fact.capturedAt ? ` · ${fact.capturedAt.slice(0, 10)}` : ''}</li>
                ))}
              </ul>
            ) : null}
            <div className="concierge-actions">
              <button
                type="button"
                className="concierge-btn primary"
                disabled={!matchedPlace && card.id === undefined}
                onClick={() => handleSelect(card.name, matchedPlace?.id ?? card.id)}
              >
                <MapPin size={14} weight="fill" /> {lang === 'sv' ? 'Visa på kartan' : 'Select on Map'}
              </button>
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="concierge-btn"
              >
                <MapTrifold size={14} weight="bold" /> Google Maps <ArrowSquareOut size={11} />
              </a>
              <a
                href={osmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="concierge-btn"
              >
                <Globe size={14} weight="bold" /> OpenStreetMap <ArrowSquareOut size={11} />
              </a>
              {websiteUrl ? (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="concierge-btn"
                >
                  <ArrowSquareOut size={14} weight="bold" /> Website
                </a>
              ) : null}
            </div>
          </article>
        );
      })}

      {parsed.charter.length ? (
        <div className="concierge-charter-box">
          <div className="concierge-charter-title">Ethical & Technical Charter</div>
          <div className="concierge-charter-list">
            {parsed.charter.map((bullet, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle size={14} weight="fill" style={{ color: "#8ed6b5", flexShrink: 0 }} />
                {bullet}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="concierge-feedback-bar">
        <span className="concierge-feedback-label">
          {lang === "sv" ? "Var svaret hjälpsamt?" : "Was this recommendation helpful?"}
        </span>

        <div className="concierge-feedback-actions">
          <button
            type="button"
            className={`feedback-btn ${feedback === "up" ? "active-up" : ""}`}
            onClick={() => {
              setFeedback("up");
              setFeedbackType("up");
              setIsFeedbackModalOpen(true);
            }}
            title={lang === "sv" ? "Hjälpsamt (Tummen upp)" : "Helpful (Thumbs up)"}
          >
            <ThumbsUp size={14} weight={feedback === "up" ? "fill" : "bold"} />
            {lang === "sv" ? "Ja" : "Yes"}
          </button>
          <button
            type="button"
            className={`feedback-btn ${feedback === "down" ? "active-down" : ""}`}
            onClick={() => {
              setFeedback("down");
              setFeedbackType("down");
              setIsFeedbackModalOpen(true);
            }}
            title={lang === "sv" ? "Inte hjälpsamt (Tummen ner)" : "Not helpful (Thumbs down)"}
          >
            <ThumbsDown size={14} weight={feedback === "down" ? "fill" : "bold"} />
            {lang === "sv" ? "Nej" : "No"}
          </button>
        </div>

        {feedback ? (
          <span className={`concierge-feedback-thanks ${feedback}`}>
            {feedback === "up"
              ? lang === "sv"
                ? "Tack för din feedback! 👍"
                : "Thanks for your feedback! 👍"
              : lang === "sv"
                ? "Tack! Vi förbättrar källorna. 👎"
                : "Thanks! We'll improve our sources. 👎"}
          </span>
        ) : null}
      </div>

      <PlaceFeedbackModal
        isOpen={isFeedbackModalOpen}
        targetId={response?.cards?.[0]?.id ?? 0}
        targetName={response?.cards?.[0]?.name ?? (lang === "sv" ? "Concierge-rekommendation" : "Concierge Recommendation")}
        initialType={feedbackType}
        lang={lang}
        onClose={() => setIsFeedbackModalOpen(false)}
      />

      <div className="concierge-follow-up-box">
        <div className="concierge-follow-up-title">
          💬 {lang === "sv" ? "Ställ en följdfråga" : "Ask a follow-up question"}
        </div>
        <div className="concierge-follow-up-chips">
          <button
            type="button"
            className="concierge-btn"
            onClick={() => onRefineQuery?.(lang === "sv" ? "Ge mig fler ställen" : "Show more places")}
          >
            ➕ {lang === "sv" ? "Fler förslag" : "More places"}
          </button>
          <button
            type="button"
            className="concierge-btn"
            onClick={() => onRefineQuery?.(lang === "sv" ? "På Södermalm då?" : "In Södermalm?")}
          >
            📍 {lang === "sv" ? "På Söder då?" : "In Södermalm?"}
          </button>
          <button
            type="button"
            className="concierge-btn"
            onClick={() => onRefineQuery?.(lang === "sv" ? "Något billigare alternativ?" : "More affordable options?")}
          >
            🏷️ {lang === "sv" ? "Billigare alternativ" : "Budget friendly"}
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem("followUpQuery") as HTMLInputElement;
            if (input && input.value.trim()) {
              onRefineQuery?.(input.value.trim());
              input.value = "";
            }
          }}
          className="concierge-follow-up-form"
        >
          <input
            name="followUpQuery"
            type="text"
            maxLength={1000}
            placeholder={lang === "sv" ? "T.ex. Vilka av dessa har öppet på söndagar?" : "E.g. Which of these are open on Sundays?"}
            className="concierge-follow-up-input"
          />
          <button type="submit" className="concierge-btn primary">
            {lang === "sv" ? "Skicka följdfråga" : "Send follow-up"}
          </button>
        </form>
      </div>
    </div>
  );
}
