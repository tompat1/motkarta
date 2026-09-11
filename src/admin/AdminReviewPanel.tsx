import React, { useCallback, useEffect, useState } from "react";
import type { PlaceInput, PlaceLifecycleState } from "../../lib/scoring";
import { isBroadStockholmArea, STOCKHOLM_REGIONS as STOCKHOLM_REGION_NAMES } from "../../lib/stockholm-regions";
import type { Language } from "../app/shared";
import { formatUpdatedDate } from "../app/shared";
import { AdminCoveragePanel } from "./AdminCoveragePanel";
import { AdminMlDashboard } from "./AdminMlDashboard";
import { AdminGuidePanel } from "./AdminGuidePanel";
import { AdminToastContainer, type AdminToast } from "./AdminToastContainer";
import { AdminMapView, type AdminMapCandidate } from "./AdminMapView";
import {
  ArrowClockwise,
  ArrowRight,
  ArrowSquareOut,
  BookOpen,
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  Globe,
  Info,
  ListBullets,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  PlusCircle,
  Scales,
  ShieldCheck,
  Sliders,
  Sparkle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

type AdminStateFilter = PlaceLifecycleState | "unresolved_region" | "needs_input" | "ml_dashboard" | "all";
type AdminValidationLabel = NonNullable<PlaceInput["validationLabel"]>;

export type AdminCandidate = {
  id: number;
  name: string;
  kind: string;
  area: string;
  address: string | null;
  website: string | null;
  latitude?: number | null;
  longitude?: number | null;
  openingHours?: string | null;
  priceSEK?: string | null;
  priceLevel?: number | null;
  note: string;
  lifecycleState: PlaceLifecycleState;
  validationLabel: AdminValidationLabel | null;
  validationNotes: string | null;
  candidateSourceType: string | null;
  candidateSourceId: string | null;
  candidateReviewStatus: string | null;
  candidateAllowedUse: string | null;
  duplicateResolution: "merged" | "keep_separate" | null;
  mergedIntoEstablishmentId: number | null;
  updatedAt: string | null;
  createdAt: string | null;
  evidenceCount: number;
  evidenceSourceTypes: string[];
  latestEvidenceAt: string | null;
  evidenceGate: {
    independentEvidenceCount: number;
    independentEvidenceTypes: string[];
    canPromoteHiddenGem: boolean;
    hasCurrentExistence: boolean;
    sourceGaps: string[];
  };
  possibleDuplicateCount: number;
  possibleDuplicates: AdminDuplicateMatch[];
  communityNominationCount?: number;
};

type AdminDuplicateMatch = {
  id: number;
  name: string;
  kind: string;
  area: string;
  lifecycleState: string;
  reason: string;
};

type AdminReviewLabelExport = {
  source?: string;
  updatedAt?: string;
  policy?: string;
  labels?: unknown[];
  duplicateResolutions?: unknown[];
  error?: string;
};

type AdminReviewDashboard = {
  source?: string;
  generatedAt?: string;
  nextStep?: "export" | "review" | "harvest" | "caught_up";
  actions?: {
    harvestNeeded: boolean;
    reviewNeeded: boolean;
    exportNeeded: boolean;
  };
  counts?: {
    candidateCount: number;
    newCandidateCount: number;
    hiddenGemReadyCount: number;
    needsEvidenceCount: number;
    possibleDuplicateCount: number;
    reviewEventCount: number;
    unexportedReviewCount: number;
  };
  latestReviewAt?: string | null;
  lastExportedAt?: string | null;
  exportLogAvailable?: boolean;
  error?: string;
};

type AdminSchemaStatus = {
  source?: string;
  checkedAt?: string;
  ready?: boolean;
  success?: boolean;
  baseSchemaReady?: boolean;
  missing?: Array<{
    kind: "missing_table" | "missing_column";
    table: string;
    column?: string;
  }>;
  error?: string;
};

export type AdminSessionStatus = {
  admin: boolean;
  authMode?: "access_jwt" | "access_header" | "token" | "none";
  email?: string;
  reason?: string;
  configured?: {
    token: boolean;
    accessJwt: boolean;
    trustedHeaders: boolean;
    emailAllowlist: boolean;
  };
  error?: string;
};

const adminStateFilters: AdminStateFilter[] = ["candidate", "baseline", "verified", "featured", "unresolved_region", "needs_input", "ml_dashboard", "all"];

export function AdminReviewPanel({
  lang = "sv",
  adminSession: propAdminSession,
  onSessionChange,
  onLogout,
}: {
  lang?: Language;
  adminSession?: AdminSessionStatus | null;
  onSessionChange?: (session: AdminSessionStatus | null) => void;
  onLogout?: () => void;
}) {
  const [tokenInput, setTokenInput] = useState(readStoredAdminToken);
  const [adminToken, setAdminToken] = useState(readStoredAdminToken);
  const [stateFilter, setStateFilter] = useState<AdminStateFilter>("candidate");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "map">("list");
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [exportingLabels, setExportingLabels] = useState(false);
  const [syncingPipeline, setSyncingPipeline] = useState(false);
  const [resolvingRegions, setResolvingRegions] = useState(false);
  const [websiteInputs, setWebsiteInputs] = useState<Record<number, string>>({});
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [labelExportStatus, setLabelExportStatus] = useState("");
  const [dashboard, setDashboard] = useState<AdminReviewDashboard | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<AdminSchemaStatus | null>(null);
  const [adminSession, setAdminSession] = useState<AdminSessionStatus | null>(propAdminSession ?? null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [toasts, setToasts] = useState<AdminToast[]>([]);
  const hasAdminAuth = adminSession?.admin === true;

  const addToast = useCallback((toast: Omit<AdminToast, "id" | "timestamp">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();
    const timestamp = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setToasts((prev) => [...prev.slice(-4), { ...toast, id, timestamp }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const adminHeaders = useCallback(
    (tokenOverride?: string, extraHeaders?: Record<string, string>) => {
      const token = (tokenOverride ?? adminToken).trim();
      return token
        ? { ...extraHeaders, "x-motkarta-admin-token": token }
        : { ...extraHeaders };
    },
    [adminToken],
  );

  const loadCandidates = useCallback(
    async (tokenOverride?: string, queryOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setCandidates([]);
        setStatus("");
        return;
      }

      if (stateFilter === "ml_dashboard") {
        setCandidates([]);
        setStatus(lang === "sv" ? "ML-Dashboard aktiv." : "ML Dashboard active.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const q = (queryOverride !== undefined ? queryOverride : searchQuery).trim();
        const url = `/api/admin/candidates?state=${stateFilter}&limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`;
        const response = await fetch(url, {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          candidates?: AdminCandidate[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte ladda granskningskön." : "Could not load review queue."));
        }

        const nextCandidates = payload.candidates ?? [];
        const nextNotes: Record<number, string> = {};
        nextCandidates.forEach((candidate) => {
          nextNotes[candidate.id] = candidate.validationNotes ?? "";
        });
        setCandidates(nextCandidates);
        setReviewNotes(nextNotes);
        setStatus(
          lang === "sv"
            ? `${nextCandidates.length} poster laddade från D1.`
            : `${nextCandidates.length} records loaded from D1.`,
        );
      } catch (loadError) {
        setCandidates([]);
        const errMsg = loadError instanceof Error ? loadError.message : String(loadError);
        setError(errMsg);
        addToast({
          type: "warning",
          title: lang === "sv" ? "⚠️ Laddningsfel" : "⚠️ Load Error",
          message: errMsg,
        });
      } finally {
        setLoading(false);
      }
    },
    [addToast, adminHeaders, adminSession?.admin, adminToken, lang, searchQuery, stateFilter],
  );

  const filteredCandidates = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        c.area.toLowerCase().includes(q) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.website && c.website.toLowerCase().includes(q)) ||
        c.kind.toLowerCase().includes(q) ||
        String(c.id) === q ||
        (c.note && c.note.toLowerCase().includes(q))
      );
    });
  }, [candidates, searchQuery]);

  const loadDashboard = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setDashboard(null);
        return;
      }

      setLoadingDashboard(true);
      try {
        const response = await fetch("/api/admin/review-dashboard", {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminReviewDashboard;

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte ladda sessionsstatus." : "Could not load session status."));
        }

        setDashboard(payload);
      } catch (dashboardError) {
        setDashboard(null);
        setError(dashboardError instanceof Error ? dashboardError.message : String(dashboardError));
      } finally {
        setLoadingDashboard(false);
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, lang],
  );

  const loadSchemaStatus = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setSchemaStatus(null);
        return;
      }

      try {
        const response = await fetch("/api/admin/schema", {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminSchemaStatus;

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte läsa schema-status." : "Could not read schema status."));
        }

        setSchemaStatus(payload);
        return payload;
      } catch (schemaError) {
        setSchemaStatus(null);
        setError(schemaError instanceof Error ? schemaError.message : String(schemaError));
        return null;
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, lang],
  );

  const runAdminSelfCheck = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) return null;

      setSchemaBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/schema", {
          method: "POST",
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminSchemaStatus;

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte köra runtime-check." : "Could not run runtime check."));
        }

        setSchemaStatus(payload);
        if (payload.ready) {
          setStatus(lang === "sv" ? "Runtime-check klar. DB och adminschema är redo." : "Runtime check complete. DB and admin schema are ready.");
          addToast({
            type: "success",
            title: lang === "sv" ? "🛡️ Runtime-check godkänd" : "🛡️ Runtime Check Passed",
            message: lang === "sv" ? "D1-databas och adminschema är synkroniserade." : "D1 database and admin schema are synchronized.",
            detail: lang === "sv"
              ? "Samtliga tabeller (establishments, evidence_sources, admin_review_events, recommendation_events) är aktiva."
              : "All tables (establishments, evidence_sources, admin_review_events, recommendation_events) are verified.",
          });
          await Promise.all([loadDashboard(token), loadCandidates(token)]);
        }
        return payload;
      } catch (schemaError) {
        setDashboard(null);
        setCandidates([]);
        setError(schemaError instanceof Error ? schemaError.message : String(schemaError));
        return null;
      } finally {
        setSchemaBusy(false);
      }
    },
    [addToast, adminHeaders, adminSession?.admin, adminToken, lang, loadCandidates, loadDashboard],
  );

  const checkAdminSession = useCallback(
    async (tokenOverride?: string) => {
      const token = (tokenOverride ?? adminToken).trim();
      setCheckingSession(true);

      try {
        const response = await fetch("/api/admin/session", {
          headers: adminHeaders(token),
          redirect: "manual",
        });
        if (response.type === "opaqueredirect" || response.status === 0) {
          const payload: AdminSessionStatus = { admin: false, reason: lang === "sv" ? "Admin-konto krävs." : "Admin account required." };
          setAdminSession(payload);
          onSessionChange?.(payload);
          setStatus(payload.reason ?? "");
          return payload;
        }
        const payload = (await response.json().catch(() => ({}))) as AdminSessionStatus;
        setAdminSession(payload);
        onSessionChange?.(payload);

        if (!response.ok || !payload.admin) {
          if (!token) {
            setStatus(payload.reason ?? (lang === "sv" ? "Admin-konto krävs." : "Admin account required."));
          }
          return payload;
        }

        setStatus(
          payload.email
            ? lang === "sv"
              ? `Adminsession redo: ${payload.email}.`
              : `Admin session ready: ${payload.email}.`
            : lang === "sv"
              ? "Adminsession redo."
              : "Admin session ready.",
        );
        return payload;
      } catch (sessionError) {
        const message = sessionError instanceof Error ? sessionError.message : String(sessionError);
        const failStatus: AdminSessionStatus = { admin: false, reason: message };
        setAdminSession(failStatus);
        onSessionChange?.(failStatus);
        setStatus(message);
        return null;
      } finally {
        setCheckingSession(false);
      }
    },
    [adminHeaders, adminToken, lang, onSessionChange],
  );

  useEffect(() => {
    void checkAdminSession();
  }, []);

  useEffect(() => {
    if (adminSession?.admin) {
      void runAdminSelfCheck(adminToken);
    }
  }, [adminSession?.admin]);

  useEffect(() => {
    if (hasAdminAuth && schemaStatus?.ready) {
      void loadCandidates();
    }
  }, [hasAdminAuth, schemaStatus?.ready, loadCandidates]);

  const handleUnlock = (event: React.FormEvent) => {
    event.preventDefault();
    const token = tokenInput.trim();
    setAdminToken(token);
    if (typeof window !== "undefined" && token) {
      window.sessionStorage.setItem("motkarta_admin_token", token);
    }
    void checkAdminSession(token);
  };

  const handleForgetToken = () => {
    setAdminToken("");
    setTokenInput("");
    setCandidates([]);
    setReviewNotes({});
    setStatus("");
    setLabelExportStatus("");
    setDashboard(null);
    setSchemaStatus(null);
    setError(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("motkarta_admin_token");
    }
    onSessionChange?.(null);
    void checkAdminSession("");
  };

  const handleAdminLogout = () => {
    setAdminToken("");
    setTokenInput("");
    setCandidates([]);
    setReviewNotes({});
    setStatus("");
    setLabelExportStatus("");
    setDashboard(null);
    setSchemaStatus(null);
    setError(null);

    if (onLogout) {
      onLogout();
      return;
    }

    if (typeof window === "undefined") {
      void checkAdminSession("");
      return;
    }

    window.sessionStorage.removeItem("motkarta_admin_token");

    if (adminSession?.authMode === "token") {
      void checkAdminSession("");
      return;
    }

    window.location.assign("/cdn-cgi/access/logout");
  };

  const promoteCandidate = async (
    candidate: AdminCandidate,
    lifecycleState: PlaceLifecycleState,
    validationLabel: AdminValidationLabel,
  ) => {
    if (!hasAdminAuth) return;

    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          state: lifecycleState,
          validationLabel,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara granskningen." : "Could not save review."));
      }

      const updatedCandidate: AdminCandidate = {
        ...candidate,
        lifecycleState,
        validationLabel,
        validationNotes: validationNotes || null,
        updatedAt: payload.reviewedAt ?? new Date().toISOString(),
      };

      setCandidates((current) =>
        current.flatMap((row) => {
          if (row.id !== candidate.id) {
            return [row];
          }

          if (stateFilter !== "all" && lifecycleState !== stateFilter) {
            return [];
          }

          return [updatedCandidate];
        }),
      );
      setStatus(
        lang === "sv"
          ? `${candidate.name} uppdaterades till ${lifecycleStateLabel(lifecycleState, lang)}.`
          : `${candidate.name} updated to ${lifecycleStateLabel(lifecycleState, lang)}.`,
      );

      if (validationLabel === "known_hidden_gem") {
        addToast({
          type: "ml_event",
          title: lang === "sv" ? "✨ Promoverad: Dold Pärla" : "✨ Promoted: Hidden Gem",
          message: `${candidate.name} (#${candidate.id}) ➔ ${lifecycleStateLabel(lifecycleState, lang)}`,
          detail: lang === "sv"
            ? "Dubbellås godkänt (2+ oberoende källor). Platsen rankas upp i 'Dolda pärlor'-läget och Concierge RAG. Kommersiella betyg förblir i strikt karantän."
            : "Double-lock approved (2+ independent sources). Venue boosted in Hidden Gems mode and Concierge RAG. Commercial platform ratings remain quarantined.",
        });
      } else if (lifecycleState === "featured") {
        addToast({
          type: "ml_event",
          title: lang === "sv" ? "🌟 Promoverad: Featured" : "🌟 Promoted: Featured",
          message: `${candidate.name} (#${candidate.id}) ➔ Featured`,
          detail: lang === "sv"
            ? "Högsta synlighet i kuraterade filter, startsidans kartsnabbval och concierge-rekommendationer."
            : "Highest visibility across curated filters, hero shortcuts, and concierge recommendations.",
        });
      } else if (lifecycleState === "verified") {
        addToast({
          type: "success",
          title: lang === "sv" ? "✅ Promoverad: Mainstream" : "✅ Promoted: Mainstream",
          message: `${candidate.name} (#${candidate.id}) ➔ ${lifecycleStateLabel(lifecycleState, lang)}`,
          detail: lang === "sv"
            ? "Verifierad för publik karta och sökning. Dolda pärlor-flaggan är inaktiv, standard Bayesian kvalitetspoäng beräknas."
            : "Verified for public map and search. Hidden gem flag is inactive, Bayesian quality score computed normally.",
        });
      } else {
        addToast({
          type: "warning",
          title: lang === "sv" ? "⚠️ Kandidat avvisad" : "⚠️ Candidate Rejected",
          message: `${candidate.name} (#${candidate.id}) markerades som ${validationLabelText(validationLabel, lang)}.`,
          detail: lang === "sv"
            ? "Exkluderas från publicering. Sparas som negativt träningsbevis för kandidatklassificeraren."
            : "Excluded from publishing. Preserved as negative training evidence for candidate classifiers.",
        });
      }

      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const resolveDuplicate = async (
    candidate: AdminCandidate,
    action: "merge_duplicate" | "keep_separate",
    targetId?: number,
  ) => {
    if (!hasAdminAuth) return;

    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          action,
          targetId,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        targetEstablishmentId?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara dubblettbeslutet." : "Could not save duplicate decision."));
      }

      if (action === "merge_duplicate") {
        setCandidates((current) => current.filter((row) => row.id !== candidate.id));
        setStatus(
          lang === "sv"
            ? `${candidate.name} slogs ihop med #${payload.targetEstablishmentId ?? targetId}.`
            : `${candidate.name} merged into #${payload.targetEstablishmentId ?? targetId}.`,
        );
        addToast({
          type: "info",
          title: lang === "sv" ? "🔗 Dubblett sammanslagen" : "🔗 Duplicate Merged",
          message: `${candidate.name} (#${candidate.id}) slogs ihop med #${payload.targetEstablishmentId ?? targetId}.`,
          detail: lang === "sv"
            ? "Källor och bevis migrerades till huvudposten. Sammanslagningen loggas i D1 audit-events för ML-träningsunderlag."
            : "Sources and evidence migrated to target place. Merge logged in D1 audit events for ML training sets.",
        });
      } else {
        setCandidates((current) =>
          current.map((row) =>
            row.id === candidate.id
              ? {
                  ...row,
                  duplicateResolution: "keep_separate",
                  candidateReviewStatus: "duplicate_checked_keep_separate",
                  validationNotes: validationNotes || row.validationNotes,
                  updatedAt: payload.reviewedAt ?? new Date().toISOString(),
                  possibleDuplicateCount: 0,
                  possibleDuplicates: [],
                }
              : row,
          ),
        );
        setStatus(
          lang === "sv"
            ? `${candidate.name} markerades som separat plats.`
            : `${candidate.name} marked as a separate place.`,
        );
        addToast({
          type: "info",
          title: lang === "sv" ? "🛡️ Separat post bekräftad" : "🛡️ Kept Separate",
          message: `${candidate.name} (#${candidate.id}) markerades som distinkt verksamhet.`,
          detail: lang === "sv"
            ? "Sparat som negativt matchpar för dedupliceringsmodellen."
            : "Recorded as a negative match pair for deduplication training.",
        });
      }
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const updateCandidateRegion = async (candidate: AdminCandidate, district: string) => {
    if (!hasAdminAuth || !district) return;

    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          action: "update_district",
          district,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        district?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara region." : "Could not save region."));
      }

      setCandidates((current) =>
        current.flatMap((row) => {
          if (row.id !== candidate.id) return [row];
          if (stateFilter === "unresolved_region" && !isBroadStockholmArea(district)) {
            return [];
          }
          return [{ ...row, area: district, updatedAt: payload.reviewedAt ?? new Date().toISOString() }];
        }),
      );
      setStatus(
        lang === "sv"
          ? `${candidate.name} uppdaterades till region ${district}.`
          : `${candidate.name} updated to region ${district}.`,
      );
      addToast({
        type: "success",
        title: lang === "sv" ? "📍 Region uppdaterad" : "📍 Region Updated",
        message: `${candidate.name} (#${candidate.id}) ➔ ${district}`,
        detail: lang === "sv"
          ? "Stadsdel sparad i D1. Bidrar till geografisk representation i drift- och rättvisegrinden (ytterstad vs innerstad)."
          : "District saved to D1. Supports geographic representation in drift and fairness gates.",
      });
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const updateCandidateWebsite = async (candidate: AdminCandidate, rawWebsite: string) => {
    if (!hasAdminAuth || !rawWebsite.trim()) return;

    const website = rawWebsite.trim();
    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    setBusyId(candidate.id);
    setError(null);

    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: adminHeaders(undefined, { "content-type": "application/json" }),
        body: JSON.stringify({
          id: candidate.id,
          action: "update_website",
          website,
          scrapeImage: true,
          validationNotes,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reviewedAt?: string;
        website?: string;
        scrapedPhotoUrl?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara webbadress." : "Could not save website."));
      }

      const updatedWebsite = payload.website ?? website;
      setCandidates((current) =>
        current.flatMap((row) => {
          if (row.id !== candidate.id) return [row];
          if (stateFilter === "needs_input" && updatedWebsite && row.address && !isBroadStockholmArea(row.area)) {
            return [];
          }
          return [{ ...row, website: updatedWebsite, updatedAt: payload.reviewedAt ?? new Date().toISOString() }];
        }),
      );

      setStatus(
        payload.scrapedPhotoUrl
          ? lang === "sv"
            ? `Webbplats sparad för ${candidate.name} & bild hämtades (${payload.scrapedPhotoUrl}).`
            : `Saved website for ${candidate.name} & scraped official photo (${payload.scrapedPhotoUrl}).`
          : lang === "sv"
            ? `Webbplats sparad för ${candidate.name}.`
            : `Saved website for ${candidate.name}.`,
      );
      addToast({
        type: "info",
        title: lang === "sv" ? "🌐 Webb & bild sparad" : "🌐 Website & Photo Saved",
        message: `${candidate.name} (#${candidate.id}) ➔ ${updatedWebsite}`,
        detail: payload.scrapedPhotoUrl
          ? lang === "sv"
            ? `Officiell webbsida och og:image (${payload.scrapedPhotoUrl}) registrerade som verifierad källa (konfidens 0.9).`
            : `Official website and og:image (${payload.scrapedPhotoUrl}) recorded as verified source (confidence 0.9).`
          : lang === "sv"
            ? "Officiell webbsida sparad som verifierad källa (konfidens 0.9)."
            : "Official website saved as verified source (confidence 0.9).",
      });
      void loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const syncPipelineDirectly = async () => {
    const token = adminToken.trim();
    if (!hasAdminAuth) return;

    setSyncingPipeline(true);
    setError(null);
    setLabelExportStatus("");

    try {
      const response = await fetch("/api/admin/review-labels", {
        method: "POST",
        headers: adminHeaders(token),
      });
      const payload = (await response.json().catch(() => ({}))) as AdminReviewLabelExport;

      if (!response.ok) {
        throw new Error(
          payload.error ??
            (lang === "sv" ? "Kunde inte synka labels till pipeline." : "Could not sync labels to pipeline."),
        );
      }

      const labelCount = payload.labels?.length ?? 0;
      const dupCount = payload.duplicateResolutions?.length ?? 0;

      setLabelExportStatus(
        lang === "sv"
          ? `✅ Synkade ${labelCount} träningsetiketter och ${dupCount} dubblettbeslut i D1. Pipelinen är uppdaterad.`
          : `✅ Synced ${labelCount} training labels and ${dupCount} duplicate decisions in D1. Pipeline is updated.`,
      );

      addToast({
        type: "success",
        title: lang === "sv" ? "⚡ Pipeline synkad i D1" : "⚡ Pipeline Synced in D1",
        message:
          lang === "sv"
            ? `Sparade checkpoint för ${labelCount} labels och ${dupCount} dubblettbeslut.`
            : `Saved checkpoint for ${labelCount} labels and ${dupCount} duplicate decisions.`,
        detail:
          lang === "sv"
            ? "Inga filer behöver laddas ner manuellt. Pipelinen är i fas och 0 oexporterade beslut återstår."
            : "No manual file downloads needed. Pipeline is up to date with 0 unexported decisions remaining.",
      });

      await loadDashboard(token);
      await loadSchemaStatus(token);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setSyncingPipeline(false);
    }
  };

  const exportReviewLabels = async () => {
    const token = adminToken.trim();
    if (!hasAdminAuth || typeof document === "undefined") return;

    setExportingLabels(true);
    setError(null);
    setLabelExportStatus("");

    try {
      const response = await fetch("/api/admin/review-labels", {
        method: "POST",
        headers: adminHeaders(token),
      });
      const payload = (await response.json().catch(() => ({}))) as AdminReviewLabelExport;

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte exportera labels." : "Could not export labels."));
      }

      const filePayload = {
        updatedAt: payload.updatedAt ?? new Date().toISOString(),
        policy:
          payload.policy ??
          "Human validation labels exported from admin review events. Duplicate resolutions are kept separate from hidden-gem/mainstream labels.",
        labels: payload.labels ?? [],
        duplicateResolutions: payload.duplicateResolutions ?? [],
      };
      const blob = new Blob([`${JSON.stringify(filePayload, null, 2)}\n`], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `motkarta-human-validation-labels-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setLabelExportStatus(
        lang === "sv"
          ? `Exporterade ${filePayload.labels.length} labels och ${filePayload.duplicateResolutions.length} dubblettbeslut.`
          : `Exported ${filePayload.labels.length} labels and ${filePayload.duplicateResolutions.length} duplicate decisions.`,
      );
      addToast({
        type: "info",
        title: lang === "sv" ? "📦 Träningsetiketter exporterade" : "📦 Training Labels Exported",
        message: lang === "sv"
          ? `Exporterade ${filePayload.labels.length} labels och ${filePayload.duplicateResolutions.length} dubblettbeslut.`
          : `Exported ${filePayload.labels.length} labels and ${filePayload.duplicateResolutions.length} duplicate decisions.`,
        detail: lang === "sv"
          ? "Besluten är klara för offline LTR-träning och utvärdering av kandidatklassificeraren."
          : "Decisions ready for offline LTR training and candidate classifier evaluation.",
      });
      await loadDashboard(token);
      await loadSchemaStatus(token);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExportingLabels(false);
    }
  };

  const resolvePlacesWithoutRegion = async () => {
    const token = adminToken.trim();
    if (!hasAdminAuth) return;

    setResolvingRegions(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/resolve-regions", {
        method: "POST",
        headers: adminHeaders(token),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        totalChecked?: number;
        resolvedCount?: number;
        updatedPlaces?: Array<{ id: number; name: string; previousDistrict: string; resolvedDistrict: string }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte lösa saknade regioner." : "Could not resolve missing regions."));
      }

      const count = payload.resolvedCount ?? 0;
      const examples = (payload.updatedPlaces ?? [])
        .slice(0, 3)
        .map((p) => `${p.name} → ${p.resolvedDistrict}`)
        .join(", ");

      setStatus(
        count > 0
          ? lang === "sv"
            ? `Löste regioner för ${count} platser${examples ? ` (${examples})` : ""}.`
            : `Resolved regions for ${count} places${examples ? ` (${examples})` : ""}.`
          : lang === "sv"
            ? "Alla platser har redan giltiga regioner."
            : "All places already have specific regions.",
      );
      addToast({
        type: "success",
        title: lang === "sv" ? "🗺️ Saknade regioner lösta" : "🗺️ Missing Regions Resolved",
        message: count > 0
          ? lang === "sv"
            ? `Löste regioner för ${count} platser${examples ? ` (${examples})` : ""}.`
            : `Resolved regions for ${count} places${examples ? ` (${examples})` : ""}.`
          : lang === "sv"
            ? "Alla platser har redan giltiga regioner."
            : "All places already have specific regions.",
        detail: lang === "sv"
          ? "Säkerställer korrekt distriktstillhörighet för filtrering och LTR-funktionsmatriser."
          : "Ensures proper district attribution for filtering and LTR feature matrices.",
      });

      await Promise.all([loadCandidates(token), loadDashboard(token)]);
    } catch (resolveErr) {
      setError(resolveErr instanceof Error ? resolveErr.message : String(resolveErr));
    } finally {
      setResolvingRegions(false);
    }
  };

  return (
    <section className="admin-review-panel" id="admin-review" aria-labelledby="admin-review-title">
      <div className="admin-review-head">
        <div>
          <p className="admin-review-kicker">
            <ShieldCheck size={14} weight="bold" /> {lang === "sv" ? "Adminflöde" : "Admin workflow"}
          </p>
          <h3 id="admin-review-title">
            {lang === "sv" ? "Granskningskö" : "Review queue"}
          </h3>
        </div>

        {!hasAdminAuth ? (
          <form className="admin-review-auth" onSubmit={handleUnlock}>
            <label className="sr-only" htmlFor="admin-token">
              {lang === "sv" ? "Lokal admin-token" : "Local admin token"}
            </label>
            <input
              id="admin-token"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={lang === "sv" ? "Lokal/dev-token" : "Local/dev token"}
              autoComplete="off"
            />
            <button type="submit" disabled={checkingSession} title={lang === "sv" ? "Lås upp lokal granskningskö" : "Unlock local review queue"}>
              {checkingSession ? <CircleNotch size={14} className="animate-spin" /> : <ShieldCheck size={14} weight="bold" />}
              {checkingSession ? (lang === "sv" ? "Kollar" : "Checking") : lang === "sv" ? "Lås upp" : "Unlock"}
            </button>
            {tokenInput || adminToken ? (
              <button
                type="button"
                className="admin-review-ghost-btn"
                onClick={handleForgetToken}
                title={lang === "sv" ? "Glöm lokal token" : "Forget local token"}
              >
                <X size={14} weight="bold" />
              </button>
            ) : null}
          </form>
        ) : null}
      </div>

      <div className="admin-review-toolbar" aria-label={lang === "sv" ? "Filter för granskningskö" : "Review queue filters"}>
        <div className="admin-state-tabs">
          {adminStateFilters.map((state) => (
            <button
              key={state}
              type="button"
              className={stateFilter === state ? "active" : ""}
              aria-pressed={stateFilter === state}
              onClick={() => setStateFilter(state)}
            >
              {lifecycleStateLabel(state, lang)}
            </button>
          ))}
        </div>
        <div className="admin-toolbar-actions">
          <button
            type="button"
            className="admin-resolve-regions-btn"
            onClick={() => void resolvePlacesWithoutRegion()}
            disabled={!hasAdminAuth || resolvingRegions || loading || schemaStatus?.ready !== true}
            title={
              lang === "sv"
                ? "Lös regioner för alla platser utan specifik region (t.ex. Djurgården, Södermalm, Norrmalm, Vasastan, Söderort, Västerort)"
                : "Resolve regions for all places without a specific region"
            }
          >
            {resolvingRegions ? <CircleNotch size={14} className="animate-spin" /> : <MapPin size={14} weight="bold" />}
            {lang === "sv" ? "Lös saknade regioner" : "Resolve missing regions"}
          </button>
          <button
            type="button"
            className="admin-refresh-btn"
            onClick={() => void loadCandidates()}
            disabled={!hasAdminAuth || loading || schemaStatus?.ready !== true}
            title={lang === "sv" ? "Ladda om från D1" : "Reload from D1"}
          >
            {loading ? <CircleNotch size={14} className="animate-spin" /> : <ArrowClockwise size={14} weight="bold" />}
            {lang === "sv" ? "Ladda om" : "Reload"}
          </button>
          <button
            type="button"
            className={`admin-guide-toggle-btn ${showGuide ? "active" : ""}`}
            onClick={() => setShowGuide((prev) => !prev)}
            title={lang === "sv" ? "Öppna adminhandbok & ML-rutiner (SOP)" : "Open Admin Playbook & ML SOP"}
          >
            <BookOpen size={14} weight="bold" />
            {lang === "sv" ? "Guide & Rutiner (SOP)" : "Playbook & SOP"}
          </button>
        </div>
      </div>

      <div className="admin-search-and-view-row">
        <div className="admin-search-box">
          <MagnifyingGlass size={16} weight="bold" className="admin-search-icon" />
          <input
            type="search"
            className="admin-search-input"
            placeholder={
              lang === "sv"
                ? "Sök ställe (namn, gatuadress, stadsdel, id, typ)..."
                : "Search place (name, street address, district, id, type)..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void loadCandidates(undefined, searchQuery);
              }
            }}
          />
          {searchQuery ? (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => {
                setSearchQuery("");
                void loadCandidates(undefined, "");
              }}
              title={lang === "sv" ? "Rensa sökning" : "Clear search"}
              aria-label="Clear search"
            >
              <X size={14} weight="bold" />
            </button>
          ) : null}
        </div>

        <div className="admin-view-switcher" role="tablist" aria-label={lang === "sv" ? "Växla vy" : "Switch view"}>
          <button
            type="button"
            className={`admin-view-btn ${viewMode === "list" ? "active" : ""}`}
            onClick={() => setViewMode("list")}
            role="tab"
            aria-selected={viewMode === "list"}
            title={lang === "sv" ? "Lista med granskningskort" : "Card list"}
          >
            <ListBullets size={16} weight="bold" />
            <span>{lang === "sv" ? "Lista" : "List"}</span>
            <span className="admin-view-count">{filteredCandidates.length}</span>
          </button>
          <button
            type="button"
            className={`admin-view-btn ${viewMode === "map" ? "active" : ""}`}
            onClick={() => setViewMode("map")}
            role="tab"
            aria-selected={viewMode === "map"}
            title={lang === "sv" ? "Interaktiv kartvy över ställen" : "Interactive map view"}
          >
            <MapTrifold size={16} weight="bold" />
            <span>{lang === "sv" ? "Karta" : "Map"}</span>
            <span className="admin-view-count">
              {filteredCandidates.filter((c) => typeof c.latitude === "number" && typeof c.longitude === "number").length}
            </span>
          </button>
        </div>
      </div>

      <div className="admin-filter-guide-banner" role="note">
        <Info size={14} weight="bold" className="filter-guide-icon" />
        <span>{stateFilterHelpText(stateFilter, lang)}</span>
      </div>

      {showGuide ? (
        <AdminGuidePanel lang={lang} onClose={() => setShowGuide(false)} />
      ) : null}

      {hasAdminAuth ? (
        <div className={`admin-schema-panel ${schemaStatus?.ready ? "ready" : "needs-setup"}`}>
          <div className="admin-schema-copy">
            <span>{schemaStatus?.ready ? (lang === "sv" ? "Runtime redo" : "Runtime ready") : lang === "sv" ? "Runtime-check" : "Runtime check"}</span>
            <small>{schemaStatusText(schemaStatus, lang)}</small>
          </div>
          <button
            type="button"
            className="admin-schema-btn"
            onClick={() => void runAdminSelfCheck()}
            disabled={!hasAdminAuth || schemaBusy}
            title={lang === "sv" ? "Kontrollera token, DB och adminschema" : "Check token, DB, and admin schema"}
          >
            {schemaBusy ? <CircleNotch size={14} className="animate-spin" /> : <ShieldCheck size={14} weight="bold" />}
            {schemaBusy ? (lang === "sv" ? "Kollar" : "Checking") : schemaStatus?.ready ? (lang === "sv" ? "Kolla igen" : "Recheck") : lang === "sv" ? "Kör check" : "Run check"}
          </button>
        </div>
      ) : null}

      {hasAdminAuth && schemaStatus?.ready ? (
        <div className={`admin-session-dashboard step-${dashboard?.nextStep ?? "loading"}`} aria-live="polite">
          <div className="admin-session-summary">
            <span className="admin-session-badge">
              {dashboardStepLabel(dashboard?.nextStep, loadingDashboard, lang)}
            </span>
            <strong>{dashboardHeadline(dashboard, loadingDashboard, lang)}</strong>
            <small>{dashboardSubcopy(dashboard, loadingDashboard, lang)}</small>
          </div>
          <div className="admin-session-metrics">
            {dashboardMetrics(dashboard, lang).map((metric) => (
              <div key={metric.key} className={`admin-session-metric tone-${metric.tone}`}>
                <span className="admin-session-metric-icon">{metric.icon}</span>
                <span>{metric.label}</span>
                <b>{metric.value}</b>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {hasAdminAuth ? (
        <AdminCoveragePanel lang={lang} adminToken={adminToken} />
      ) : null}

      <div className="admin-sync-card">
        <div className="admin-sync-header">
          <div className="admin-sync-title-group">
            <ShieldCheck size={20} weight="bold" className="admin-sync-icon" />
            <div>
              <h5 className="admin-sync-title">
                {lang === "sv" ? "Automatiskt sparad & Pipeline-synk" : "Auto-Saved & Pipeline Sync"}
              </h5>
              <p className="admin-sync-desc">
                {lang === "sv"
                  ? "Alla granskningsbeslut sparas direkt i Cloudflare D1 i realtid. Du behöver inte exportera manuellt för att ändringar ska synas på sajten; ML-pipelinen synkar automatiskt via npm run sync:labels vid modellträning."
                  : "All review decisions are saved directly to Cloudflare D1 in real-time. You don't need to manually export for changes to appear live; the ML pipeline auto-syncs via npm run sync:labels during model training."}
              </p>
            </div>
          </div>
          <div className="admin-sync-status-pill">
            {(dashboard?.counts?.unexportedReviewCount ?? 0) === 0 ? (
              <span className="sync-pill-tag synced">
                <CheckCircle size={14} weight="bold" />
                {lang === "sv" ? "Allt synkat med pipeline" : "All synced with pipeline"}
              </span>
            ) : (
              <span className="sync-pill-tag pending">
                <ArrowClockwise size={14} weight="bold" />
                {lang === "sv"
                  ? `${dashboard?.counts?.unexportedReviewCount} nya beslut redo för ML`
                  : `${dashboard?.counts?.unexportedReviewCount} new decisions ready for ML`}
              </span>
            )}
          </div>
        </div>

        <div className="admin-sync-actions">
          <button
            type="button"
            className="admin-sync-btn-primary"
            onClick={() => void syncPipelineDirectly()}
            disabled={!hasAdminAuth || syncingPipeline || schemaStatus?.ready !== true}
            title={lang === "sv" ? "Synka D1-checkpoint direkt utan filnedladdning" : "Sync D1 checkpoint directly without file download"}
          >
            {syncingPipeline ? <CircleNotch size={15} className="animate-spin" /> : <ArrowClockwise size={15} weight="bold" />}
            <span>{lang === "sv" ? "Synka pipeline direkt" : "Sync pipeline directly"}</span>
          </button>

          <button
            type="button"
            className="admin-sync-btn-secondary"
            onClick={() => void exportReviewLabels()}
            disabled={!hasAdminAuth || exportingLabels || schemaStatus?.ready !== true}
            title={lang === "sv" ? "Valfritt: Ladda ner manuell JSON-backup" : "Optional: Download manual JSON backup"}
          >
            {exportingLabels ? <CircleNotch size={15} className="animate-spin" /> : <DownloadSimple size={15} weight="bold" />}
            <span>{lang === "sv" ? "Ladda ner backup (JSON)" : "Download backup (JSON)"}</span>
          </button>

          <div className="admin-sync-cli-hint">
            <span className="cli-hint-label">{lang === "sv" ? "Terminal:" : "Terminal:"}</span>
            <code className="cli-hint-code">npm run sync:labels</code>
          </div>
        </div>

        {labelExportStatus ? (
          <div className="admin-sync-status-msg" aria-live="polite">
            <CheckCircle size={14} weight="bold" />
            <span>{labelExportStatus}</span>
          </div>
        ) : null}
      </div>

      {error || status ? (
        <div
          className={`admin-status-toast-banner ${error ? "is-error" : "is-status"}`}
          role="status"
          aria-live="polite"
        >
          <div className="status-toast-main">
            {error ? (
              <WarningCircle size={20} weight="bold" className="status-toast-icon error" />
            ) : (
              <CheckCircle size={20} weight="bold" className="status-toast-icon success" />
            )}
            <div className="status-toast-text">
              <span className="status-toast-title">
                {error
                  ? lang === "sv"
                    ? "Åtgärdsfel"
                    : "Action Error"
                  : lang === "sv"
                    ? "Statusuppdatering"
                    : "Status Update"}
              </span>
              <p className="status-toast-msg">{error ?? status}</p>
            </div>
          </div>
          <button
            type="button"
            className="status-toast-dismiss"
            onClick={() => {
              setError(null);
              setStatus("");
            }}
            aria-label={lang === "sv" ? "Stäng notis" : "Dismiss notice"}
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      ) : null}

      {!hasAdminAuth ? (
        <div className="admin-review-empty">
          {checkingSession ? <CircleNotch size={18} className="animate-spin" /> : <ShieldCheck size={18} weight="bold" />}
          <span>
            {checkingSession
              ? lang === "sv"
                ? "Kontrollerar adminsession..."
                : "Checking admin session..."
              : adminSession?.reason ??
                (lang === "sv"
                  ? "Admin-konto krävs. I produktion ska /admin skyddas med Cloudflare Access."
                  : "Admin account required. In production, /admin should be protected by Cloudflare Access.")}
          </span>
        </div>
      ) : schemaBusy || !schemaStatus ? (
        <div className="admin-review-empty">
          <CircleNotch size={18} className="animate-spin" />
          <span>{lang === "sv" ? "Kör runtime-check mot Cloudflare..." : "Running runtime check against Cloudflare..."}</span>
        </div>
      ) : schemaStatus.ready === false ? (
        <div className="admin-review-empty">
          <ShieldCheck size={18} weight="bold" />
          <span>{schemaStatusText(schemaStatus, lang)}</span>
        </div>
      ) : stateFilter === "ml_dashboard" ? (
        <AdminMlDashboard lang={lang} adminHeaders={adminHeaders} hasAdminAuth={hasAdminAuth} />
      ) : loading ? (
        <div className="admin-review-empty">
          <CircleNotch size={18} className="animate-spin" />
          <span>{lang === "sv" ? "Laddar kandidater..." : "Loading candidates..."}</span>
        </div>
      ) : viewMode === "map" ? (
        <AdminMapView
          candidates={filteredCandidates}
          selectedCandidateId={selectedCandidateId}
          onSelectCandidate={(id) => {
            setSelectedCandidateId(id);
          }}
          onUpdateDistrict={(candidate, district) => {
            const found = candidates.find((c) => c.id === candidate.id);
            if (found) void updateCandidateRegion(found, district);
          }}
          onMarkClosed={(candidate) => {
            const found = candidates.find((c) => c.id === candidate.id);
            if (found) void promoteCandidate(found, "candidate", "closed_wrong_category");
          }}
          lang={lang}
        />
      ) : filteredCandidates.length ? (
        <div className="admin-candidate-list">
          {filteredCandidates.map((candidate) => (
            <article key={candidate.id} className="admin-candidate-row" aria-busy={busyId === candidate.id}>
              <div className="admin-candidate-main">
                <div className="admin-candidate-meta">
                  <span className={`admin-state-badge state-${candidate.lifecycleState}`}>
                    {lifecycleStateLabel(candidate.lifecycleState, lang)}
                  </span>
                  <span>{candidate.kind} · {candidate.area}</span>
                  {isBroadStockholmArea(candidate.area) ? (
                    <span className="admin-region-warn-badge" title={lang === "sv" ? "Saknar specifik region/stadsdel" : "Needs specific region/district"}>
                      <MapPin size={12} weight="bold" /> {lang === "sv" ? "Saknar region" : "Needs region"}
                    </span>
                  ) : null}
                  {candidate.validationLabel ? <span>{validationLabelText(candidate.validationLabel, lang)}</span> : null}
                </div>
                <h4>{candidate.name}</h4>
                <p>{candidate.note}</p>
                <div className="admin-source-strip">
                  <span>
                    <ShieldCheck size={13} weight="bold" />
                    {candidate.candidateSourceType ?? "source_unknown"}
                  </span>
                  {candidate.candidateSourceId ? <span>{candidate.candidateSourceId}</span> : null}
                  {candidate.candidateReviewStatus ? <span>{candidate.candidateReviewStatus}</span> : null}
                  {candidate.address ? <span>{candidate.address}</span> : null}
                  {candidate.website ? (
                    <a href={candidate.website.startsWith("http") ? candidate.website : `https://${candidate.website}`} target="_blank" rel="noopener noreferrer">
                      <Globe size={13} weight="bold" />
                      {lang === "sv" ? "Webb" : "Web"}
                      <ArrowSquareOut size={11} weight="bold" />
                    </a>
                  ) : null}
                </div>
                <div className="admin-evidence-strip">
                  <span>
                    <ShieldCheck size={13} weight="bold" />
                    {candidate.evidenceCount} {lang === "sv" ? "signaler" : "signals"}
                  </span>
                  <span className={candidate.evidenceGate.canPromoteHiddenGem ? "admin-gate-pass" : "admin-gate-warn"}>
                    {candidate.evidenceGate.independentEvidenceCount}/2 {lang === "sv" ? "oberoende" : "independent"}
                  </span>
                  {(candidate.communityNominationCount ?? 0) > 0 ? (
                    <span
                      className="admin-gate-pass"
                      title={lang === "sv" ? "Tipsad av besökare som dold pärla" : "Nominated by visitors as a hidden gem"}
                    >
                      ✨ {candidate.communityNominationCount} {lang === "sv" ? "användartips" : "user tips"}
                    </span>
                  ) : null}
                  {candidate.evidenceSourceTypes.slice(0, 4).map((sourceType) => (
                    <span key={sourceType}>{sourceType}</span>
                  ))}
                  <span>
                    {lang === "sv" ? "Senast" : "Latest"} {formatUpdatedDate(candidate.latestEvidenceAt ?? undefined)}
                  </span>
                </div>
                {candidate.evidenceGate.sourceGaps.length ? (
                  <div className="admin-gap-row">
                    {candidate.evidenceGate.sourceGaps.map((gap) => (
                      <span key={gap}>{sourceGapLabel(gap, lang)}</span>
                    ))}
                  </div>
                ) : null}
                {candidate.possibleDuplicates.length ? (
                  <div className="admin-duplicate-box">
                    <div className="admin-duplicate-title">
                      <Scales size={13} weight="bold" />
                      {lang === "sv" ? "Möjlig dubblett" : "Possible duplicate"}
                    </div>
                    {candidate.possibleDuplicates.slice(0, 4).map((match) => (
                      <div key={match.id} className="admin-duplicate-row">
                        <div>
                          <b>#{match.id} {match.name}</b>
                          <span>
                            {match.kind} · {match.area} · {lifecycleStateLabel(match.lifecycleState as AdminStateFilter, lang)} · {duplicateReasonLabel(match.reason, lang)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="admin-mini-action"
                          disabled={busyId === candidate.id}
                          onClick={() => void resolveDuplicate(candidate, "merge_duplicate", match.id)}
                          title={lang === "sv" ? "Slå ihop kandidatens källor med vald plats" : "Merge candidate sources into selected place"}
                        >
                          <ArrowRight size={13} weight="bold" />
                          {lang === "sv" ? "Slå ihop" : "Merge"}
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="admin-mini-action secondary"
                      disabled={busyId === candidate.id}
                      onClick={() => void resolveDuplicate(candidate, "keep_separate")}
                    >
                      <CheckCircle size={13} weight="bold" />
                      {lang === "sv" ? "Behåll separat" : "Keep separate"}
                    </button>
                  </div>
                ) : candidate.duplicateResolution ? (
                  <div className="admin-duplicate-resolved">
                    {duplicateResolutionLabel(candidate.duplicateResolution, lang)}
                    {candidate.mergedIntoEstablishmentId ? ` #${candidate.mergedIntoEstablishmentId}` : ""}
                  </div>
                ) : null}
                {candidate.candidateAllowedUse ? (
                  <p className="admin-allowed-use">{candidate.candidateAllowedUse}</p>
                ) : null}

                <div className={`admin-region-picker-row ${isBroadStockholmArea(candidate.area) ? "unresolved" : ""}`}>
                  <label htmlFor={`admin-region-select-${candidate.id}`} className="admin-region-picker-label">
                    <MapPin size={13} weight="bold" />
                    {lang === "sv" ? "Manuell region / stadsdel:" : "Manual region / district:"}
                  </label>
                  <select
                    id={`admin-region-select-${candidate.id}`}
                    className="admin-region-select"
                    value={(STOCKHOLM_REGION_NAMES as readonly string[]).includes(candidate.area) ? candidate.area : ""}
                    disabled={busyId === candidate.id}
                    onChange={(event) => {
                      const nextRegion = event.target.value;
                      if (nextRegion) {
                        void updateCandidateRegion(candidate, nextRegion);
                      }
                    }}
                  >
                    <option value="" disabled>
                      {isBroadStockholmArea(candidate.area)
                        ? (lang === "sv" ? "⚠️ Välj region ur listan..." : "⚠️ Select region from list...")
                        : (lang === "sv" ? "— Välj ny region —" : "— Select new region —")}
                    </option>
                    {STOCKHOLM_REGION_NAMES.map((regionName) => (
                      <option key={regionName} value={regionName}>
                        {regionName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`admin-website-picker-row ${!candidate.website ? "unresolved" : ""}`}>
                  <label htmlFor={`admin-website-input-${candidate.id}`} className="admin-website-picker-label">
                    <Globe size={13} weight="bold" />
                    {lang === "sv" ? "Webbplats & Bild-scraper:" : "Website & Image Scraper:"}
                  </label>
                  <div className="admin-website-input-wrap">
                    <input
                      id={`admin-website-input-${candidate.id}`}
                      type="url"
                      className="admin-website-input"
                      value={websiteInputs[candidate.id] ?? candidate.website ?? ""}
                      onChange={(event) =>
                        setWebsiteInputs((current) => ({
                          ...current,
                          [candidate.id]: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                    <button
                      type="button"
                      className="admin-scrape-btn"
                      disabled={busyId === candidate.id || !(websiteInputs[candidate.id] ?? candidate.website ?? "").trim()}
                      onClick={() =>
                        void updateCandidateWebsite(
                          candidate,
                          websiteInputs[candidate.id] ?? candidate.website ?? "",
                        )
                      }
                      title={lang === "sv" ? "Spara webbadress och sök automatiskt efter bild (og:image)" : "Save website URL and automatically extract og:image photo"}
                    >
                      <DownloadSimple size={13} weight="bold" />
                      {lang === "sv" ? "Spara & hämta bild" : "Save & scrape photo"}
                    </button>
                  </div>
                </div>

                <label className="admin-notes-label" htmlFor={`admin-notes-${candidate.id}`}>
                  {lang === "sv" ? "Granskningsnotering" : "Review note"}
                </label>
                <textarea
                  id={`admin-notes-${candidate.id}`}
                  rows={2}
                  value={reviewNotes[candidate.id] ?? ""}
                  onChange={(event) =>
                    setReviewNotes((current) => ({
                      ...current,
                      [candidate.id]: event.target.value,
                    }))
                  }
                  placeholder={
                    lang === "sv"
                      ? "T.ex. OSM + kommunal träff + manuell webbkontroll."
                      : "E.g. OSM + municipal match + manual website check."
                  }
                />
              </div>

              <div className="admin-candidate-actions">
                <button
                  type="button"
                  className="admin-action-btn primary"
                  disabled={busyId === candidate.id || !candidate.evidenceGate.canPromoteHiddenGem}
                  title={
                    candidate.evidenceGate.canPromoteHiddenGem
                      ? validationLabelText("known_hidden_gem", lang)
                      : lang === "sv"
                        ? "Kräver minst två oberoende icke-Google-signaler"
                        : "Requires at least two independent non-Google signals"
                  }
                  onClick={() => void promoteCandidate(candidate, "verified", "known_hidden_gem")}
                >
                  <Sparkle size={14} weight="bold" />
                  {lang === "sv" ? "Dold pärla" : "Hidden gem"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate, "verified", "known_mainstream")}
                >
                  <CheckCircle size={14} weight="bold" />
                  {lang === "sv" ? "Mainstream" : "Mainstream"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={busyId === candidate.id || !candidate.evidenceGate.canPromoteHiddenGem}
                  title={
                    candidate.evidenceGate.canPromoteHiddenGem
                      ? validationLabelText("known_hidden_gem", lang)
                      : lang === "sv"
                        ? "Kräver minst två oberoende icke-Google-signaler"
                        : "Requires at least two independent non-Google signals"
                  }
                  onClick={() => void promoteCandidate(candidate, "featured", "known_hidden_gem")}
                >
                  <ShieldCheck size={14} weight="bold" />
                  {lang === "sv" ? "Featured" : "Featured"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn muted"
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate, "candidate", "not_enough_evidence")}
                >
                  <Sliders size={14} weight="bold" />
                  {lang === "sv" ? "Mer bevis" : "More evidence"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn danger"
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate, "candidate", "closed_wrong_category")}
                >
                  <X size={14} weight="bold" />
                  {lang === "sv" ? "Stäng" : "Close"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-review-empty">
          <CheckCircle size={18} weight="bold" />
          <span>
            {searchQuery
              ? lang === "sv"
                ? `Inga ställen matchade "${searchQuery}".`
                : `No places matched "${searchQuery}".`
              : lang === "sv"
                ? "Inga poster i valt läge."
                : "No records in selected state."}
          </span>
          {searchQuery ? (
            <button
              type="button"
              className="admin-review-ghost-btn"
              style={{ marginTop: "8px", textDecoration: "underline" }}
              onClick={() => {
                setSearchQuery("");
                void loadCandidates(undefined, "");
              }}
            >
              {lang === "sv" ? "Rensa sökning" : "Clear search"}
            </button>
          ) : null}
        </div>
      )}
      <AdminToastContainer toasts={toasts} onDismiss={dismissToast} />
    </section>
  );
}

function dashboardStepLabel(
  step: AdminReviewDashboard["nextStep"] | undefined,
  loading: boolean,
  lang: Language,
) {
  if (loading && !step) {
    return lang === "sv" ? "Laddar" : "Loading";
  }
  const labels: Record<NonNullable<AdminReviewDashboard["nextStep"]>, { sv: string; en: string }> = {
    export: { sv: "Export nu", en: "Export now" },
    review: { sv: "Review nu", en: "Review now" },
    harvest: { sv: "Harvest nu", en: "Harvest now" },
    caught_up: { sv: "Ikapp", en: "Caught up" },
  };
  return labels[step ?? "caught_up"][lang];
}

function dashboardHeadline(
  dashboard: AdminReviewDashboard | null,
  loading: boolean,
  lang: Language,
) {
  if (loading && !dashboard) {
    return lang === "sv" ? "Läser sessionsstatus" : "Reading session status";
  }
  if (!dashboard) {
    return lang === "sv" ? "Sessionsstatus saknas" : "Session status unavailable";
  }
  if (dashboard.exportLogAvailable === false) {
    return lang === "sv" ? "Exportloggen saknar migration" : "Export log migration missing";
  }
  const labels: Record<NonNullable<AdminReviewDashboard["nextStep"]>, { sv: string; en: string }> = {
    export: { sv: "Exportera labels efter granskning", en: "Export labels after review" },
    review: { sv: "Starta en review-session", en: "Start a review session" },
    harvest: { sv: "Hämta mer oberoende evidens", en: "Harvest more independent evidence" },
    caught_up: { sv: "Inget akut i kön", en: "Nothing urgent in the queue" },
  };
  return labels[dashboard.nextStep ?? "caught_up"][lang];
}

function dashboardSubcopy(
  dashboard: AdminReviewDashboard | null,
  loading: boolean,
  lang: Language,
) {
  if (loading && !dashboard) {
    return lang === "sv" ? "Kontrollerar D1-kö, granskningshändelser och senaste export." : "Checking D1 queue, review events, and latest export.";
  }
  if (!dashboard) {
    return lang === "sv" ? "Lås upp med adminsession för att läsa live-status." : "Unlock with an admin session to read live status.";
  }
  if (dashboard.exportLogAvailable === false) {
    return lang === "sv" ? "Kör senaste D1-migrationerna så export-checkpoints kan sparas." : "Apply the latest D1 migrations so export checkpoints can be saved.";
  }

  const counts = dashboard.counts;
  if (dashboard.nextStep === "export") {
    return lang === "sv"
      ? `${counts?.unexportedReviewCount ?? 0} granskningsbeslut är nyare än senaste export.`
      : `${counts?.unexportedReviewCount ?? 0} review decisions are newer than the latest export.`;
  }
  if (dashboard.nextStep === "review") {
    return lang === "sv"
      ? `${counts?.candidateCount ?? 0} kandidater i kön, ${counts?.hiddenGemReadyCount ?? 0} redo för hidden-gem beslut.`
      : `${counts?.candidateCount ?? 0} candidates in queue, ${counts?.hiddenGemReadyCount ?? 0} ready for hidden-gem decisions.`;
  }
  if (dashboard.nextStep === "harvest") {
    return lang === "sv"
      ? `${counts?.needsEvidenceCount ?? 0} kandidater behöver fler eller färskare källsignaler.`
      : `${counts?.needsEvidenceCount ?? 0} candidates need more or fresher source signals.`;
  }
  return lang === "sv" ? "Inga oexporterade beslut och inga tydliga review-blockerare." : "No unexported decisions and no clear review blockers.";
}

function dashboardMetrics(dashboard: AdminReviewDashboard | null, lang: Language) {
  const counts = dashboard?.counts;
  return [
    {
      key: "new",
      label: lang === "sv" ? "Nya kandidater" : "New candidates",
      value: dashboardMetricValue(counts?.newCandidateCount),
      icon: <PlusCircle size={15} weight="bold" />,
      tone: counts?.newCandidateCount ? "review" : "neutral",
    },
    {
      key: "ready",
      label: lang === "sv" ? "Redo pärlor" : "Ready gems",
      value: dashboardMetricValue(counts?.hiddenGemReadyCount),
      icon: <Sparkle size={15} weight="bold" />,
      tone: counts?.hiddenGemReadyCount ? "review" : "neutral",
    },
    {
      key: "gaps",
      label: lang === "sv" ? "Källgap" : "Source gaps",
      value: dashboardMetricValue(counts?.needsEvidenceCount),
      icon: <Sliders size={15} weight="bold" />,
      tone: counts?.needsEvidenceCount ? "harvest" : "neutral",
    },
    {
      key: "duplicates",
      label: lang === "sv" ? "Dubbletter" : "Duplicates",
      value: dashboardMetricValue(counts?.possibleDuplicateCount),
      icon: <Scales size={15} weight="bold" />,
      tone: counts?.possibleDuplicateCount ? "review" : "neutral",
    },
    {
      key: "unexported",
      label: lang === "sv" ? "Oexporterat" : "Unexported",
      value: dashboardMetricValue(counts?.unexportedReviewCount),
      icon: <DownloadSimple size={15} weight="bold" />,
      tone: counts?.unexportedReviewCount ? "export" : "neutral",
    },
    {
      key: "last-export",
      label: lang === "sv" ? "Senaste export" : "Last export",
      value: dashboard?.lastExportedAt ? formatUpdatedDate(dashboard.lastExportedAt) : lang === "sv" ? "Aldrig" : "Never",
      icon: <CheckCircle size={15} weight="bold" />,
      tone: dashboard?.lastExportedAt ? "ok" : "neutral",
    },
  ];
}

function dashboardMetricValue(value: number | undefined) {
  return typeof value === "number" ? String(value) : "...";
}

function schemaStatusText(status: AdminSchemaStatus | null, lang: Language) {
  if (!status) {
    return lang === "sv" ? "Adminsession, DB-bindning och adminschema kontrolleras automatiskt." : "Admin session, DB binding, and admin schema are checked automatically.";
  }

  if (status.ready) {
    return lang === "sv" ? "Adminsession fungerar, DB är bunden och adminschema är redo." : "Admin session works, DB is bound, and admin schema is ready.";
  }

  if (status.baseSchemaReady === false) {
    return lang === "sv" ? "DB svarar, men grundtabellen saknas. Kör initial seed/import först." : "DB responds, but the base table is missing. Run the initial seed/import first.";
  }

  const missingCount = status.missing?.length ?? 0;
  return lang === "sv"
    ? `${missingCount} schemadelar saknades och förbereds automatiskt. Kör check igen om detta kvarstår.`
    : `${missingCount} schema parts were missing and are prepared automatically. Run check again if this remains.`;
}

export function readStoredAdminToken() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.sessionStorage.getItem("motkarta_admin_token") ?? "";
  } catch {
    return "";
  }
}

export function isAdminRoutePath() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/admin" || path.startsWith("/admin/") || path === "/api/admin/app";
}

function lifecycleStateLabel(state: AdminStateFilter | string, lang: Language) {
  const labels: Record<AdminStateFilter, { sv: string; en: string }> = {
    baseline: { sv: "Baseline", en: "Baseline" },
    candidate: { sv: "Kandidat", en: "Candidate" },
    verified: { sv: "Verifierad", en: "Verified" },
    featured: { sv: "Utvald", en: "Featured" },
    unresolved_region: { sv: "Saknar region", en: "Needs Region" },
    needs_input: { sv: "Saknar uppgifter", en: "Needs Info" },
    ml_dashboard: { sv: "🤖 ML & Modeller", en: "🤖 ML & Models" },
    all: { sv: "Alla", en: "All" },
  };
  return labels[state as AdminStateFilter]?.[lang] ?? state;
}

function validationLabelText(label: AdminValidationLabel, lang: Language) {
  const labels: Record<AdminValidationLabel, { sv: string; en: string }> = {
    known_mainstream: { sv: "Känd mainstream", en: "Known mainstream" },
    known_hidden_gem: { sv: "Känd dold pärla", en: "Known hidden gem" },
    not_enough_evidence: { sv: "Otillräckliga bevis", en: "Not enough evidence" },
    closed_wrong_category: { sv: "Stängd/fel kategori", en: "Closed/wrong category" },
  };
  return labels[label][lang];
}

function sourceGapLabel(gap: string, lang: Language) {
  const labels: Record<string, { sv: string; en: string }> = {
    needs_second_independent_evidence: { sv: "Behöver andra oberoende signalen", en: "Needs second independent signal" },
    needs_osm_or_open_data_match: { sv: "Behöver OSM/open-data match", en: "Needs OSM/open-data match" },
    needs_current_existence_signal: { sv: "Behöver aktuell existenssignal", en: "Needs current existence signal" },
    google_metadata_only: { sv: "Endast Google-metadata", en: "Google metadata only" },
  };
  return labels[gap]?.[lang] ?? gap.replaceAll("_", " ");
}

function duplicateReasonLabel(reason: string, lang: Language) {
  const labels: Record<string, { sv: string; en: string }> = {
    name_area: { sv: "namn + område", en: "name + area" },
    address: { sv: "adress", en: "address" },
    nearby_name: { sv: "nära + liknande namn", en: "nearby + similar name" },
    possible_match: { sv: "möjlig träff", en: "possible match" },
  };
  return labels[reason]?.[lang] ?? reason.replaceAll("_", " ");
}

function duplicateResolutionLabel(resolution: "merged" | "keep_separate", lang: Language) {
  const labels = {
    merged: { sv: "Dubblett ihopslagen med", en: "Duplicate merged into" },
    keep_separate: { sv: "Granskad som separat plats", en: "Reviewed as separate place" },
  };
  return labels[resolution][lang];
}

function stateFilterHelpText(filter: AdminStateFilter, lang: Language): string {
  switch (filter) {
    case "candidate":
      return lang === "sv"
        ? "Kandidater: Nya förslag från OSM, livsmedelskontroll och guider. Prioritera rader med '✨ X användartips' och kontrollera att platsen har minst 2 oberoende källor för dolda pärlor."
        : "Candidates: New proposals from OSM, inspections, and guides. Prioritize rows with '✨ X user tips' and check for 2 independent sources for hidden gems.";
    case "unresolved_region":
      return lang === "sv"
        ? "Saknar region: Platser med generiska Stockholm-etiketter. Klicka 'Lös saknade regioner' för polygon-batch eller välj stadsdel manuellt i dropdownen."
        : "Needs region: Places with broad Stockholm labels. Click 'Resolve missing regions' for polygon batch or select district manually.";
    case "needs_input":
      return lang === "sv"
        ? "Behöver input: Platser som saknar webbadress, gatuadress eller stadsdel. Använd 'Spara & hämta bild' för att auto-berika."
        : "Needs input: Places missing website, address, or district. Use 'Save & scrape photo' to enrich.";
    case "ml_dashboard":
      return lang === "sv"
        ? "ML-Dashboard: Live-telemetri för rekommendationshändelser, positionsbias (IPS gamma), modellversioner och representativa rättvisegrinder."
        : "ML Dashboard: Live recommendation telemetry, position bias (IPS gamma), model versions, and representation gates.";
    case "verified":
      return lang === "sv"
        ? "Verifierade: Granskade och godkända verksamheter som är aktiva och publicerade i Motkartas öppna katalog."
        : "Verified: Reviewed and approved venues published in Motkarta's active catalog.";
    case "featured":
      return lang === "sv"
        ? "Featured: Särskilt utvalda ställen med högsta synlighet i filter, startsidans kartsnabbval och concierge."
        : "Featured: Curated standout venues with highest visibility in filters, hero shortcuts, and concierge.";
    case "all":
    default:
      return lang === "sv"
        ? "Alla platser: Samtliga poster i D1 oavsett gransknings- och livscykelstatus."
        : "All places: Every establishment in D1 regardless of review or lifecycle state.";
  }
}

