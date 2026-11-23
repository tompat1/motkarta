import React, { useCallback, useEffect, useRef, useState } from "react";
import type { PlaceInput, PlaceLifecycleState } from "../../lib/scoring";
import type { VenueStatusCheckResult } from "../../lib/venue-status-check";
import { isBroadStockholmArea, STOCKHOLM_REGIONS as STOCKHOLM_REGION_NAMES } from "../../lib/stockholm-regions";
import type { Language } from "../app/shared";
import { formatUpdatedDate } from "../app/shared";
import { canonicalCuisineOptions } from "../../lib/cuisine-tags";
import { fetchWithD1Retry } from "../../lib/admin-d1";
import { AdminCoveragePanel } from "./AdminCoveragePanel";
import { AdminMlDashboard } from "./AdminMlDashboard";
import { AdminGuidePanel } from "./AdminGuidePanel";
import { AdminToastContainer, type AdminToast } from "./AdminToastContainer";
import { AdminMapView, type AdminMapCandidate } from "./AdminMapView";
import { AdminPhotoManager, type AdminPhotoManagerSaveHandle } from "./AdminPhotoManager";
import { AdminPlaceEditor, AdminPriceLevelPicker, candidateToPlaceDraft, emptyPlaceDraft, type AdminPlaceDraft } from "./AdminPlaceEditor";
import { AdminDistrictManager } from "./AdminDistrictManager";
import { AdminVenueTable, venueFreshness } from "./AdminVenueTable";
import {
  ArrowClockwise,
  ArrowRight,
  ArrowSquareOut,
  BookOpen,
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  FloppyDisk,
  ForkKnife,
  Globe,
  HouseLine,
  Info,
  ListBullets,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  PencilSimple,
  PlusCircle,
  Scales,
  ShieldCheck,
  SignOut,
  Sliders,
  Sparkle,
  Table as TableIcon,
  WarningCircle,
  X,
} from "@phosphor-icons/react";

type AdminStateFilter = PlaceLifecycleState | "pending_confirmation" | "unresolved_region" | "needs_input" | "ml_dashboard" | "all" | "removed";
type ConcourseRailTab = "desk" | "queue" | "duplicates" | "coverage" | "sources" | "ml" | "runbooks";
type AdminValidationLabel = NonNullable<PlaceInput["validationLabel"]>;
type DashboardQueueFocus = "all" | "new" | "hidden_gem_ready" | "missing_cuisine" | "needs_evidence" | "duplicates";
type DashboardNavTarget =
  | { kind: "queue"; focus: DashboardQueueFocus }
  | { kind: "sync" }
  | { kind: "ml_dashboard" };

export type AdminCandidate = {
  id: number;
  name: string;
  kind: string;
  cuisine?: string;
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
    missingCuisineCount?: number;
    missingCuisineCandidateCount?: number;
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
  quotaExceeded?: boolean;
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
import {
  isD1QuotaError,
  getNextMidnightUtc,
  formatEuropeanResetTime,
  localizeD1QuotaMessage,
} from "../../lib/admin-d1";
export {
  isD1QuotaError,
  getNextMidnightUtc,
  formatEuropeanResetTime,
  localizeD1QuotaMessage,
};

const adminStateFilters: AdminStateFilter[] = ["pending_confirmation", "all", "removed", "candidate", "baseline", "verified", "featured", "unresolved_region", "needs_input"];

export function AdminReviewPanel({
  lang = "sv",
  onSetLang,
  publishedCount,
  adminSession: propAdminSession,
  onSessionChange,
  onLogout,
  sourcesPanel,
}: {
  lang?: Language;
  onSetLang?: (next: Language) => void;
  publishedCount?: number;
  adminSession?: AdminSessionStatus | null;
  onSessionChange?: (session: AdminSessionStatus | null) => void;
  onLogout?: () => void;
  sourcesPanel?: React.ReactNode;
}) {
  const [tokenInput, setTokenInput] = useState(readStoredAdminToken);
  const [adminToken, setAdminToken] = useState(readStoredAdminToken);
  const [railTab, setRailTab] = useState<ConcourseRailTab>("queue");
  const [stateFilter, setStateFilter] = useState<AdminStateFilter>("candidate");
  const [queueFocus, setQueueFocus] = useState<DashboardQueueFocus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const queueSectionRef = useRef<HTMLDivElement>(null);
  const syncCardRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"table" | "list" | "map">("table");
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [exportingLabels, setExportingLabels] = useState(false);
  const [syncingPipeline, setSyncingPipeline] = useState(false);
  const [photoRefreshKeys, setPhotoRefreshKeys] = useState<Record<number, number>>({});
  const [resolvingRegions, setResolvingRegions] = useState(false);
  const [websiteInputs, setWebsiteInputs] = useState<Record<number, string>>({});
  const [addressInputs, setAddressInputs] = useState<Record<number, string>>({});
  const [priceLevelInputs, setPriceLevelInputs] = useState<Record<number, number | null>>({});
  const [cuisineInputs, setCuisineInputs] = useState<Record<number, string>>({});
  const [photoPendingByPlace, setPhotoPendingByPlace] = useState<Record<number, boolean>>({});
  const photoSaveHandlesRef = useRef<Record<number, AdminPhotoManagerSaveHandle>>({});
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
  const [districtNames, setDistrictNames] = useState<string[]>([...STOCKHOLM_REGION_NAMES]);
  const [placeEditorOpen, setPlaceEditorOpen] = useState(false);
  const [placeEditorMode, setPlaceEditorMode] = useState<"create" | "edit">("create");
  const [placeEditorDraft, setPlaceEditorDraft] = useState<AdminPlaceDraft>(emptyPlaceDraft());
  const [districtManagerOpen, setDistrictManagerOpen] = useState(false);
  const hasAdminAuth = adminSession?.admin === true;

  const [d1QuotaExceeded, setD1QuotaExceeded] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = window.sessionStorage.getItem("motkarta_d1_quota_exceeded");
      if (!saved) return false;
      const expiresAt = Number(saved);
      if (expiresAt && Date.now() < expiresAt) return true;
      window.sessionStorage.removeItem("motkarta_d1_quota_exceeded");
    } catch {}
    return false;
  });

  const markD1QuotaExceeded = useCallback(
    (errorMsg?: string) => {
      setD1QuotaExceeded(true);
      try {
        window.sessionStorage.setItem("motkarta_d1_quota_exceeded", String(getNextMidnightUtc()));
      } catch {}
      if (errorMsg) {
        setError(localizeD1QuotaMessage(errorMsg, lang));
      }
    },
    [lang],
  );

  const clearD1QuotaBlock = useCallback(() => {
    setD1QuotaExceeded(false);
    try {
      window.sessionStorage.removeItem("motkarta_d1_quota_exceeded");
    } catch {}
  }, []);

  const addToast = useCallback(
    (toast: Omit<AdminToast, "id" | "timestamp">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date();
      const timestamp = now.toLocaleTimeString(lang === "sv" ? "sv-SE" : "en-GB", {
        timeZone: "Europe/Stockholm",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      setToasts((prev) => [...prev.slice(-4), { ...toast, id, timestamp }]);
    },
    [lang],
  );

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
    async (tokenOverride?: string, queryOverride?: string, force = false) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setCandidates([]);
        setStatus("");
        return;
      }

      if (d1QuotaExceeded && !force) {
        setLoading(false);
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
        const isDuplicatesFocus = queueFocus === "duplicates";
        const includeDuplicates = isDuplicatesFocus || stateFilter !== "all" ? "&includeDuplicates=1" : "";
        const duplicatesOnlyParam = isDuplicatesFocus ? "&duplicatesOnly=1" : "";
        const url = `/api/admin/candidates?state=${stateFilter}&limit=200${includeDuplicates}${duplicatesOnlyParam}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
        const response = await fetchWithD1Retry(url, {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          candidates?: AdminCandidate[];
          error?: string;
          quotaExceeded?: boolean;
        };

        if (response.status === 429 || payload.quotaExceeded || isD1QuotaError(payload.error)) {
          markD1QuotaExceeded(payload.error);
          return;
        }

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
        if (isD1QuotaError(loadError)) {
          markD1QuotaExceeded(loadError instanceof Error ? loadError.message : String(loadError));
          return;
        }
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
    [addToast, adminHeaders, adminSession?.admin, adminToken, d1QuotaExceeded, lang, markD1QuotaExceeded, queueFocus, searchQuery, stateFilter],
  );

  const loadDistrictNames = useCallback(async () => {
    if (!hasAdminAuth) return;
    try {
      const response = await fetch("/api/admin/districts", { headers: adminHeaders() });
      const payload = (await response.json().catch(() => ({}))) as { districts?: Array<{ name: string }> };
      if (response.ok && payload.districts?.length) {
        setDistrictNames(payload.districts.map((row) => row.name));
      }
    } catch {
      setDistrictNames([...STOCKHOLM_REGION_NAMES]);
    }
  }, [adminHeaders, hasAdminAuth]);

  const scrollToSection = useCallback((ref: React.RefObject<HTMLElement | null>) => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const navigateDashboardTarget = useCallback(
    (target: DashboardNavTarget) => {
      if (target.kind === "sync") {
        scrollToSection(syncCardRef);
        return;
      }

      if (target.kind === "ml_dashboard") {
        setQueueFocus("all");
        setStateFilter("ml_dashboard");
        setViewMode("table");
        scrollToSection(queueSectionRef);
        return;
      }

      setStateFilter("candidate");
      setViewMode("table");
      setQueueFocus(target.focus);
      scrollToSection(queueSectionRef);
    },
    [scrollToSection],
  );

  const filteredCandidates = React.useMemo(() => {
    let rows = candidates;

    if (stateFilter === "candidate" && queueFocus !== "all") {
      if (queueFocus === "new") {
        rows = rows.filter(
          (candidate) =>
            !candidate.validationLabel && candidate.candidateReviewStatus !== "duplicate_checked_keep_separate",
        );
      } else if (queueFocus === "hidden_gem_ready") {
        rows = rows.filter((candidate) => candidate.evidenceGate.canPromoteHiddenGem);
      } else if (queueFocus === "missing_cuisine") {
        rows = rows.filter((candidate) => candidate.evidenceGate.sourceGaps.includes("needs_cuisine_label"));
      } else if (queueFocus === "needs_evidence") {
        rows = rows.filter((candidate) => candidate.evidenceGate.sourceGaps.length > 0);
      } else if (queueFocus === "duplicates") {
        rows = rows.filter(
          (candidate) =>
            candidate.possibleDuplicateCount > 0 && candidate.validationLabel !== "closed_wrong_category",
        );
      }
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => {
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
  }, [candidates, queueFocus, searchQuery, stateFilter]);

  const loadDashboard = useCallback(
    async (tokenOverride?: string, force = false) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setDashboard(null);
        return;
      }

      if (d1QuotaExceeded && !force) {
        setLoadingDashboard(false);
        return;
      }

      setLoadingDashboard(true);
      try {
        const response = await fetchWithD1Retry("/api/admin/review-dashboard", {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminReviewDashboard & { quotaExceeded?: boolean };

        if (response.status === 429 || payload.quotaExceeded || isD1QuotaError(payload.error)) {
          markD1QuotaExceeded(payload.error);
          return;
        }

        if (!response.ok) {
          throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte ladda sessionsstatus." : "Could not load session status."));
        }

        setDashboard(payload);
      } catch (dashboardError) {
        setDashboard(null);
        if (isD1QuotaError(dashboardError)) {
          markD1QuotaExceeded(dashboardError instanceof Error ? dashboardError.message : String(dashboardError));
          return;
        }
        setError(dashboardError instanceof Error ? dashboardError.message : String(dashboardError));
      } finally {
        setLoadingDashboard(false);
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, d1QuotaExceeded, lang, markD1QuotaExceeded],
  );

  const loadSchemaStatus = useCallback(
    async (tokenOverride?: string, force = false) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) {
        setSchemaStatus(null);
        return;
      }

      if (d1QuotaExceeded && !force) {
        return null;
      }

      try {
        const response = await fetch("/api/admin/schema", {
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminSchemaStatus;

        if (response.status === 429 || payload.quotaExceeded || isD1QuotaError(payload.error)) {
          markD1QuotaExceeded(payload.error);
          return payload;
        }

        if (!response.ok) {
          throw new Error(
            payload.error ??
              (lang === "sv"
                ? `Kunde inte läsa schema-status (HTTP ${response.status}).`
                : `Could not read schema status (HTTP ${response.status}).`),
          );
        }

        setSchemaStatus(payload);
        return payload;
      } catch (schemaError) {
        setSchemaStatus(null);
        if (isD1QuotaError(schemaError)) {
          markD1QuotaExceeded(schemaError instanceof Error ? schemaError.message : String(schemaError));
          return null;
        }
        setError(schemaError instanceof Error ? schemaError.message : String(schemaError));
        return null;
      }
    },
    [adminHeaders, adminSession?.admin, adminToken, d1QuotaExceeded, lang, markD1QuotaExceeded],
  );

  const runAdminSelfCheck = useCallback(
    async (tokenOverride?: string, force = false) => {
      const token = (tokenOverride ?? adminToken).trim();
      if (!token && !adminSession?.admin) return null;

      if (d1QuotaExceeded && !force) {
        setStatus(
          lang === "sv"
            ? `Runtime-check pausad: D1 daglig läskvot är nådd (återställs ${formatEuropeanResetTime(undefined, lang)}).`
            : `Runtime check paused: D1 daily read quota exceeded (resets at ${formatEuropeanResetTime(undefined, lang)}).`,
        );
        return null;
      }

      setSchemaBusy(true);
      setError(null);

      try {
        const response = await fetch("/api/admin/schema", {
          method: "POST",
          headers: adminHeaders(token),
        });
        const payload = (await response.json().catch(() => ({}))) as AdminSchemaStatus;

        if (response.status === 429 || payload.quotaExceeded || isD1QuotaError(payload.error)) {
          const quotaMsg = localizeD1QuotaMessage(
            payload.error ??
              (lang === "sv"
                ? "Cloudflare D1-kvot uppnådd (daglig läsgräns nådd). Runtime-check pausad."
                : "Cloudflare D1 quota reached (daily read limit exceeded). Runtime check paused."),
            lang,
          );
          markD1QuotaExceeded(quotaMsg);
          addToast({
            type: "warning",
            title: lang === "sv" ? "⏳ D1-kvot uppnådd" : "⏳ D1 Quota Reached",
            message: quotaMsg,
            detail:
              lang === "sv"
                ? `Kvoten återställs ${formatEuropeanResetTime(undefined, lang)}. Automatiska anrop pausade för att spara bandbredd.`
                : `Limit resets at ${formatEuropeanResetTime(undefined, lang)}. Automatic requests paused to conserve bandwidth.`,
          });
          return payload;
        }

        if (!response.ok) {
          throw new Error(
            payload.error ??
              (lang === "sv"
                ? `Kunde inte köra runtime-check (HTTP ${response.status}).`
                : `Could not run runtime check (HTTP ${response.status}).`),
          );
        }

        clearD1QuotaBlock();
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
        }
        return payload;
      } catch (schemaError) {
        setDashboard(null);
        setCandidates([]);
        if (isD1QuotaError(schemaError)) {
          const quotaMsg = schemaError instanceof Error ? schemaError.message : String(schemaError);
          markD1QuotaExceeded(quotaMsg);
          return null;
        }
        setError(schemaError instanceof Error ? schemaError.message : String(schemaError));
        return null;
      } finally {
        setSchemaBusy(false);
      }
    },
    [addToast, adminHeaders, adminSession?.admin, adminToken, clearD1QuotaBlock, d1QuotaExceeded, lang, loadCandidates, loadDashboard, markD1QuotaExceeded],
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
    if (adminSession?.admin && !d1QuotaExceeded) {
      void runAdminSelfCheck(adminToken);
    }
  }, [adminSession?.admin, d1QuotaExceeded]);

  useEffect(() => {
    if (!hasAdminAuth || !schemaStatus?.ready || d1QuotaExceeded) return;
    let cancelled = false;
    void (async () => {
      await loadCandidates();
      if (cancelled) return;
      await loadDashboard();
      if (cancelled) return;
      await loadDistrictNames();
    })();
    return () => {
      cancelled = true;
    };
  }, [hasAdminAuth, schemaStatus?.ready, d1QuotaExceeded, loadCandidates, loadDashboard, loadDistrictNames]);

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
    validationLabel: AdminValidationLabel | null,
  ) => {
    if (!hasAdminAuth) return;

    if (validationLabel === "closed_wrong_category" && !window.confirm(lang === "sv"
      ? `Ta bort ${candidate.name} från publik karta, listor och concierge som stängd/fel kategori? Posten sparas under Borttagna och kan återställas.`
      : `Remove ${candidate.name} from the public map, lists and concierge as closed/wrong category? The record is kept under Removed and can be restored.`)) return;
    if (validationLabel === null && candidate.validationLabel === "closed_wrong_category" && !window.confirm(lang === "sv"
      ? `Återställ ${candidate.name} till Baseline? Bekräfta att stället är öppet och hör hemma i katalogen. En separat stängningsmarkering i källdatan måste också rättas.`
      : `Restore ${candidate.name} to Baseline? Confirm it is open and belongs in the catalog. Any separate closure in the source dataset must also be corrected.`)) return;

    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
    const needsHiddenGemOverride =
      validationLabel === "known_hidden_gem" && !candidate.evidenceGate.canPromoteHiddenGem;
    if (needsHiddenGemOverride) {
      if (!validationNotes) {
        setError(
          lang === "sv"
            ? "Skriv en granskningsnotering som förklarar varför du gör en redaktionell dold-pärla-override."
            : "Add a review note explaining this editorial hidden-gem override.",
        );
        return;
      }
      const confirmed = window.confirm(
        lang === "sv"
          ? `${candidate.name} har bara ${candidate.evidenceGate.independentEvidenceCount}/2 oberoende källor. Vill du göra en redaktionell override och markera som dold pärla ändå?`
          : `${candidate.name} only has ${candidate.evidenceGate.independentEvidenceCount}/2 independent sources. Apply an editorial override and mark as hidden gem anyway?`,
      );
      if (!confirmed) return;
    }
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
          adminOverrideHiddenGem: needsHiddenGemOverride,
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

          if (stateFilter !== "all" && (stateFilter === "removed" ? validationLabel !== "closed_wrong_category" : lifecycleState !== stateFilter)) {
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

      if (validationLabel === "closed_wrong_category" || validationLabel === null) {
        addToast({
          type: "success",
          title: validationLabel === null
            ? (lang === "sv" ? "Återställd till Baseline" : "Restored to Baseline")
            : (lang === "sv" ? "Borttagen från publicering" : "Removed from publication"),
          message: candidate.name,
          detail: lang === "sv"
            ? "Gäller nya sidladdningar och conciergefrågor. Historik och källdata finns kvar."
            : "Applies to new page loads and concierge queries. History and source data are retained.",
        });
      } else if (validationLabel === "known_hidden_gem") {
        addToast({
          type: "ml_event",
          title: lang === "sv" ? "✨ Promoverad: Dold Pärla" : "✨ Promoted: Hidden Gem",
          message: `${candidate.name} (#${candidate.id}) ➔ ${lifecycleStateLabel(lifecycleState, lang)}`,
          detail: needsHiddenGemOverride
            ? (lang === "sv"
              ? "Redaktionell admin-override (dubbellås ej uppfyllt). Beslutet loggas i granskningsnotering och audit."
              : "Editorial admin override (double-lock not met). Decision logged in review note and audit.")
            : (lang === "sv"
              ? "Dubbellås godkänt (2+ oberoende källor). Platsen rankas upp i 'Dolda pärlor'-läget och Concierge RAG. Kommersiella betyg förblir i strikt karantän."
              : "Double-lock approved (2+ independent sources). Venue boosted in Hidden Gems mode and Concierge RAG. Commercial platform ratings remain quarantined."),
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

  const batchUpdateCandidateRegion = async (candidatesToUpdate: AdminMapCandidate[], district: string) => {
    if (!hasAdminAuth || !district || candidatesToUpdate.length === 0) return;

    setError(null);
    let successCount = 0;
    const errors: string[] = [];

    // Process in concurrent chunks of 4 to be fast and safe with D1
    const chunkSize = 4;
    for (let i = 0; i < candidatesToUpdate.length; i += chunkSize) {
      const chunk = candidatesToUpdate.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (candidate) => {
          const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();
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
            if (response.ok) {
              successCount++;
            } else {
              const payload = (await response.json().catch(() => ({}))) as { error?: string };
              errors.push(`${candidate.name}: ${payload.error || "Fel"}`);
            }
          } catch (err) {
            errors.push(`${candidate.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        })
      );
    }

    const updatedIds = new Set(candidatesToUpdate.map((c) => c.id));
    const nowIso = new Date().toISOString();

    setCandidates((current) =>
      current.flatMap((row) => {
        if (!updatedIds.has(row.id)) return [row];
        if (stateFilter === "unresolved_region" && !isBroadStockholmArea(district)) {
          return [];
        }
        return [{ ...row, area: district, updatedAt: nowIso }];
      })
    );

    if (successCount > 0) {
      setStatus(
        lang === "sv"
          ? `${successCount} ställen uppdaterades till region ${district}.`
          : `${successCount} places updated to region ${district}.`,
      );
      addToast({
        type: "success",
        title: lang === "sv" ? `📍 Flerval: ${successCount} ställen tilldelade` : `📍 Batch: ${successCount} places assigned`,
        message: lang === "sv"
          ? `${successCount} ställen tilldelades stadsdel ${district}`
          : `${successCount} places assigned to district ${district}`,
        detail: lang === "sv"
          ? "Sparat direkt i D1. Kartan och driftmåtten uppdaterade i realtid."
          : "Persisted directly to D1. Map and drift metrics updated live.",
      });
      void loadDashboard();
    }

    if (errors.length > 0) {
      addToast({
        type: "warning",
        title: lang === "sv" ? "Vissa uppdateringar misslyckades" : "Some updates failed",
        message: errors.slice(0, 3).join(", "),
      });
    }
  };

  const candidateDetailsPending = (candidate: AdminCandidate) => {
    const addressDraft = (addressInputs[candidate.id] ?? candidate.address ?? "").trim();
    const addressPending = addressDraft !== (candidate.address ?? "").trim();
    const priceDraft = Object.prototype.hasOwnProperty.call(priceLevelInputs, candidate.id)
      ? priceLevelInputs[candidate.id]
      : candidate.priceLevel ?? null;
    const pricePending = priceDraft !== (candidate.priceLevel ?? null);
    const cuisineDraft = (cuisineInputs[candidate.id] ?? candidate.cuisine ?? "").trim();
    const cuisinePending = cuisineDraft !== (candidate.cuisine ?? "").trim();
    return addressPending || pricePending || cuisinePending;
  };

  const candidatePlacePending = (candidate: AdminCandidate) =>
    candidateDetailsPending(candidate) || Boolean(photoPendingByPlace[candidate.id]);

  const persistCandidateDetails = async (candidate: AdminCandidate) => {
    const address = (addressInputs[candidate.id] ?? candidate.address ?? "").trim();
    const priceLevel = Object.prototype.hasOwnProperty.call(priceLevelInputs, candidate.id)
      ? priceLevelInputs[candidate.id]
      : candidate.priceLevel ?? null;
    const cuisine = (cuisineInputs[candidate.id] ?? candidate.cuisine ?? "").trim();
    const validationNotes = (reviewNotes[candidate.id] ?? candidate.validationNotes ?? "").trim();

    const response = await fetch("/api/admin/candidates", {
      method: "POST",
      headers: adminHeaders(undefined, { "content-type": "application/json" }),
      body: JSON.stringify({
        action: "update_place",
        id: candidate.id,
        name: candidate.name,
        kind: candidate.kind,
        area: candidate.area,
        address,
        website: candidate.website ?? "",
        note: candidate.note,
        latitude: candidate.latitude ?? 59.3293,
        longitude: candidate.longitude ?? 18.0686,
        lifecycleState: candidate.lifecycleState,
        validationLabel: candidate.validationLabel,
        priceLevel,
        cuisine,
        validationNotes,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      candidate?: AdminCandidate;
      error?: string;
    };

    if (!response.ok || !payload.candidate) {
      throw new Error(payload.error ?? (lang === "sv" ? "Kunde inte spara platsdetaljer." : "Could not save place details."));
    }

    setCandidates((current) =>
      current.map((row) => (row.id === candidate.id ? { ...row, ...payload.candidate } : row)),
    );
    setAddressInputs((current) => {
      const next = { ...current };
      delete next[candidate.id];
      return next;
    });
    setPriceLevelInputs((current) => {
      const next = { ...current };
      delete next[candidate.id];
      return next;
    });
    setCuisineInputs((current) => {
      const next = { ...current };
      delete next[candidate.id];
      return next;
    });

    return payload.candidate;
  };

  const updateCandidateDetails = async (candidate: AdminCandidate) => {
    if (!hasAdminAuth) return;
    setBusyId(candidate.id);
    setError(null);

    try {
      await persistCandidateDetails(candidate);
      setStatus(
        lang === "sv"
          ? `Adress och prisnivå sparade för ${candidate.name}.`
          : `Saved address and price level for ${candidate.name}.`,
      );
      addToast({
        type: "success",
        title: lang === "sv" ? "Platsdetaljer sparade" : "Place details saved",
        message: `${candidate.name} (#${candidate.id})`,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  const saveCandidatePlace = async (candidate: AdminCandidate) => {
    if (!hasAdminAuth) return;

    const detailsPending = candidateDetailsPending(candidate);
    const photoPending = Boolean(photoPendingByPlace[candidate.id]);
    if (!detailsPending && !photoPending) {
      setStatus(lang === "sv" ? "Inget att spara för denna plats." : "Nothing to save for this place.");
      return;
    }

    setBusyId(candidate.id);
    setError(null);

    try {
      if (detailsPending) {
        await persistCandidateDetails(candidate);
      }

      if (photoPending) {
        const handle = photoSaveHandlesRef.current[candidate.id];
        const saved = await handle?.savePending();
        if (!saved) {
          throw new Error(lang === "sv" ? "Kunde inte spara hero-bilden." : "Could not save the hero image.");
        }
        setPhotoRefreshKeys((current) => ({
          ...current,
          [candidate.id]: (current[candidate.id] ?? 0) + 1,
        }));
      }

      setStatus(
        lang === "sv"
          ? `Platsen ${candidate.name} sparades i D1.`
          : `Saved ${candidate.name} to D1.`,
      );
      addToast({
        type: "success",
        title: lang === "sv" ? "Plats sparad" : "Place saved",
        message: `${candidate.name} (#${candidate.id})`,
        detail: lang === "sv"
          ? "Hero-bild, ram och platsdetaljer är sparade."
          : "Hero image, frame, and place details are saved.",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
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
        scrapeSkippedReason?: string | null;
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

      const logoBannerSkipped = payload.scrapeSkippedReason === "logo_banner";
      setStatus(
        payload.scrapedPhotoUrl
          ? lang === "sv"
            ? `Webbplats sparad för ${candidate.name} & bild hämtades (${payload.scrapedPhotoUrl}).`
            : `Saved website for ${candidate.name} & scraped official photo (${payload.scrapedPhotoUrl}).`
          : logoBannerSkipped
            ? lang === "sv"
              ? `Webbplats sparad för ${candidate.name}. og:image hoppades över (logotyp/banner).`
              : `Saved website for ${candidate.name}. og:image skipped (logo/social banner).`
            : lang === "sv"
              ? `Webbplats sparad för ${candidate.name}.`
              : `Saved website for ${candidate.name}.`,
      );
      addToast({
        type: payload.scrapedPhotoUrl ? "success" : logoBannerSkipped ? "warning" : "info",
        title: payload.scrapedPhotoUrl
          ? lang === "sv"
            ? "🌐 Webb & bild sparad"
            : "🌐 Website & Photo Saved"
          : logoBannerSkipped
            ? lang === "sv"
              ? "🌐 Webb sparad, logobild hoppades över"
              : "🌐 Website saved, logo banner skipped"
            : lang === "sv"
              ? "🌐 Webb sparad"
              : "🌐 Website Saved",
        message: `${candidate.name} (#${candidate.id}) ➔ ${updatedWebsite}`,
        detail: payload.scrapedPhotoUrl
          ? lang === "sv"
            ? "og:image sparad i D1. Uppdaterar bildlistan och evidensremsan nedan."
            : "og:image saved in D1. Refreshing the image list and evidence strip below."
          : logoBannerSkipped
            ? lang === "sv"
              ? "Webbplatsen räknas som officiell källa, men auto-skrapad og:image var en logotyp/banner. Lägg till en riktig bild-URL manuellt nedan."
              : "Website counts as an official source, but the auto-scraped og:image was a logo/social banner. Add a real image URL manually below."
            : lang === "sv"
              ? "Ingen og:image hittades i HTML. Webbadressen sparades som verifierad källa (konfidens 0.9)."
              : "No og:image found in HTML. Website saved as verified source (confidence 0.9).",
      });
      if (payload.scrapedPhotoUrl || logoBannerSkipped) {
        setPhotoRefreshKeys((current) => ({
          ...current,
          [candidate.id]: (current[candidate.id] ?? 0) + 1,
        }));
      }
      void loadCandidates();
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

  const [bulkConfirmBusy, setBulkConfirmBusy] = useState(false);
  const [venueStatusChecks, setVenueStatusChecks] = useState<Record<number, VenueStatusCheckResult>>({});
  const [checkingStatusIds, setCheckingStatusIds] = useState<Set<number>>(new Set());

  const checkVenuesOperationalStatus = async (rows: AdminCandidate[]) => {
    if (!hasAdminAuth || rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    setCheckingStatusIds((prev) => new Set([...prev, ...ids]));
    setError(null);

    const nextResults: Record<number, VenueStatusCheckResult> = {};
    let failedBatches = 0;

    for (let start = 0; start < rows.length; start += 10) {
      const batch = rows.slice(start, start + 10);
      try {
        const response = await fetch("/api/admin/check-status", {
          method: "POST",
          headers: adminHeaders(undefined, { "content-type": "application/json" }),
          body: JSON.stringify({
            venues: batch.map((row) => ({
              id: row.id,
              name: row.name,
              area: row.area,
              website: row.website,
              latitude: row.latitude,
              longitude: row.longitude,
            })),
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          results?: VenueStatusCheckResult[];
          error?: string;
        };
        if (!response.ok) {
          failedBatches += 1;
        } else {
          for (const res of payload.results ?? []) {
            nextResults[res.id] = res;
          }
        }
      } catch {
        failedBatches += 1;
      }
    }

    setVenueStatusChecks((prev) => ({ ...prev, ...nextResults }));
    setCheckingStatusIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });

    const checkedList = Object.values(nextResults);
    if (checkedList.length > 0) {
      const closedCount = checkedList.filter((r) => r.status === "permanently_closed").length;
      const tempCount = checkedList.filter((r) => r.status === "temporarily_closed").length;
      const downCount = checkedList.filter((r) => r.status === "website_down").length;
      const openCount = checkedList.filter((r) => r.status === "open").length;
      setStatus(
        lang === "sv"
          ? `Status kontrollerad för ${checkedList.length} ställen: ${openCount} öppna, ${closedCount} permanent stängda, ${tempCount} tillfälligt stängda, ${downCount} hemsida nere.`
          : `Status checked for ${checkedList.length} places: ${openCount} open, ${closedCount} permanently closed, ${tempCount} temporarily closed, ${downCount} website down.`,
      );
    }
    if (failedBatches > 0) {
      setError(
        lang === "sv"
          ? "Vissa statuskontroller kunde inte slutföras. Försök igen."
          : "Some status checks could not complete. Please retry.",
      );
    }
  };

  const batchConfirmOrDismissCandidates = async (
    selectedRows: AdminCandidate[],
    mode: "confirm" | "dismiss",
  ) => {
    if (!hasAdminAuth || selectedRows.length === 0 || bulkConfirmBusy) return;
    const isConfirm = mode === "confirm";
    const promptMsg = isConfirm
      ? lang === "sv"
        ? `Bekräfta och publicera ${selectedRows.length} valda platser på kartan som Verifierad?`
        : `Confirm and publish ${selectedRows.length} selected places to the map as Verified?`
      : lang === "sv"
        ? `Avvisa ${selectedRows.length} valda platser som stängda/fel kategori? De flyttas till Borttagna och kan återställas.`
        : `Dismiss ${selectedRows.length} selected places as closed/wrong category? They will move to Removed and can be restored.`;
    if (!window.confirm(promptMsg)) return;

    setBulkConfirmBusy(true);
    setError(null);
    const succeededIds = new Set<number>();
    let failedCount = 0;

    for (const row of selectedRows) {
      try {
        const response = await fetch("/api/admin/candidates", {
          method: "POST",
          headers: adminHeaders(undefined, { "content-type": "application/json" }),
          body: JSON.stringify({
            id: row.id,
            state: isConfirm ? "verified" : "candidate",
            validationLabel: isConfirm ? null : "closed_wrong_category",
            validationNotes: isConfirm
              ? (row.validationNotes || "Manually confirmed in batch review.")
              : (row.validationNotes || "Dismissed in batch review as closed/wrong category."),
          }),
        });
        if (response.ok) {
          succeededIds.add(row.id);
        } else {
          failedCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }

    if (succeededIds.size > 0) {
      setCandidates((current) =>
        current.flatMap((row) => {
          if (!succeededIds.has(row.id)) return [row];
          if (stateFilter === "all") {
            return [{
              ...row,
              lifecycleState: isConfirm ? "verified" : "candidate",
              validationLabel: isConfirm ? null : "closed_wrong_category",
            }];
          }
          return [];
        }),
      );
      setStatus(
        isConfirm
          ? lang === "sv"
            ? `Bekräftade och publicerade ${succeededIds.size} av ${selectedRows.length} platser.`
            : `Confirmed and published ${succeededIds.size} of ${selectedRows.length} places.`
          : lang === "sv"
            ? `Avvisade ${succeededIds.size} av ${selectedRows.length} platser.`
            : `Dismissed ${succeededIds.size} of ${selectedRows.length} places.`,
      );
      void loadDashboard();
    }
    if (failedCount > 0) {
      setError(
        lang === "sv"
          ? `${failedCount} platser kunde inte uppdateras. Försök igen.`
          : `${failedCount} places could not be updated. Please retry.`,
      );
    }
    setBulkConfirmBusy(false);
  };

  const batchMergeCandidates = async (
    primary: AdminCandidate,
    duplicates: AdminCandidate[],
  ) => {
    if (!hasAdminAuth || duplicates.length === 0 || bulkConfirmBusy) return;
    setBulkConfirmBusy(true);
    setError(null);
    const mergedIds = new Set<number>();
    let failedCount = 0;

    for (const dup of duplicates) {
      if (dup.id === primary.id) continue;
      try {
        const response = await fetch("/api/admin/candidates", {
          method: "POST",
          headers: adminHeaders(undefined, { "content-type": "application/json" }),
          body: JSON.stringify({
            action: "merge_duplicate",
            id: dup.id,
            targetId: primary.id,
            validationNotes: `Merged selected duplicate #${dup.id} into #${primary.id} (${primary.name}).`,
          }),
        });
        if (response.ok) {
          mergedIds.add(dup.id);
        } else {
          failedCount += 1;
        }
      } catch {
        failedCount += 1;
      }
    }

    if (mergedIds.size > 0) {
      setCandidates((current) => current.filter((row) => !mergedIds.has(row.id)));
      setStatus(
        lang === "sv"
          ? `Slog ihop ${mergedIds.size} dubblett(er) in i ${primary.name} (#${primary.id}). Bevis och taggar kopierades.`
          : `Merged ${mergedIds.size} duplicate(s) into ${primary.name} (#${primary.id}). Evidence and tags were preserved.`,
      );
      void loadDashboard();
    }
    if (failedCount > 0) {
      setError(
        lang === "sv"
          ? `${failedCount} sammanslagning(ar) misslyckades. Kontrollera att huvudposten inte har status Kandidat.`
          : `${failedCount} merge(s) failed. Make sure the primary venue is Baseline, Verified, or Featured.`,
      );
    }
    setBulkConfirmBusy(false);
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

  const isDeskRailTab = railTab === "desk" || railTab === "queue" || railTab === "duplicates";
  const duplicateCount =
    dashboard?.counts?.possibleDuplicateCount ??
    candidates.filter((candidate) => candidate.possibleDuplicateCount > 0).length;
  const reviewQueueCount =
    dashboard?.counts?.candidateCount ??
    candidates.filter((candidate) => candidate.lifecycleState === "candidate").length;
  const freshCount = candidates.filter((candidate) => venueFreshness(candidate, lang).state === "fresh").length;
  const freshPercentLabel =
    candidates.length > 0 ? `${Math.round((freshCount / candidates.length) * 100)}%` : "—";
  const coveredCount = candidates.filter(
    (candidate) => Boolean(candidate.address && candidate.area && !isBroadStockholmArea(candidate.area)),
  ).length;
  const coveragePercentLabel =
    candidates.length > 0 ? `${Math.round((coveredCount / candidates.length) * 100)}%` : "—";
  const publishedDisplayCount = publishedCount && publishedCount > 0 ? publishedCount : candidates.length;
  const todayLabel = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
    .format(new Date())
    .toUpperCase();

  const nextAction =
    duplicateCount > 0
      ? {
          label:
            lang === "sv"
              ? `Lös ${duplicateCount} dubbletter →`
              : `Resolve ${duplicateCount} duplicates →`,
          onClick: () => {
            setRailTab("duplicates");
            setStateFilter("candidate");
            setQueueFocus("duplicates");
            setViewMode("table");
          },
        }
      : reviewQueueCount > 0
        ? {
            label:
              lang === "sv"
                ? `Granska ${reviewQueueCount} kandidater →`
                : `Review ${reviewQueueCount} candidates →`,
            onClick: () => {
              setRailTab("queue");
              setStateFilter("candidate");
              setQueueFocus("all");
              setViewMode("table");
            },
          }
        : (dashboard?.counts?.unexportedReviewCount ?? 0) > 0
          ? {
              label:
                lang === "sv"
                  ? `Synka ${dashboard?.counts?.unexportedReviewCount} beslut →`
                  : `Sync ${dashboard?.counts?.unexportedReviewCount} decisions →`,
              onClick: () => setRailTab("runbooks"),
            }
          : {
              label: lang === "sv" ? "Öppna platsregistret →" : "Open venue desk →",
              onClick: () => {
                setRailTab("desk");
                setStateFilter("all");
                setQueueFocus("all");
                setViewMode("table");
              },
            };

  return (
    <div className="admin-concourse-shell" id="admin-review">
      <aside className="admin-concourse-rail" aria-label={lang === "sv" ? "Adminnavigering" : "Admin navigation"}>
        <a className="admin-concourse-brand" href="/" aria-label="MOTKARTA">
          MOTKARTA<i aria-hidden="true" />
        </a>

        <nav className="admin-concourse-nav">
          <button
            type="button"
            className={`admin-concourse-nav-item ${railTab === "desk" ? "on" : ""}`}
            aria-current={railTab === "desk" ? "page" : undefined}
            onClick={() => {
              setRailTab("desk");
              setStateFilter("all");
              setQueueFocus("all");
              setViewMode("table");
            }}
          >
            <span>{lang === "sv" ? "Platsdesk" : "Venue desk"}</span>
          </button>

          <button
            type="button"
            className={`admin-concourse-nav-item ${railTab === "queue" ? "on" : ""}`}
            aria-current={railTab === "queue" ? "page" : undefined}
            onClick={() => {
              setRailTab("queue");
              setStateFilter("pending_confirmation");
              setQueueFocus("all");
              setViewMode("table");
            }}
          >
            <span>{lang === "sv" ? "Granskningskö" : "Review queue"}</span>
            <span className="admin-concourse-nav-count">{reviewQueueCount}</span>
          </button>

          <button
            type="button"
            className={`admin-concourse-nav-item ${railTab === "duplicates" ? "on" : ""}`}
            aria-current={railTab === "duplicates" ? "page" : undefined}
            onClick={() => {
              setRailTab("duplicates");
              setStateFilter("candidate");
              setQueueFocus("duplicates");
              setViewMode("list");
            }}
          >
            <span>{lang === "sv" ? "Dubbletter" : "Duplicates"}</span>
            <span className="admin-concourse-nav-count">{duplicateCount}</span>
          </button>

          <button
            type="button"
            className={`admin-concourse-nav-item ${railTab === "coverage" ? "on" : ""}`}
            aria-current={railTab === "coverage" ? "page" : undefined}
            onClick={() => setRailTab("coverage")}
          >
            <span>{lang === "sv" ? "Täckning" : "Coverage"}</span>
          </button>

          <button
            type="button"
            className={`admin-concourse-nav-item ${railTab === "sources" ? "on" : ""}`}
            aria-current={railTab === "sources" ? "page" : undefined}
            onClick={() => setRailTab("sources")}
          >
            <span>{lang === "sv" ? "Källor" : "Sources"}</span>
          </button>

          <button
            type="button"
            className={`admin-concourse-nav-item ${railTab === "ml" ? "on" : ""}`}
            aria-current={railTab === "ml" ? "page" : undefined}
            onClick={() => {
              setRailTab("ml");
              setStateFilter("ml_dashboard");
            }}
          >
            <span>{lang === "sv" ? "ML & utvärdering" : "ML & evaluation"}</span>
          </button>

          <button
            type="button"
            className={`admin-concourse-nav-item ${railTab === "runbooks" ? "on" : ""}`}
            aria-current={railTab === "runbooks" ? "page" : undefined}
            onClick={() => setRailTab("runbooks")}
          >
            <span>{lang === "sv" ? "Handbok & synk" : "Runbooks"}</span>
          </button>
        </nav>

        <div className="admin-concourse-rail-foot">
          <div className="admin-concourse-rail-role">ADMINISTRATOR</div>
          <div className="admin-concourse-rail-email">
            {adminSession?.email
              ? adminSession.email
              : hasAdminAuth
                ? lang === "sv"
                  ? "Adminsession aktiv"
                  : "Admin session active"
                : lang === "sv"
                  ? "Ej inloggad"
                  : "Not signed in"}
          </div>
          <div className={`admin-concourse-rail-status ${d1QuotaExceeded ? "is-warn" : schemaStatus?.ready ? "is-ready" : ""}`}>
            {d1QuotaExceeded
              ? lang === "sv"
                ? "Pausad (D1-kvot)"
                : "Paused (D1 quota)"
              : schemaStatus?.ready
                ? lang === "sv"
                  ? "Runtime redo"
                  : "Runtime ready"
                : schemaBusy
                  ? lang === "sv"
                    ? "Kontrollerar..."
                    : "Checking..."
                  : lang === "sv"
                    ? "Runtime-check"
                    : "Runtime check"}
          </div>
          {hasAdminAuth && onLogout ? (
            <button
              type="button"
              className="admin-concourse-rail-logout"
              onClick={onLogout}
              title={lang === "sv" ? "Logga ut från adminsession" : "Log out from admin session"}
            >
              <SignOut size={13} weight="bold" />
              {adminSession?.authMode === "token"
                ? lang === "sv"
                  ? "Glöm token"
                  : "Forget token"
                : lang === "sv"
                  ? "Logga ut"
                  : "Log out"}
            </button>
          ) : null}
        </div>
      </aside>

      <main className="admin-concourse-main">
        <header className="admin-concourse-top">
          <strong>{lang === "sv" ? "Datahantering & admin" : "Data management dashboard"}</strong>
          <div className="admin-concourse-top-meta">
            <span className="admin-concourse-account">STOCKHOLM · {todayLabel}</span>
            {onSetLang ? (
              <div className="admin-concourse-lang" aria-label="Language selector">
                <button
                  type="button"
                  className={lang === "sv" ? "active" : ""}
                  onClick={() => onSetLang("sv")}
                >
                  SV
                </button>
                <span aria-hidden="true">/</span>
                <button
                  type="button"
                  className={lang === "en" ? "active" : ""}
                  onClick={() => onSetLang("en")}
                >
                  EN
                </button>
              </div>
            ) : null}
            <a className="admin-concourse-map-link" href="/">
              ← {lang === "sv" ? "Karta" : "Map"}
            </a>
          </div>
        </header>

        <section className="admin-concourse-content" aria-labelledby="admin-app-title">
          <div className="admin-concourse-head">
            <div>
              <h1 id="admin-app-title">
                {railTab === "coverage"
                  ? lang === "sv"
                    ? "TÄCKNING & DISTRIKT"
                    : "COVERAGE & DISTRICTS"
                  : railTab === "sources"
                    ? lang === "sv"
                      ? "KÄLLREGISTER"
                      : "CURATED SOURCES"
                    : railTab === "ml"
                      ? lang === "sv"
                        ? "ML & UTVÄRDERING"
                        : "ML & EVALUATION"
                      : railTab === "runbooks"
                        ? lang === "sv"
                          ? "HANDBOK & PIPELINE-SYNK"
                          : "RUNBOOKS & SYNC"
                        : railTab === "queue"
                          ? lang === "sv"
                            ? "GRANSKNINGSKÖ · ATT BEKRÄFTA"
                            : "REVIEW QUEUE · PENDING APPROVAL"
                          : railTab === "duplicates"
                            ? lang === "sv"
                              ? "DUBBLETTER & KONFLIKTER"
                              : "DUPLICATE RESOLUTION"
                            : lang === "sv"
                              ? "PLATSREGISTER · DATA DESK"
                              : "VENUE DATA DESK"}
              </h1>
              <p>
                {railTab === "coverage"
                  ? lang === "sv"
                    ? "Överblick över stadsdelar, saknade regioner och katalogtäckning i Stockholm."
                    : "District coverage, unresolved regions, and catalog completeness across Stockholm."
                  : railTab === "sources"
                    ? lang === "sv"
                      ? "Redaktionella guider, källverifiering och oberoende signaler."
                      : "Editorial guides, source provenance, and independent verification signals."
                    : railTab === "ml"
                      ? lang === "sv"
                        ? "Live-telemetri för rekommendationsranking, positionsbias och rättvisegrinder."
                        : "Live recommendation telemetry, position bias, and representation gates."
                      : railTab === "runbooks"
                        ? lang === "sv"
                          ? "Standardrutiner (SOP), runtime-kontroll och synkronisering av granskningsetiketter."
                          : "Operating runbooks, D1 runtime checks, and human-label pipeline sync."
                        : railTab === "queue"
                          ? lang === "sv"
                            ? "Nya platser som ännu inte syns på kartan och kräver manuell bekräftelse innan publicering."
                            : "New places not yet shown on the map awaiting manual confirmation before publishing."
                          : railTab === "duplicates"
                            ? lang === "sv"
                              ? "Jämför misstänkta dubbletter sida vid sida och slå ihop eller behåll som separata ställen."
                              : "Compare suspected duplicate candidates side-by-side and merge or keep separate."
                            : lang === "sv"
                              ? "Sök och hantera alla publicerade och väntande platser i den öppna katalogen."
                              : "Browse and manage all published and candidate venues across the public catalog."}
              </p>
            </div>
            <button
              type="button"
              className="admin-concourse-primary-btn"
              onClick={() => {
                setPlaceEditorMode("create");
                setPlaceEditorDraft(emptyPlaceDraft());
                setPlaceEditorOpen(true);
              }}
              disabled={!hasAdminAuth || schemaStatus?.ready !== true}
              title={lang === "sv" ? "Lägg till en ny plats manuellt" : "Add a new place manually"}
            >
              + {lang === "sv" ? "Lägg till plats" : "Add venue"}
            </button>
          </div>

          {!hasAdminAuth ? (
            <form className="admin-review-auth admin-concourse-auth" onSubmit={handleUnlock}>
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

          {isDeskRailTab ? (
            <div className="admin-concourse-pulse" aria-live="polite">
              <button
                type="button"
                className="admin-concourse-pulse-cell is-next"
                onClick={nextAction.onClick}
                disabled={!hasAdminAuth}
              >
                <span className="admin-concourse-pulse-label">
                  {lang === "sv" ? "NÄSTA ÅTGÄRD" : "NEXT DEFENSIBLE ACTION"}
                </span>
                <b>{nextAction.label}</b>
              </button>
              <button
                type="button"
                className="admin-concourse-pulse-cell"
                onClick={() => {
                  setRailTab("desk");
                  setStateFilter("all");
                  setQueueFocus("all");
                }}
              >
                <span className="admin-concourse-pulse-label">
                  {lang === "sv" ? "PUBLICERADE PLATSER" : "PUBLISHED VENUES"}
                </span>
                <b>{publishedDisplayCount.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}</b>
              </button>
              <button
                type="button"
                className="admin-concourse-pulse-cell"
                onClick={() => {
                  setRailTab("queue");
                  setStateFilter("candidate");
                  setQueueFocus("all");
                }}
              >
                <span className="admin-concourse-pulse-label">
                  {lang === "sv" ? "ATT GRANSKA" : "NEEDS REVIEW"}
                </span>
                <b>{reviewQueueCount.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}</b>
              </button>
              <div className="admin-concourse-pulse-cell">
                <span className="admin-concourse-pulse-label">
                  {lang === "sv" ? "FÄRSK ≤ 90 DAGAR" : "FRESH ≤ 90 DAYS"}
                </span>
                <b>{freshPercentLabel}</b>
              </div>
              <button
                type="button"
                className="admin-concourse-pulse-cell"
                onClick={() => setRailTab("coverage")}
              >
                <span className="admin-concourse-pulse-label">
                  {lang === "sv" ? "TÄCKNING" : "COVERAGE"}
                </span>
                <b>{coveragePercentLabel}</b>
              </button>
            </div>
          ) : null}

          {d1QuotaExceeded ? (
            <div className="admin-d1-quota-banner" role="alert">
              <div className="admin-d1-quota-content">
                <span className="admin-d1-quota-icon">⏳</span>
                <div className="admin-d1-quota-text">
                  <strong>
                    {lang === "sv"
                      ? "Cloudflare D1-kvot uppnådd (daglig radläsningsgräns nådd)"
                      : "Cloudflare D1 Quota Reached (Daily Read Limit Exceeded)"}
                  </strong>
                  <p>
                    {lang === "sv"
                      ? `Kontots kostnadsfria gräns för D1-radläsningar har överskridits. Automatiska runtime-checks är pausade för att spara bandbredd och undvika onödiga Cloudflare-anrop. Kvoten återställs ${formatEuropeanResetTime(undefined, lang)}.`
                      : `The account's free tier daily row read limit for D1 has been exceeded. Automatic runtime checks are paused to conserve bandwidth and prevent unnecessary Cloudflare requests. Limit resets at ${formatEuropeanResetTime(undefined, lang)}.`}
                  </p>
                </div>
              </div>
              <div className="admin-d1-quota-actions">
                <button
                  type="button"
                  className="admin-d1-quota-btn"
                  onClick={() => void runAdminSelfCheck(undefined, true)}
                  disabled={schemaBusy}
                >
                  {lang === "sv" ? "Kör kontroll ändå" : "Force check anyway"}
                </button>
                <button
                  type="button"
                  className="admin-d1-quota-btn secondary"
                  onClick={clearD1QuotaBlock}
                >
                  {lang === "sv" ? "Återställ spärr" : "Reset pause"}
                </button>
              </div>
            </div>
          ) : null}

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

          {railTab === "coverage" ? (
            hasAdminAuth ? (
              <AdminCoveragePanel
                lang={lang}
                adminToken={adminToken}
                onSelectPlace={(placeId) => {
                  setSearchQuery(String(placeId));
                  setRailTab("desk");
                  setStateFilter("all");
                  setViewMode("table");
                  scrollToSection(queueSectionRef);
                }}
              />
            ) : (
              <div className="admin-review-empty">
                <ShieldCheck size={18} weight="bold" />
                <span>{lang === "sv" ? "Logga in för att visa distriktstäckning." : "Sign in to view district coverage."}</span>
              </div>
            )
          ) : railTab === "sources" ? (
            sourcesPanel ?? null
          ) : railTab === "ml" ? (
            <AdminMlDashboard lang={lang} adminHeaders={adminHeaders} hasAdminAuth={hasAdminAuth} />
          ) : railTab === "runbooks" ? (
            <div className="admin-concourse-runbooks">
              {hasAdminAuth ? (
                <div className={`admin-schema-panel ${d1QuotaExceeded ? "quota-paused" : schemaStatus?.ready ? "ready" : "needs-setup"}`}>
                  <div className="admin-schema-copy">
                    <span>
                      {d1QuotaExceeded
                        ? (lang === "sv" ? "Pausad (D1-kvot nådd)" : "Paused (D1 quota reached)")
                        : schemaStatus?.ready
                          ? (lang === "sv" ? "Runtime redo" : "Runtime ready")
                          : lang === "sv" ? "Runtime-check" : "Runtime check"}
                    </span>
                    <small>
                      {d1QuotaExceeded
                        ? (lang === "sv" ? "Automatiska Cloudflare-anrop stoppade för att spara bandbredd" : "Automatic Cloudflare requests paused to conserve bandwidth")
                        : schemaStatusText(schemaStatus, lang)}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="admin-schema-btn"
                    onClick={() => void runAdminSelfCheck(undefined, true)}
                    disabled={!hasAdminAuth || schemaBusy}
                  >
                    {schemaBusy ? <CircleNotch size={14} className="animate-spin" /> : <ShieldCheck size={14} weight="bold" />}
                    {schemaBusy
                      ? (lang === "sv" ? "Kollar" : "Checking")
                      : schemaStatus?.ready
                        ? (lang === "sv" ? "Kolla igen" : "Recheck")
                        : lang === "sv" ? "Kör check" : "Run check"}
                  </button>
                </div>
              ) : null}

              <div className="admin-sync-card" ref={syncCardRef}>
                <div className="admin-sync-header">
                  <div className="admin-sync-title-group">
                    <ShieldCheck size={20} weight="bold" className="admin-sync-icon" />
                    <div>
                      <h5 className="admin-sync-title">
                        {lang === "sv" ? "Automatiskt sparad & Pipeline-synk" : "Auto-Saved & Pipeline Sync"}
                      </h5>
                      <p className="admin-sync-desc">
                        {lang === "sv"
                          ? "Granskningsbeslut och pipeline-checkpoint sparas automatiskt efter varje åtgärd. Borttagna ställen döljs vid nästa sidladdning. JSON-backup och månatlig CI-synk finns vid behov."
                          : "Review decisions and pipeline checkpoints save automatically after each action. Removed places are hidden on the next page load. JSON backup and monthly CI sync remain available when needed."}
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
                  >
                    {syncingPipeline ? <CircleNotch size={15} className="animate-spin" /> : <ArrowClockwise size={15} weight="bold" />}
                    <span>{lang === "sv" ? "Synka pipeline direkt" : "Sync pipeline directly"}</span>
                  </button>

                  <button
                    type="button"
                    className="admin-sync-btn-secondary"
                    onClick={() => void exportReviewLabels()}
                    disabled={!hasAdminAuth || exportingLabels || schemaStatus?.ready !== true}
                  >
                    {exportingLabels ? <CircleNotch size={15} className="animate-spin" /> : <DownloadSimple size={15} weight="bold" />}
                    <span>{lang === "sv" ? "Ladda ner backup (JSON)" : "Download backup (JSON)"}</span>
                  </button>

                  <div className="admin-sync-cli-hint">
                    <span className="cli-hint-label">Terminal:</span>
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

              <AdminGuidePanel lang={lang} onClose={() => setRailTab("desk")} />
            </div>
          ) : (
            <>
              <div className="admin-concourse-tools" ref={queueSectionRef}>
                <div className="admin-search-box admin-concourse-search">
                  <MagnifyingGlass size={16} weight="bold" className="admin-search-icon" />
                  <input
                    type="search"
                    className="admin-search-input"
                    placeholder={
                      lang === "sv"
                        ? "Sök namn, adress, stadsdel eller källa..."
                        : "Search name, address, district or source..."
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

                <div className="admin-view-switcher admin-concourse-views" role="tablist" aria-label={lang === "sv" ? "Växla vy" : "Switch view"}>
                  <button
                    type="button"
                    className={`admin-view-btn ${viewMode === "table" ? "active" : ""}`}
                    onClick={() => setViewMode("table")}
                    role="tab"
                    aria-selected={viewMode === "table"}
                  >
                    <TableIcon size={15} weight="bold" />
                    <span>{lang === "sv" ? "Tabell" : "Table"}</span>
                    <span className="admin-view-count">{filteredCandidates.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`admin-view-btn ${viewMode === "list" ? "active" : ""}`}
                    onClick={() => setViewMode("list")}
                    role="tab"
                    aria-selected={viewMode === "list"}
                  >
                    <ListBullets size={15} weight="bold" />
                    <span>{lang === "sv" ? "Detaljer" : "Details"}</span>
                  </button>
                  <button
                    type="button"
                    className={`admin-view-btn ${viewMode === "map" ? "active" : ""}`}
                    onClick={() => setViewMode("map")}
                    role="tab"
                    aria-selected={viewMode === "map"}
                  >
                    <MapTrifold size={15} weight="bold" />
                    <span>{lang === "sv" ? "Karta" : "Map"}</span>
                  </button>
                </div>
              </div>

              <div className="admin-concourse-filterbar" aria-label={lang === "sv" ? "Filter för granskningskö" : "Review queue filters"}>
                <div className="admin-state-tabs admin-concourse-tabs">
                  {adminStateFilters.map((state) => {
                    const helpText = stateFilterHelpText(state, lang);
                    const tooltipId = `admin-state-tooltip-${state}`;
                    return (
                      <span key={state} className="admin-tab-tooltip-wrap">
                        <button
                          type="button"
                          className={stateFilter === state ? "active" : ""}
                          aria-pressed={stateFilter === state}
                          aria-describedby={tooltipId}
                          onClick={() => {
                            setQueueFocus("all");
                            setStateFilter(state);
                            setRailTab(
                              state === "pending_confirmation" || state === "candidate" ? "queue" : "desk",
                            );
                          }}
                        >
                          {lifecycleStateLabel(state, lang)}
                        </button>
                        <span id={tooltipId} role="tooltip" className="admin-tab-tooltip">
                          {helpText}
                        </span>
                      </span>
                    );
                  })}
                </div>
                <div className="admin-concourse-util-actions">
                  <button
                    type="button"
                    className="admin-concourse-util-btn"
                    onClick={() => setDistrictManagerOpen(true)}
                    disabled={!hasAdminAuth || schemaStatus?.ready !== true}
                  >
                    <MapPin size={13} weight="bold" />
                    {lang === "sv" ? "Stadsdelar" : "Districts"}
                  </button>
                  <button
                    type="button"
                    className="admin-concourse-util-btn"
                    onClick={() => void resolvePlacesWithoutRegion()}
                    disabled={!hasAdminAuth || resolvingRegions || loading || schemaStatus?.ready !== true}
                  >
                    {resolvingRegions ? <CircleNotch size={13} className="animate-spin" /> : <MapPin size={13} weight="bold" />}
                    {lang === "sv" ? "Lös regioner" : "Resolve regions"}
                  </button>
                  <button
                    type="button"
                    className="admin-concourse-util-btn"
                    onClick={() => void loadCandidates()}
                    disabled={!hasAdminAuth || loading || schemaStatus?.ready !== true}
                  >
                    {loading ? <CircleNotch size={13} className="animate-spin" /> : <ArrowClockwise size={13} weight="bold" />}
                    {lang === "sv" ? "Ladda om" : "Reload"}
                  </button>
                </div>
              </div>

              {stateFilter === "candidate" && queueFocus !== "all" ? (
                <div className="admin-queue-focus-banner" role="status">
                  <span>{queueFocusHelpText(queueFocus, lang)}</span>
                  <button
                    type="button"
                    className="admin-queue-focus-clear"
                    onClick={() => {
                      setQueueFocus("all");
                      setRailTab("queue");
                    }}
                  >
                    {lang === "sv" ? "Visa alla kandidater" : "Show all candidates"}
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
              ) : loading ? (
                <div className="admin-review-empty">
                  <CircleNotch size={18} className="animate-spin" />
                  <span>{lang === "sv" ? "Laddar kandidater..." : "Loading candidates..."}</span>
                </div>
              ) : viewMode === "table" ? (
                <>
                  <AdminVenueTable
                    candidates={filteredCandidates}
                    lang={lang}
                    busyId={busyId}
                    selectedCandidateId={selectedCandidateId}
                    onSelectCandidate={(candidate) => setSelectedCandidateId(candidate.id)}
                    onOpenReview={(candidate) => {
                      setSelectedCandidateId(candidate.id);
                      setViewMode("list");
                      window.requestAnimationFrame(() => {
                        document.getElementById(`admin-place-${candidate.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      });
                    }}
                    onEditCandidate={(candidate) => {
                      setPlaceEditorMode("edit");
                      setPlaceEditorDraft(candidateToPlaceDraft(candidate));
                      setPlaceEditorOpen(true);
                    }}
                    onConfirmCandidate={(candidate) => {
                      const hasCoords = typeof candidate.latitude === "number" && typeof candidate.longitude === "number";
                      const confirmMessage = hasCoords
                        ? lang === "sv"
                          ? `Bekräfta och publicera ${candidate.name} på kartan som Verifierad?`
                          : `Confirm and publish ${candidate.name} to the map as Verified?`
                        : lang === "sv"
                          ? `${candidate.name} saknar koordinater ännu. Vill du ändå bekräfta status som Verifierad? (Lägg till koordinater via Redigera för att visa på kartan.)`
                          : `${candidate.name} is still missing coordinates. Confirm status as Verified anyway? (Add coordinates via Edit to show on the map.)`;
                      if (!window.confirm(confirmMessage)) return;
                      void promoteCandidate(candidate, "verified", null);
                    }}
                    bulkBusy={bulkConfirmBusy}
                    onBulkConfirmCandidates={(rows) => void batchConfirmOrDismissCandidates(rows, "confirm")}
                    onBulkDismissCandidates={(rows) => void batchConfirmOrDismissCandidates(rows, "dismiss")}
                    onBulkMergeCandidates={(primary, duplicates) => void batchMergeCandidates(primary, duplicates)}
                    statusChecks={venueStatusChecks}
                    checkingStatusIds={checkingStatusIds}
                    onCheckStatus={(rows) => void checkVenuesOperationalStatus(rows)}
                    onToggleRemoved={(candidate) =>
                      void promoteCandidate(
                        candidate,
                        candidate.validationLabel === "closed_wrong_category" ? "baseline" : "candidate",
                        candidate.validationLabel === "closed_wrong_category" ? null : "closed_wrong_category",
                      )
                    }
                  />
                  <div className="admin-concourse-table-foot">
                    <span>
                      {filteredCandidates.length.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}{" "}
                      {lang === "sv" ? "av" : "of"}{" "}
                      {publishedDisplayCount.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}{" "}
                      {lang === "sv" ? "platser · sorterat efter åtgärdsprioritet" : "venues · sorted by action priority"}
                    </span>
                    <div className="admin-concourse-table-foot-links">
                      <button type="button" onClick={() => void exportReviewLabels()} disabled={exportingLabels}>
                        {lang === "sv" ? "Exportera JSON" : "Export"}
                      </button>
                      <span aria-hidden="true">·</span>
                      <button type="button" onClick={() => setViewMode("map")}>
                        {lang === "sv" ? "Kartvy" : "Map view"}
                      </button>
                    </div>
                  </div>
                </>
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
          onBatchUpdateDistrict={batchUpdateCandidateRegion}
          onPromoteHiddenGem={(candidate) => {
            const found = candidates.find((c) => c.id === candidate.id);
            if (found) void promoteCandidate(found, "verified", "known_hidden_gem");
          }}
          onMarkClosed={(candidate) => {
            const found = candidates.find((c) => c.id === candidate.id);
            if (found) void promoteCandidate(found, "candidate", "closed_wrong_category");
          }}
          onRestore={(candidate) => {
            const found = candidates.find((c) => c.id === candidate.id);
            if (found) void promoteCandidate(found, "baseline", null);
          }}
          onEditPlace={(candidate) => {
            const found = candidates.find((c) => c.id === candidate.id);
            if (found) {
              setPlaceEditorMode("edit");
              setPlaceEditorDraft(candidateToPlaceDraft(found));
              setPlaceEditorOpen(true);
            }
          }}
          districtNames={districtNames}
          adminHeaders={adminHeaders}
          busyId={busyId}
          lang={lang}
        />
      ) : filteredCandidates.length ? (
        <div className="admin-candidate-list">
          {filteredCandidates.map((candidate) => (
            <article key={candidate.id} id={`admin-place-${candidate.id}`} className="admin-candidate-row" aria-busy={busyId === candidate.id}>
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
                <AdminPhotoManager
                  placeId={candidate.id}
                  lang={lang}
                  refreshKey={photoRefreshKeys[candidate.id] ?? 0}
                  websiteUrl={candidate.website}
                  adminHeaders={adminHeaders}
                  placePreview={{
                    name: candidate.name,
                    kind: candidate.kind,
                    area: candidate.area,
                  }}
                  onPendingChange={(pending) => {
                    setPhotoPendingByPlace((current) => {
                      if (!pending) {
                        if (!current[candidate.id]) return current;
                        const next = { ...current };
                        delete next[candidate.id];
                        return next;
                      }
                      return { ...current, [candidate.id]: true };
                    });
                  }}
                  onSaveHandleChange={(handle) => {
                    if (!handle) {
                      delete photoSaveHandlesRef.current[candidate.id];
                      return;
                    }
                    photoSaveHandlesRef.current[candidate.id] = handle;
                  }}
                />
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
                    value={districtNames.includes(candidate.area) ? candidate.area : candidate.area || ""}
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
                    {!districtNames.includes(candidate.area) && candidate.area ? (
                      <option value={candidate.area}>{candidate.area}</option>
                    ) : null}
                    {districtNames.map((regionName) => (
                      <option key={regionName} value={regionName}>
                        {regionName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={`admin-address-picker-row ${!candidate.cuisine ? "unresolved" : ""}`}>
                  <label htmlFor={`admin-cuisine-input-${candidate.id}`} className="admin-address-picker-label">
                    <ForkKnife size={13} weight="bold" />
                    {lang === "sv" ? "Kök / mattyp:" : "Cuisine:"}
                  </label>
                  <div className="admin-address-input-wrap">
                    <input
                      id={`admin-cuisine-input-${candidate.id}`}
                      type="text"
                      className="admin-address-input"
                      list={`admin-cuisine-options-${candidate.id}`}
                      value={cuisineInputs[candidate.id] ?? candidate.cuisine ?? ""}
                      onChange={(event) =>
                        setCuisineInputs((current) => ({
                          ...current,
                          [candidate.id]: event.target.value,
                        }))
                      }
                      placeholder={lang === "sv" ? "t.ex. italian, pizza, thai" : "e.g. italian, pizza, thai"}
                    />
                    <datalist id={`admin-cuisine-options-${candidate.id}`}>
                      {canonicalCuisineOptions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className={`admin-address-picker-row ${!candidate.address ? "unresolved" : ""}`}>
                  <label htmlFor={`admin-address-input-${candidate.id}`} className="admin-address-picker-label">
                    <HouseLine size={13} weight="bold" />
                    {lang === "sv" ? "Gatuadress:" : "Street address:"}
                  </label>
                  <div className="admin-address-input-wrap">
                    <input
                      id={`admin-address-input-${candidate.id}`}
                      type="text"
                      className="admin-address-input"
                      value={addressInputs[candidate.id] ?? candidate.address ?? ""}
                      onChange={(event) =>
                        setAddressInputs((current) => ({
                          ...current,
                          [candidate.id]: event.target.value,
                        }))
                      }
                      placeholder="Götgatan 12, Stockholm"
                    />
                  </div>
                </div>

                <div className="admin-price-picker-row">
                  <span className="admin-price-picker-label">
                    {lang === "sv" ? "Prisnivå:" : "Price level:"}
                  </span>
                  <AdminPriceLevelPicker
                    value={priceLevelInputs[candidate.id] ?? candidate.priceLevel ?? null}
                    onChange={(priceLevel) =>
                      setPriceLevelInputs((current) => ({
                        ...current,
                        [candidate.id]: priceLevel,
                      }))
                    }
                    lang={lang}
                    name={`candidate-price-${candidate.id}`}
                  />
                  <button
                    type="button"
                    className="admin-scrape-btn"
                    disabled={busyId === candidate.id}
                    onClick={() => void updateCandidateDetails(candidate)}
                    title={lang === "sv" ? "Spara kök, adress och prisnivå i D1" : "Save cuisine, address and price level to D1"}
                  >
                    <CheckCircle size={13} weight="bold" />
                    {lang === "sv" ? "Spara kök, adress & pris" : "Save cuisine, address & price"}
                  </button>
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
                  className="admin-action-btn save-place"
                  disabled={busyId === candidate.id || !candidatePlacePending(candidate)}
                  title={lang === "sv" ? "Spara hero-bild, ram och platsdetaljer i D1" : "Save hero image, frame, and place details to D1"}
                  onClick={() => void saveCandidatePlace(candidate)}
                >
                  {busyId === candidate.id ? <CircleNotch size={14} className="animate-spin" /> : <FloppyDisk size={14} weight="bold" />}
                  {lang === "sv" ? "Spara plats" : "Save place"}
                </button>
                <button
                  type="button"
                  className={`admin-action-btn primary ${!candidate.evidenceGate.canPromoteHiddenGem ? "override" : ""}`}
                  disabled={busyId === candidate.id}
                  title={
                    candidate.evidenceGate.canPromoteHiddenGem
                      ? validationLabelText("known_hidden_gem", lang)
                      : lang === "sv"
                        ? "Dubbellås ej uppfyllt — kräver granskningsnotering och admin-bekräftelse"
                        : "Double-lock not met — requires review note and admin confirmation"
                  }
                  onClick={() => void promoteCandidate(candidate, "verified", "known_hidden_gem")}
                >
                  <Sparkle size={14} weight="bold" />
                  {lang === "sv" ? "Dold pärla" : "Hidden gem"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn muted"
                  disabled={busyId === candidate.id}
                  onClick={() => {
                    setPlaceEditorMode("edit");
                    setPlaceEditorDraft(candidateToPlaceDraft(candidate));
                    setPlaceEditorOpen(true);
                  }}
                >
                  <PencilSimple size={14} weight="bold" />
                  {lang === "sv" ? "Redigera" : "Edit"}
                </button>
                <button
                  type="button"
                  className="admin-action-btn"
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate, "verified", "known_mainstream")}
                >
                  <CheckCircle size={14} weight="bold" />
                  Mainstream
                </button>
                <button
                  type="button"
                  className={`admin-action-btn ${!candidate.evidenceGate.canPromoteHiddenGem ? "override" : ""}`}
                  disabled={busyId === candidate.id}
                  title={
                    candidate.evidenceGate.canPromoteHiddenGem
                      ? validationLabelText("known_hidden_gem", lang)
                      : lang === "sv"
                        ? "Dubbellås ej uppfyllt — kräver granskningsnotering och admin-bekräftelse"
                        : "Double-lock not met — requires review note and admin confirmation"
                  }
                  onClick={() => void promoteCandidate(candidate, "featured", "known_hidden_gem")}
                >
                  <ShieldCheck size={14} weight="bold" />
                  Featured
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
                  className={`admin-action-btn ${candidate.validationLabel === "closed_wrong_category" ? "" : "danger"}`}
                  disabled={busyId === candidate.id}
                  onClick={() => void promoteCandidate(candidate,
                    candidate.validationLabel === "closed_wrong_category" ? "baseline" : "candidate",
                    candidate.validationLabel === "closed_wrong_category" ? null : "closed_wrong_category")}
                >
                  {candidate.validationLabel === "closed_wrong_category" ? <ArrowClockwise size={14} weight="bold" /> : <X size={14} weight="bold" />}
                  {candidate.validationLabel === "closed_wrong_category"
                    ? (lang === "sv" ? "Återställ" : "Restore")
                    : (lang === "sv" ? "Ta bort från kartan" : "Remove from map")}
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
            </>
          )}
        </section>
      </main>
      <AdminPlaceEditor
        lang={lang}
        open={placeEditorOpen}
        mode={placeEditorMode}
        initial={placeEditorDraft}
        districts={districtNames}
        adminHeaders={adminHeaders}
        onClose={() => setPlaceEditorOpen(false)}
        onSaved={(saved) => {
          const savedCandidate = saved as AdminCandidate;
          if (placeEditorMode === "create" && savedCandidate.id) {
            setCandidates((current) => [savedCandidate, ...current]);
          } else if (savedCandidate.id) {
            setCandidates((current) =>
              current.map((row) => (row.id === savedCandidate.id ? { ...row, ...savedCandidate } : row)),
            );
          }
          void loadCandidates(undefined, undefined, true);
          void loadDistrictNames();
          addToast({
            type: "success",
            title: placeEditorMode === "create"
              ? (lang === "sv" ? "Plats skapad" : "Place created")
              : (lang === "sv" ? "Plats uppdaterad" : "Place updated"),
            message: String(savedCandidate.name ?? placeEditorDraft.name),
          });
        }}
        onDeleted={(id) => {
          setCandidates((current) => current.filter((row) => row.id !== id));
          void loadDashboard();
          addToast({
            type: "warning",
            title: lang === "sv" ? "Plats raderad" : "Place deleted",
            message: `#${id}`,
          });
        }}
      />
      <AdminDistrictManager
        lang={lang}
        open={districtManagerOpen}
        adminHeaders={adminHeaders}
        onClose={() => setDistrictManagerOpen(false)}
        onChanged={() => {
          void loadDistrictNames();
          void loadCandidates(undefined, undefined, true);
        }}
      />
      <AdminToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
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

function dashboardActionForStep(step: AdminReviewDashboard["nextStep"] | undefined): DashboardNavTarget {
  if (step === "export") {
    return { kind: "sync" };
  }
  if (step === "harvest") {
    return { kind: "queue", focus: "needs_evidence" };
  }
  return { kind: "queue", focus: "all" };
}

function dashboardActionHint(step: AdminReviewDashboard["nextStep"] | undefined, lang: Language) {
  const labels: Record<NonNullable<AdminReviewDashboard["nextStep"]>, { sv: string; en: string }> = {
    export: { sv: "Gå till pipeline-synk", en: "Go to pipeline sync" },
    review: { sv: "Öppna kandidatkön", en: "Open candidate queue" },
    harvest: { sv: "Visa kandidater med källgap", en: "Show candidates with source gaps" },
    caught_up: { sv: "Öppna kandidatkön", en: "Open candidate queue" },
  };
  return labels[step ?? "caught_up"][lang];
}

function dashboardMetrics(dashboard: AdminReviewDashboard | null, lang: Language) {
  const counts = dashboard?.counts;
  const sv = lang === "sv";
  return [
    {
      key: "new",
      focusKey: "new" as DashboardQueueFocus,
      label: sv ? "Nya kandidater" : "New candidates",
      value: dashboardMetricValue(counts?.newCandidateCount),
      icon: <PlusCircle size={15} weight="bold" />,
      tone: counts?.newCandidateCount ? "review" : "neutral",
      action: { kind: "queue", focus: "new" } satisfies DashboardNavTarget,
      actionHint: sv ? "Visa kandidater utan tidigare beslut" : "Show candidates without a prior decision",
    },
    {
      key: "cuisine",
      focusKey: "missing_cuisine" as DashboardQueueFocus,
      label: sv ? "Saknar kök" : "Missing cuisine",
      value: dashboardMetricValue(counts?.missingCuisineCandidateCount ?? counts?.missingCuisineCount),
      icon: <ForkKnife size={15} weight="bold" />,
      tone: counts?.missingCuisineCandidateCount || counts?.missingCuisineCount ? "review" : "neutral",
      action: { kind: "queue", focus: "missing_cuisine" } satisfies DashboardNavTarget,
      actionHint: sv ? "Visa kandidater utan kökstagg" : "Show candidates without a cuisine tag",
    },
    {
      key: "ready",
      focusKey: "hidden_gem_ready" as DashboardQueueFocus,
      label: sv ? "Redo pärlor" : "Ready gems",
      value: dashboardMetricValue(counts?.hiddenGemReadyCount),
      icon: <Sparkle size={15} weight="bold" />,
      tone: counts?.hiddenGemReadyCount ? "review" : "neutral",
      action: { kind: "queue", focus: "hidden_gem_ready" } satisfies DashboardNavTarget,
      actionHint: sv ? "Visa kandidater redo för dold-pärla-beslut" : "Show hidden-gem-ready candidates",
    },
    {
      key: "gaps",
      focusKey: "needs_evidence" as DashboardQueueFocus,
      label: sv ? "Källgap" : "Source gaps",
      value: dashboardMetricValue(counts?.needsEvidenceCount),
      icon: <Sliders size={15} weight="bold" />,
      tone: counts?.needsEvidenceCount ? "harvest" : "neutral",
      action: { kind: "queue", focus: "needs_evidence" } satisfies DashboardNavTarget,
      actionHint: sv ? "Visa kandidater som behöver mer evidens" : "Show candidates that need more evidence",
    },
    {
      key: "duplicates",
      focusKey: "duplicates" as DashboardQueueFocus,
      label: sv ? "Dubbletter" : "Duplicates",
      value: dashboardMetricValue(counts?.possibleDuplicateCount),
      icon: <Scales size={15} weight="bold" />,
      tone: counts?.possibleDuplicateCount ? "review" : "neutral",
      action: { kind: "queue", focus: "duplicates" } satisfies DashboardNavTarget,
      actionHint: sv ? "Visa kandidater med möjliga dubbletter" : "Show candidates with possible duplicates",
    },
    {
      key: "unexported",
      label: sv ? "Oexporterat" : "Unexported",
      value: dashboardMetricValue(counts?.unexportedReviewCount),
      icon: <DownloadSimple size={15} weight="bold" />,
      tone: counts?.unexportedReviewCount ? "export" : "neutral",
      action: { kind: "sync" } satisfies DashboardNavTarget,
      actionHint: sv ? "Gå till pipeline-synk och export" : "Go to pipeline sync and export",
    },
    {
      key: "last-export",
      label: sv ? "Senaste export" : "Last export",
      value: dashboard?.lastExportedAt ? formatUpdatedDate(dashboard.lastExportedAt) : sv ? "Aldrig" : "Never",
      icon: <CheckCircle size={15} weight="bold" />,
      tone: dashboard?.lastExportedAt ? "ok" : "neutral",
      action: { kind: "sync" } satisfies DashboardNavTarget,
      actionHint: sv ? "Gå till pipeline-synk och backup" : "Go to pipeline sync and backup",
    },
  ];
}

function queueFocusHelpText(focus: Exclude<DashboardQueueFocus, "all">, lang: Language) {
  const labels: Record<Exclude<DashboardQueueFocus, "all">, { sv: string; en: string }> = {
    new: {
      sv: "Visar kandidater utan tidigare granskningsbeslut.",
      en: "Showing candidates without a prior review decision.",
    },
    hidden_gem_ready: {
      sv: "Visar kandidater som uppfyller dubbellåset för dold pärla.",
      en: "Showing candidates that pass the hidden-gem double-lock.",
    },
    missing_cuisine: {
      sv: "Visar kandidater utan kökstagg — vad vill du äta idag?",
      en: "Showing candidates without a cuisine tag — what do you want to eat today?",
    },
    needs_evidence: {
      sv: "Visar kandidater med källgap som behöver mer oberoende evidens.",
      en: "Showing candidates with source gaps that need more independent evidence.",
    },
    duplicates: {
      sv: "Visar kandidater med möjliga dubbletter att granska.",
      en: "Showing candidates with possible duplicates to review.",
    },
  };
  return labels[focus][lang];
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
    pending_confirmation: { sv: "Att bekräfta", en: "Pending approval" },
    unresolved_region: { sv: "Saknar region", en: "Needs Region" },
    needs_input: { sv: "Saknar uppgifter", en: "Needs Info" },
    ml_dashboard: { sv: "🤖 ML & Modeller", en: "🤖 ML & Models" },
    all: { sv: "Alla", en: "All" },
    removed: { sv: "Borttagna", en: "Removed" },
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
    needs_cuisine_label: { sv: "Saknar kök / mattyp", en: "Missing cuisine label" },
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
    case "pending_confirmation":
      return lang === "sv"
        ? "Att bekräfta: Nya platser (användartips, kandidater eller platser utan koordinater) som ännu inte syns på kartan och kräver manuell bekräftelse innan publicering."
        : "Pending approval: New places (user submissions, candidates, or places missing coordinates) not yet shown on the map that require manual confirmation before publishing.";
    case "candidate":
      return lang === "sv"
        ? "Kandidater: Nya förslag från OSM, livsmedelskontroll och guider. Prioritera rader med '✨ X användartips' och kontrollera att platsen har minst 2 oberoende källor för dolda pärlor."
        : "Candidates: New proposals from OSM, inspections, and guides. Prioritize rows with '✨ X user tips' and check for 2 independent sources for hidden gems.";
    case "unresolved_region":
      return lang === "sv"
        ? "Saknar region: Platser med generiska etiketter ('Stockholm'). Växla till [ 🗺️ Karta ] för att se deras positioner, använd [ ☑️ Flerval ] för att markera kluster och tilldela rätt stadsdel (t.ex. Gärdet, Kransen)."
        : "Needs region: Places with generic Stockholm labels. Switch to [ 🗺️ Map ] to see coordinates, use [ ☑️ Multi-select ] to select clusters, and batch-assign the right district.";
    case "needs_input":
      return lang === "sv"
        ? "Behöver input: Platser som saknar webbadress, gatuadress eller stadsdel. Använd 'Spara & hämta bild' för att auto-berika."
        : "Needs input: Places missing website, address, or district. Use 'Save & scrape photo' to enrich.";
    case "ml_dashboard":
      return lang === "sv"
        ? "ML-Dashboard: Live-telemetri för rekommendationshändelser, positionsbias (IPS gamma), modellversioner och representativa rättvisegrinder."
        : "ML Dashboard: Live recommendation telemetry, position bias (IPS gamma), model versions, and representation gates.";
    case "baseline":
      return lang === "sv"
        ? "Baseline: Importerade, aktiva platser i grundkatalogen som ännu inte manuellt verifierats eller lyfts som utvalda."
        : "Baseline: Imported active places in the base catalog that have not yet been manually verified or featured.";
    case "verified":
      return lang === "sv"
        ? "Verifierade: Granskade och godkända verksamheter som är aktiva och publicerade i Motkartas öppna katalog."
        : "Verified: Reviewed and approved venues published in Motkarta's active catalog.";
    case "featured":
      return lang === "sv"
        ? "Utvalda: Manuellt utvalda ställen samt alla aktiva platser med minst 2 verifierade källmärken (t.ex. Michelin, White Guide, Burgerdudes, Visit Stockholm)."
        : "Featured: Manually featured venues plus any active place with at least 2 verified source badges (e.g. Michelin, White Guide, Burgerdudes, Visit Stockholm).";
    case "removed":
      return lang === "sv"
        ? "Borttagna: Stängda eller felkategoriserade ställen. Återställ till Baseline efter kontroll. Separata stängningsmarkeringar i källdatan måste också rättas."
        : "Removed: Closed or wrong-category places. Restore to Baseline after review. Separate source-dataset closure labels must also be corrected.";
    case "all":
    default:
      return lang === "sv"
        ? "Alla platser: Samtliga poster i D1 oavsett gransknings- och livscykelstatus."
        : "All places: Every establishment in D1 regardless of review or lifecycle state.";
  }
}
