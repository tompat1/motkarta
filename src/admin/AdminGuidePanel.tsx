import React, { useState } from "react";
import {
  BookOpen,
  CheckCircle,
  Copy,
  Info,
  Scales,
  ShieldCheck,
  Sparkle,
  TerminalWindow,
  X,
} from "@phosphor-icons/react";
import type { Language } from "../app/shared";

type GuideTab = "cadence" | "hidden_gems" | "ml_transparency" | "runbook";

interface AdminGuidePanelProps {
  lang: Language;
  onClose?: () => void;
}

export function AdminGuidePanel({ lang, onClose }: AdminGuidePanelProps) {
  const [activeTab, setActiveTab] = useState<GuideTab>("cadence");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  return (
    <div className="admin-guide-panel" role="region" aria-label={lang === "sv" ? "Admin guide och rutiner" : "Admin guide and runbook"}>
      <div className="admin-guide-header">
        <div className="admin-guide-title-wrap">
          <BookOpen size={20} weight="bold" className="admin-guide-icon" />
          <div>
            <h4>{lang === "sv" ? "Adminhandbok & ML-rutiner (SOP)" : "Admin Playbook & ML Runbook (SOP)"}</h4>
            <p>
              {lang === "sv"
                ? "Komplett lathund för daglig granskning, månadssynk, dolda pärlor och ML-transparens."
                : "Complete guide for daily triage, monthly syncs, hidden gems, and ML transparency."}
            </p>
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            className="admin-guide-close-btn"
            onClick={onClose}
            aria-label={lang === "sv" ? "Stäng guide" : "Close guide"}
          >
            <X size={18} weight="bold" />
          </button>
        ) : null}
      </div>

      <div className="admin-guide-nav">
        <button
          type="button"
          className={activeTab === "cadence" ? "active" : ""}
          onClick={() => setActiveTab("cadence")}
        >
          <ShieldCheck size={14} weight="bold" />
          {lang === "sv" ? "1. Rutiner & Triage" : "1. Cadence & Triage"}
        </button>
        <button
          type="button"
          className={activeTab === "hidden_gems" ? "active" : ""}
          onClick={() => setActiveTab("hidden_gems")}
        >
          <Sparkle size={14} weight="bold" />
          {lang === "sv" ? "2. Dolda Pärlor (Dubbellås)" : "2. Hidden Gems (Double-Lock)"}
        </button>
        <button
          type="button"
          className={activeTab === "ml_transparency" ? "active" : ""}
          onClick={() => setActiveTab("ml_transparency")}
        >
          <Scales size={14} weight="bold" />
          {lang === "sv" ? "3. ML & Rankingtransparens" : "3. ML & Ranking Transparency"}
        </button>
        <button
          type="button"
          className={activeTab === "runbook" ? "active" : ""}
          onClick={() => setActiveTab("runbook")}
        >
          <TerminalWindow size={14} weight="bold" />
          {lang === "sv" ? "4. Terminal Runbook" : "4. Terminal Runbook"}
        </button>
      </div>

      <div className="admin-guide-body">
        {activeTab === "cadence" && (
          <div className="admin-guide-section">
            <h5>{lang === "sv" ? "Dagliga & Periodiska Rutiner" : "Daily & Recurring Cadence"}</h5>

            <div className="admin-guide-cards-grid">
              <div className="admin-guide-card">
                <span className="admin-guide-badge cadence-daily">{lang === "sv" ? "Dagligen / Vid behov" : "Daily / As needed"}</span>
                <h6>{lang === "sv" ? "Kandidat-triage & Användartips" : "Candidate Triage & User Tips"}</h6>
                <ul>
                  <li>
                    {lang === "sv"
                      ? "Öppna fliken 'Kandidater'. Prioritera rader med '✨ X användartips' — dessa har nominerats av aktiva besökare i appen."
                      : "Open 'Candidates' tab. Prioritize rows with '✨ X user tips' — these were nominated by active app visitors."}
                  </li>
                  <li>
                    {lang === "sv"
                      ? "Kontrollera att platsen är oberoende och genuint mat/kaffehantverk (ej kommersiell kedja)."
                      : "Verify that the venue is independent with genuine food/coffee craft (no commercial chains)."}
                  </li>
                  <li>
                    {lang === "sv"
                      ? "Om kandidaten har 2+ oberoende källor: klicka 'Dold pärla' eller 'Mainstream' för att publicera."
                      : "If candidate has 2+ independent sources: click 'Hidden gem' or 'Mainstream' to publish."}
                  </li>
                </ul>
              </div>

              <div className="admin-guide-card">
                <span className="admin-guide-badge cadence-weekly">{lang === "sv" ? "Veckovis" : "Weekly"}</span>
                <h6>{lang === "sv" ? "Dubbletter & Geografisk Täckning" : "Duplicates & Regional Resolution"}</h6>
                <ul>
                  <li>
                    {lang === "sv"
                      ? "Granska gula dubblettboxar: Klicka 'Slå ihop' för att migrera bevis till befintlig plats, eller 'Behåll separat' om det är distinkta verksamheter."
                      : "Review yellow duplicate boxes: Click 'Merge' to migrate evidence to existing place, or 'Keep separate' if distinct businesses."}
                  </li>
                  <li>
                    {lang === "sv"
                      ? "Öppna fliken 'Saknar region'. Klicka 'Lös saknade regioner' för batch-upplösning mot polygoner, eller välj stadsdel manuellt i dropdownen."
                      : "Open 'Needs region' tab. Click 'Resolve missing regions' for batch polygon resolution, or pick district manually in dropdown."}
                  </li>
                  <li>
                    {lang === "sv"
                      ? "Fliken 'Behöver input': Lägg till webbadress och klicka 'Spara & hämta bild' för att auto-skrapa og:image (0.9 konfidens)."
                      : "Open 'Needs input' tab: Add website URL and click 'Save & scrape photo' to auto-extract og:image (0.9 confidence)."}
                  </li>
                </ul>
              </div>

              <div className="admin-guide-card">
                <span className="admin-guide-badge cadence-monthly">{lang === "sv" ? "Månadsvis" : "Monthly"}</span>
                <h6>{lang === "sv" ? "Månadssynk & Modellunderhåll" : "Monthly Sync & Model Maintenance"}</h6>
                <ul>
                  <li>
                    {lang === "sv"
                      ? "Kör månatlig Google Places synk (quarantined metadata + öppettider) via scripts/google_places_monthly_sync.py."
                      : "Run monthly Google Places sync (quarantined metadata + opening hours) via scripts/google_places_monthly_sync.py."}
                  </li>
                  <li>
                    {lang === "sv"
                      ? "Synka kurerade källor (Specialty Coffee mm) via scripts/sync-curated-sources.mjs."
                      : "Sync curated sources (Specialty Coffee etc) via scripts/sync-curated-sources.mjs."}
                  </li>
                  <li>
                    {lang === "sv"
                      ? "Kör drift-analys mot baslinje: python -m motkarta.drift för att kontrollera PSI och rättvisegrinder."
                      : "Run drift analysis against baseline: python -m motkarta.drift to verify PSI and representation gates."}
                  </li>
                  <li>
                    {lang === "sv"
                      ? "Granskningar sparas automatiskt i D1 i realtid. Du behöver inte exportera manuellt; synkning sker med ett klick via 'Synka pipeline direkt' eller CLI: npm run sync:labels."
                      : "Reviews are auto-saved to D1 in real-time. No manual downloads needed; sync happens with 1 click via 'Sync pipeline directly' or CLI: npm run sync:labels."}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === "hidden_gems" && (
          <div className="admin-guide-section">
            <h5>{lang === "sv" ? "Dolda Pärlor: Dubbellås-regeln & Karantänpolicy" : "Hidden Gems: Double-Lock Rule & Quarantine Policy"}</h5>

            <div className="admin-guide-alert-box info">
              <Sparkle size={18} weight="bold" />
              <div>
                <strong>{lang === "sv" ? "Icke-förhandlingsbar ML-princip:" : "Non-negotiable ML principle:"}</strong>
                <p>
                  {lang === "sv"
                    ? "Residualer är inte kvalitet, och anomalier är inte dolda pärlor. Kommersiella recensioner från Google/TripAdvisor hålls i strikt karantän och kan ALDRIG kvalificera en plats som dold pärla."
                    : "Residuals are not quality, and anomalies are not hidden gems. Commercial platform reviews (Google/TripAdvisor) remain strictly quarantined and can NEVER qualify a place as a hidden gem."}
                </p>
              </div>
            </div>

            <div className="admin-guide-flow-step">
              <span className="step-num">Lås 1</span>
              <div>
                <strong>{lang === "sv" ? "Användarinitierat intresse (Community Tipping)" : "Community Interest Signal (User Tipping)"}</strong>
                <p>
                  {lang === "sv"
                    ? "Besökare kan klicka '✨ Tipsa som dold pärla' på platskortet. Detta sparas lokalt som 'Din pärla' och skickar en anonym telemetrihändelse. Detta syns i adminkön som '✨ X användartips'."
                    : "Visitors click '✨ Nominate as hidden gem' on place cards. Saved locally as 'Your gem' and emits an anonymous telemetry event. Displayed in admin as '✨ X user tips'."}
                </p>
              </div>
            </div>

            <div className="admin-guide-flow-step">
              <span className="step-num">Lås 2</span>
              <div>
                <strong>{lang === "sv" ? "Oberoende evidensgrind (Admin Double-Lock)" : "Independent Evidence Gate (Admin Double-Lock)"}</strong>
                <p>
                  {lang === "sv"
                    ? "För att knappen 'Dold pärla' ska aktiveras MÅSTE kandidaten ha minst två verifierade oberoende källor (t.ex. OSM + kommunal livsmedelskontroll, officiell webbplats, eller kurerad guide). Kommersiella Google-metadata räknas inte."
                    : "To enable the 'Hidden gem' button, the candidate MUST possess at least 2 verified independent sources (e.g. OSM + municipal food control, official website, or curated guide). Commercial Google metadata does not count."}
                </p>
              </div>
            </div>

            <div className="admin-guide-flow-step">
              <span className="step-num">Auto</span>
              <div>
                <strong>{lang === "sv" ? "Deterministisk körningskontroll (Runtime Safety Gate)" : "Deterministic Runtime Guard (Runtime Safety Gate)"}</strong>
                <p>
                  {lang === "sv"
                    ? "Även om en plats godkänns av admin övervakar motkarta runtime-poängsättningen evaluateHiddenGemGates löpande. Om platsen blir en kedja, tappar oberoende källor eller stänger, fråntas märket omedelbart."
                    : "Even after admin approval, motkarta evaluateHiddenGemGates guards places dynamically. If a venue becomes a chain or loses independent verification, the badge is immediately stripped."}
                </p>
              </div>
            </div>

            <div className="admin-guide-card" style={{ marginTop: 14 }}>
              <h6>{lang === "sv" ? "Var markerar du en dold pärla som admin?" : "Where to mark a Hidden Gem as admin?"}</h6>
              <ul style={{ paddingLeft: 16, margin: "6px 0", lineHeight: 1.5 }}>
                <li>
                  <strong>{lang === "sv" ? "Direkt på kartan (Karta-vyn):" : "Directly on the Map (Map view):"}</strong>{" "}
                  {lang === "sv"
                    ? "Klicka på valfri pinne för att öppna inspektören till höger. Om dubbellåset (2+ oberoende källor) är uppfyllt klickar du direkt på [ ✨ Dold pärla ]."
                    : "Click any pin to open the inspector panel on the right. If the double-lock (2+ independent sources) is met, click [ ✨ Hidden gem ] directly."}
                </li>
                <li>
                  <strong>{lang === "sv" ? "I granskningslistan (Lista-vyn):" : "In the Review List (List view):"}</strong>{" "}
                  {lang === "sv"
                    ? "På kandidatkortet finns [ ✨ Dold pärla ]. Kortet visar även evidensremsan (t.ex. '2/2 oberoende' och ev. '✨ X användartips')."
                    : "On the candidate card, click [ ✨ Hidden gem ]. The card displays the evidence strip (e.g. '2/2 independent' and any '✨ X user tips')."}
                </li>
                <li>
                  <strong>{lang === "sv" ? "Om knappen är låst (grå):" : "If the button is locked (gray):"}</strong>{" "}
                  {lang === "sv"
                    ? "Platsen saknar en andra oberoende signal. Klicka [ 🔍 Hämta adress/info ] eller skriv in officiell webbadress för att hämta oberoende bevis och låsa upp knappen."
                    : "The venue lacks a second independent signal. Click [ 🔍 Scrape info ] or enter its official website to gather independent proof and unlock the button."}
                </li>
              </ul>
            </div>
          </div>
        )}

        {activeTab === "ml_transparency" && (
          <div className="admin-guide-section">
            <h5>{lang === "sv" ? "ML-arkitektur & Poängsättning Transparens" : "ML Architecture & Scoring Transparency"}</h5>

            <div className="admin-guide-metrics-explainer">
              <div className="metric-card">
                <h6>{lang === "sv" ? "Kvalitetspoäng (Quality Score)" : "Quality Score"}</h6>
                <p>
                  {lang === "sv"
                    ? "Bayesian krympning av betyg mot prior, dämpad av log1p(recensionsmassa). Bestraffar kommersiella volymvinnare och förhindrar att centrala jättar tränger ut hantverksställen."
                    : "Bayesian shrinkage towards a prior, tempered by log1p(review mass). Prevents central high-volume venues from monopolizing rankings."}
                </p>
              </div>

              <div className="metric-card">
                <h6>{lang === "sv" ? "Upptäcktsvärde (Discovery Score)" : "Discovery Score"}</h6>
                <p>
                  {lang === "sv"
                    ? "Kombination av hög hantverkskvalitet och låg medial exponering (obscurity). Kräver starka oberoende källor; ensam okändhet ger noll bonus."
                    : "Product of high craft quality and low exposure (obscurity). Obscurity without quality produces zero boost."}
                </p>
              </div>

              <div className="metric-card">
                <h6>{lang === "sv" ? "Färskhet (Freshness Decay)" : "Freshness Decay"}</h6>
                <p>
                  {lang === "sv"
                    ? "Halveringstid på 180 dagar för källverifieringar. Äldre bevis fasas successivt ut för att säkerställa att Motkarta speglar levande verksamheter."
                    : "Half-life of 180 days for source verifications. Older signals decay smoothly to ensure only active places rank high."}
                </p>
              </div>

              <div className="metric-card">
                <h6>{lang === "sv" ? "Concierge RAG: Reciprocal Rank Fusion (RRF)" : "Concierge RAG: Reciprocal Rank Fusion (RRF)"}</h6>
                <p>
                  {lang === "sv"
                    ? "Slår samman lexikal BM25 och semantisk vektorsökning med RRF(d) = Σ 1/(60 + r(d)). Exakta namnträffar ges alltid absolut företräde."
                    : "Fuses lexical BM25 and dense semantic retrieval using RRF(d) = Σ 1/(60 + r(d)). Exact name matches always take precedence."}
                </p>
              </div>

              <div className="metric-card">
                <h6>{lang === "sv" ? "Debiased LTR (Inverse Propensity Scoring)" : "Debiased LTR (Inverse Propensity Scoring)"}</h6>
                <p>
                  {lang === "sv"
                    ? "Korrigerar för presentationsbias via P(Examine|k) = (1+k)^-γ med viktbegränsning (max 20x). Kommersiella signaler är strikt blockerade från funktionsmatrisen."
                    : "Corrects presentation bias via P(Examine|k) = (1+k)^-γ with propensity clipping (max 20x). Commercial platform features are quarantined."}
                </p>
              </div>

              <div className="metric-card">
                <h6>{lang === "sv" ? "Drift & Rättvisegrinder" : "Drift & Fairness Gates"}</h6>
                <p>
                  {lang === "sv"
                    ? "Population Stability Index (PSI < 0.10 stabil), minst 30% ytterstadsplatser, minst 90% oberoende verksamheter och cuisine-entropi ≥ 2.5."
                    : "Population Stability Index (PSI < 0.10 stable), min 30% outer-city venues, min 90% independent places, and cuisine entropy ≥ 2.5."}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "runbook" && (
          <div className="admin-guide-section">
            <h5>{lang === "sv" ? "Snabbkommandon för Terminal & Drift" : "Quick-Copy Terminal Commands"}</h5>
            <p className="admin-guide-subtext">
              {lang === "sv"
                ? "Klicka på kopiera-ikonen för att köra kommandot direkt i din terminal."
                : "Click the copy icon to run commands directly in your shell."}
            </p>

            <div className="admin-runbook-list">
              {[
                {
                  label: lang === "sv" ? "4-stegs Verifieringsgrind (Obligatorisk före push/deploy)" : "4-Tier Full Test Gate (Mandatory before push/deploy)",
                  cmd: "npm run test:gate",
                  desc: lang === "sv" ? "Kör TypeScript typecheck, JS-tester, Python ML-tester och Playwright E2E i sekvens." : "Executes TypeScript typecheck, JS unit tests, Python pytest suite, and Playwright E2E in sequence.",
                },
                {
                  label: lang === "sv" ? "Dataset Drift & Rättviseanalys" : "Dataset Drift & Fairness Analysis",
                  cmd: "python -m motkarta.drift --baseline public/data/places.json --current public/data/places.json",
                  desc: lang === "sv" ? "Beräknar PSI, JSD och validerar 30% ytterstads- och 90% oberoendegrinder." : "Computes PSI, JSD, and validates outer-city & independent business representation gates.",
                },
                {
                  label: lang === "sv" ? "Månatlig Google Places Metadata-synk (Dry Run)" : "Monthly Google Places Sync (Dry Run)",
                  cmd: "python scripts/google_places_monthly_sync.py --dry-run",
                  desc: lang === "sv" ? "Hämtar uppdaterade öppettider och karantäniserad metadata utan produktionsskrivning." : "Fetches updated opening hours and quarantined metadata safely without writing to production.",
                },
                {
                  label: lang === "sv" ? "Synka Kurerade Källor & Specialty Coffee" : "Sync Curated Sources & Specialty Coffee",
                  cmd: "node scripts/sync-curated-sources.mjs",
                  desc: lang === "sv" ? "Verifierar guldstandarden för specialkaffe och oberoende bagerier." : "Verifies the gold-standard specialty coffee list and independent bakeries.",
                },
                {
                  label: lang === "sv" ? "Offline LTR Modelltest & Utvärdering" : "Offline LTR Model Testing & Evaluation",
                  cmd: ".venv/bin/pytest tests_python/test_ltr.py -v",
                  desc: lang === "sv" ? "Testar Inverse Propensity Scoring (IPS), bias-korrigering och motfaktisk NDCG." : "Tests Inverse Propensity Scoring, presentation bias correction, and counterfactual NDCG.",
                },
                {
                  label: lang === "sv" ? "Batch-lös Saknade Stadsdelar / Regioner" : "Batch Resolve Missing Districts / Regions",
                  cmd: "node scripts/resolve-stockholm-regions.mjs",
                  desc: lang === "sv" ? "Tilldelar specifika stadsdelar till platser med breda Stockholm-etiketter via koordinatpolygoner." : "Assigns specific districts to places labeled broadly via coordinate polygons.",
                },
              ].map((item, index) => (
                <div key={item.cmd} className="admin-runbook-item">
                  <div className="admin-runbook-text">
                    <span className="runbook-label">{item.label}</span>
                    <span className="runbook-desc">{item.desc}</span>
                  </div>
                  <div className="admin-runbook-code-row">
                    <code>{item.cmd}</code>
                    <button
                      type="button"
                      className={`admin-runbook-copy-btn ${copiedIndex === index ? "copied" : ""}`}
                      onClick={() => copyToClipboard(item.cmd, index)}
                      title={lang === "sv" ? "Kopiera kommando" : "Copy command"}
                    >
                      {copiedIndex === index ? <CheckCircle size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
                      {copiedIndex === index ? (lang === "sv" ? "Kopierat!" : "Copied!") : (lang === "sv" ? "Kopiera" : "Copy")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
