"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OnboardingModal } from "./components/OnboardingModal";
import { AdminReviewPanel, isAdminRoutePath, readStoredAdminToken, type AdminSessionStatus } from "./admin/AdminReviewPanel";
import { ConciergeAnswerView } from "./components/ConciergeAnswerView";
import { ConciergeSuperpowerModal } from "./components/ConciergeSuperpowerModal";
import { CuratedSourcesPanel } from "./components/CuratedSourcesPanel";
import { ExternalMapLinks } from "./components/ExternalMapLinks";
import { FoodMap } from "./components/FoodMap";
import { SyncDevicesModal } from "./components/SyncDevicesModal";
import { parseSyncDirectPlaces } from "./app/sync-utils";
import { LazyPlaceMediaDrawer } from "./components/LazyPlaceMediaDrawer";
import { VerificationBar } from "./components/VerificationBar";
import { matchesEstablishmentFilter } from "./app/place-filtering";
import { sanitizeAndAugmentPlaces } from "./app/place-sanitization";
import { requestPosition, locationFailureMessage } from "./app/geolocation";
import {
  DISTANCE_INTENT_REGEX,
  INITIAL_CURATED_SOURCES,
  getPopularConciergePrompts,
  SEARCH_CUISINE_SUGGESTIONS,
  STOCKHOLM_REGION_OPTIONS,
  allCuisines,
  comparePlaces,
  cuisineLabel,
  cuisineOptionsFromPlaces,
  cuisineParts,
  distanceFromPoint,
  filterPlacesByRankingMode,
  formatDistance,
  formatUpdatedDate,
  hasCoordinates,
  kindFilterLabel,
  logConciergeQuery,
  modeLabel,
  modeScore,
  preferencesFromQuery,
  recommendationImpressionLimit,
  renderLimit,
  rounded,
  sortModeLabel,
  sortModes,
  stockholmCenter,
  translations,
  visibleModes,
  visibleEstablishmentTypes,
  type CuratedSource,
  type CuisineFilter,
  type EstablishmentFilter,
  type Language,
  type Mode,
  type SortMode,
  type SuperpowerMode,
} from "./app/shared";
import {
  getRecommendationAnonymousUserId,
  getRecommendationSessionId,
  recommendationKindContext,
  recommendationRankingModeContext,
  recommendationSortModeContext,
  safeRandomId,
  MAX_RECOMMENDATION_EVENTS_PER_BATCH,
  RECOMMENDATION_SCORER_VERSION,
  queryLengthBucket,
  recommendationResultSetSignature,
  buildRecommendationEventIdempotencyKey,
  recommendationCuisineContext,
  recommendationModeForContext,
  type QueryContext,
  type RecommendationEventDraft,
} from "./ml/recommendationInstrumentation";
import { MerchPanel } from "./components/MerchPanel";
import { PreloaderModal } from "./components/PreloaderModal";
import {
  Bread,
  Certificate,
  Check,
  CaretUp,
  CaretDown,
  CircleNotch,
  Coffee,
  Compass,
  ForkKnife,
  Image,
  MapTrifold,
  MagnifyingGlass,
  PlusCircle,
  Scales,
  ShieldCheck,
  SignOut,
  ShoppingBag,
  ShoppingCart,
  Shuffle,
  Sliders,
  Sparkle,
  Star,
  Faders,
  List,
  ListDashes,
  X,
  PawPrint,
  DeviceMobile,
  QrCode,
  ArrowRight,
  ArrowUp,
  Info,
} from "@phosphor-icons/react";
import { parseConciergeAnswer } from "../lib/concierge-parser";
import { retrieveAndSynthesize } from "../lib/concierge/response";
import type { ConciergeCard, ConciergeResponse } from "../lib/concierge/contracts";
import { resolveConciergeMapPlace } from "../lib/concierge/map-identity";
import { normalize } from "../lib/concierge/facts";
import { CartDrawer } from "./components/CartDrawer";
import {
  MobileFilterBottomSheet,
} from "./components/MobileFilterBottomSheet";
import { MobileRankControlSheet, type RankSheetType } from "./components/MobileRankControlSheet";
import { PlaceDetailSheet } from "./components/PlaceDetailSheet";
import { MobilePlaceCardList } from "./components/MobilePlaceCardList";
import { MotkartaScoreWidget } from "./components/MotkartaScoreWidget";
import {
  addUserReview,
  addUserPhoto,
  fetchPlacePhotos,
  type PlacePhoto,
  DUMMY_PLACE_IMAGE_URL,
} from "../lib/lazy-media";
import {
  type PlaceInput,
  type ScoredPlace,
  scorePlace,
} from "../lib/scoring";
import { fetchPlacesPayload, type DataSource } from "../lib/place-payload";

const DESKTOP_HERO_STORIES = [
  {
    id: 39957690,
    kind: "Specialty coffee",
    area: "Kungsholmen",
    name: "Gast",
    imageUrl:
      "https://images.squarespace-cdn.com/content/v1/5faed46a7a45fa2d872db5ae/512f5511-3b0f-492b-b7fd-b2c1f7771ff1/Gast-Marta-Vargas-6938-VSCO.jpeg",
    credit: "Official Website (gastcafe.se)",
  },
  {
    id: 337511044,
    kind: "Bakery",
    area: "Södermalm",
    name: "Söderbergs bageri",
    imageUrl:
      "https://www.soderbergsbageri.se/assets/soderbergsbageri/img/Butiken/bakverk-soderbergs-bageri-cedergrensvagen.webp",
    credit: "Official Website (soderbergsbageri.se)",
  },
  {
    id: 1053351911,
    kind: "Restaurant",
    area: "Norrort",
    name: "Gamla Orangeriet",
    imageUrl: "https://gamlaorangeriet.se/wp-content/uploads/2025/09/IMG_6017-scaled.jpg",
    credit: "Official Website (gamlaorangeriet.se)",
  },
] as const;

export default function App() {
  const [places, setPlaces] = useState<PlaceInput[]>([]);
  const [dataSource, setDataSource] = useState<DataSource>("loading");
  const [mode, setMode] = useState<Mode>("All recommendations");
  const [sortMode, setSortMode] = useState<SortMode>("Motkarta score");
  const [randomSeed, setRandomSeed] = useState(1);
  const [kind, setKind] = useState<EstablishmentFilter>("All places");
  const [cuisine, setCuisine] = useState<CuisineFilter>(allCuisines);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [isMapCardMinimized, setIsMapCardMinimized] = useState(false);

  const [mobileViewMode, setMobileViewMode] = useState<"map" | "list">("map");
  const workspaceRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 768px)");
    const resetDesktopView = () => {
      if (!mobileViewport.matches) setMobileViewMode("map");
    };
    mobileViewport.addEventListener("change", resetDesktopView);
    return () => mobileViewport.removeEventListener("change", resetDesktopView);
  }, []);

  const toggleMobileView = () => {
    setMobileViewMode((view) => view === "map" ? "list" : "map");
    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [mobileRankSheet, setMobileRankSheet] = useState<RankSheetType>(null);
  const [isPlaceDetailOpen, setIsPlaceDetailOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const activeFilterCount = Number(kind !== "All places") +
    Number(cuisine !== allCuisines) + selectedTags.length;

  useEffect(() => {
    setIsMapCardMinimized(false);
  }, [selected]);

  const [superpowerMode, setSuperpowerMode] = useState<SuperpowerMode | null>(null);
  const [superpowerInitialPlaceName, setSuperpowerInitialPlaceName] = useState<string | undefined>(undefined);
  const [lang, setLang] = useState<Language>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("motkarta_lang");
      if (saved === "sv" || saved === "en") return saved;
    }
    return "sv";
  });

  const t = translations[lang];
  const isAdminRoute = isAdminRoutePath();

  const handleSetLang = (newLang: Language) => {
    setLang(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_lang", newLang);
    }
  };

  const [userRatings, setUserRatings] = useState<Record<number, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("motkarta_ratings");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {};
  });

  const [savedPlaceIds, setSavedPlaceIds] = useState<number[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("motkarta_saved_places");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });

  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  const handleImportSavedPlaces = useCallback((newIds: number[]) => {
    setSavedPlaceIds((prev) => {
      const merged = Array.from(new Set([...prev, ...newIds]));
      if (typeof window !== "undefined") {
        localStorage.setItem("motkarta_saved_places", JSON.stringify(merged));
      }
      return merged;
    });
  }, []);

  const [syncToast, setSyncToast] = useState<{ count: number; code?: string } | null>(null);

  useEffect(() => {
    if (!syncToast) return;
    const timer = setTimeout(() => {
      setSyncToast(null);
    }, 7000);
    return () => clearTimeout(timer);
  }, [syncToast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const syncCode = params.get("sync");
    const directParam = params.get("places") || params.get("favs");

    let directCount = 0;
    if (directParam) {
      const parsedIds = parseSyncDirectPlaces(directParam);
      if (parsedIds.length > 0) {
        handleImportSavedPlaces(parsedIds);
        directCount = parsedIds.length;
      }
    }

    if (syncCode) {
      const cleanCode = syncCode.trim().toUpperCase();
      void fetch(`/api/sync?code=${encodeURIComponent(cleanCode)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { savedPlaceIds?: number[]; syncCode?: string } | null) => {
          if (data?.savedPlaceIds && data.savedPlaceIds.length > 0) {
            handleImportSavedPlaces(data.savedPlaceIds);
            setSyncToast({
              count: data.savedPlaceIds.length,
              code: data.syncCode || cleanCode,
            });
          } else if (directCount > 0) {
            setSyncToast({ count: directCount, code: cleanCode });
          }
        })
        .catch(() => {
          if (directCount > 0) {
            setSyncToast({ count: directCount, code: cleanCode });
          }
        });
    } else if (directCount > 0) {
      setSyncToast({ count: directCount });
    }

    if (syncCode || directParam) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("sync");
      newUrl.searchParams.delete("places");
      newUrl.searchParams.delete("favs");
      window.history.replaceState({}, "", newUrl.toString());
    }
  }, [handleImportSavedPlaces]);

  const [cart, setCart] = useState<Record<string, number>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("motkarta_cart");
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return {};
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  const handleAddToCart = (itemId: string) => {
    setCart((prev) => {
      const current = prev[itemId] || 0;
      const next = { ...prev, [itemId]: current + 1 };
      if (typeof window !== "undefined") {
        localStorage.setItem("motkarta_cart", JSON.stringify(next));
      }
      return next;
    });
  };

  const handleUpdateCartQty = (itemId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[itemId] || 0;
      const updated = current + delta;
      let next: Record<string, number>;
      if (updated <= 0) {
        next = { ...prev };
        delete next[itemId];
      } else {
        next = { ...prev, [itemId]: updated };
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("motkarta_cart", JSON.stringify(next));
      }
      return next;
    });
  };

  const handleRemoveCartItem = (itemId: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[itemId];
      if (typeof window !== "undefined") {
        localStorage.setItem("motkarta_cart", JSON.stringify(next));
      }
      return next;
    });
  };

  const totalCartCount = Object.values(cart).reduce((sum, count) => sum + count, 0);

  const [showPreloader, setShowPreloader] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("motkarta_preloader_seen") !== "true";
    }
    return false;
  });

  const handleClosePreloader = () => {
    setShowPreloader(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_preloader_seen", "true");
    }
  };

  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("motkarta_onboarded") !== "true";
    }
    return false;
  });

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_onboarded", "true");
    }
  };

  const handleRatePlace = (id: number, rating: number) => {
    const updated = { ...userRatings, [id]: rating };
    setUserRatings(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_ratings", JSON.stringify(updated));
    }
  };

  const handleToggleSavePlace = (id: number) => {
    const wasSaved = savedPlaceIds.includes(id);
    const updated = savedPlaceIds.includes(id)
      ? savedPlaceIds.filter((pId) => pId !== id)
      : [...savedPlaceIds, id];
    setSavedPlaceIds(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("motkarta_saved_places", JSON.stringify(updated));
    }
    if (!wasSaved) {
      recordRecommendationEvents([{ establishmentId: id, eventType: "save", queryContext: { surface: "place_detail" } }]);
    }
  };

  const [concierge, setConcierge] = useState(
    lang === "sv"
      ? "specialty coffee och kardemummabulle, bortom de mest turistiga gatorna"
      : "specialty coffee and a cardamom bun, away from the busiest tourist streets",
  );
  const [curatedSources, setCuratedSources] = useState<CuratedSource[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_user_sources");
        if (stored) {
          const userSources: CuratedSource[] = JSON.parse(stored);
          return [...INITIAL_CURATED_SOURCES, ...userSources];
        }
      } catch {}
    }
    return INITIAL_CURATED_SOURCES;
  });

  const handleAddSourceSuperpower = (newSource: CuratedSource) => {
    setCuratedSources((prev) => [...prev, newSource]);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_user_sources");
        const list: CuratedSource[] = stored ? JSON.parse(stored) : [];
        localStorage.setItem("motkarta_user_sources", JSON.stringify([...list, newSource]));
      } catch {}
    }
    void fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSource),
    }).catch(() => {});
    setAnswer(
      lang === "sv"
        ? `Källan '${newSource.name}' har lagts till i registret och sparats i databasen.`
        : `The source '${newSource.name}' has been added to the registry and saved to the database.`,
    );
  };
  const [answer, setAnswer] = useState<string | null>(null);
  const [conciergeResponse, setConciergeResponse] = useState<ConciergeResponse | null>(null);
  const conciergeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => conciergeRequest.current?.abort(), []);
  const [asking, setAsking] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const focusSearchInput = useCallback(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const clearConciergeState = useCallback(() => {
    conciergeRequest.current?.abort();
    setAnswer(null);
    setConciergeResponse(null);
    setConciergeChatMessages([]);
    setConcierge("");
    setQuery("");
  }, []);

  const selectKindFilter = useCallback(
    (newKind: EstablishmentFilter) => {
      clearConciergeState();
      setKind(newKind);
    },
    [clearConciergeState],
  );

  const selectCuisineFilter = useCallback(
    (newCuisine: CuisineFilter) => {
      clearConciergeState();
      setCuisine(newCuisine);
    },
    [clearConciergeState],
  );

  const handleResetMobileFilters = useCallback(() => {
    clearConciergeState();
    setSelectedTags([]);
    setKind("All places");
    setCuisine(allCuisines);
  }, [clearConciergeState]);

  const [isSourcesLoading, setIsSourcesLoading] = useState(false);
  const [isPromptsLoading, setIsPromptsLoading] = useState(false);
  const [adminSession, setAdminSession] = useState<AdminSessionStatus | null>(null);

  const checkGlobalAdminSession = useCallback(async (tokenOverride?: string) => {
    const token = (tokenOverride ?? readStoredAdminToken()).trim();
    try {
      const res = await fetch("/api/admin/session", {
        headers: {
          Accept: "application/json",
          ...(token ? { "x-motkarta-admin-token": token } : {}),
        },
        redirect: "manual",
      });
      if (!res.ok || res.type === "opaqueredirect" || res.status === 0) {
        setAdminSession(null);
        return;
      }
      const data = (await res.json().catch(() => null)) as AdminSessionStatus | null;
      if (res.ok && data?.admin) {
        setAdminSession(data);
      } else {
        setAdminSession(null);
      }
    } catch {
      setAdminSession(null);
    }
  }, []);

  const handleGlobalAdminLogout = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("motkarta_admin_token");
    }
    const mode = adminSession?.authMode;
    setAdminSession(null);
    if (mode === "token") {
      void checkGlobalAdminSession("");
      return;
    }
    if (typeof window !== "undefined") {
      window.location.assign("/cdn-cgi/access/logout");
    }
  };

  useEffect(() => {
    void checkGlobalAdminSession();
  }, [checkGlobalAdminSession]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlaces() {
      try {
        const payload = await fetchPlacesPayload();

        if (!cancelled && payload.places?.length) {
          setPlaces(sanitizeAndAugmentPlaces(payload.places));
          setDataSource(payload.source);
        } else if (!cancelled) {
          setPlaces([]);
          setDataSource("unavailable");
        }
      } catch {
        if (!cancelled) {
          setPlaces([]);
          setDataSource("unavailable");
        }
      }
    }

    async function loadDbSources() {
      setIsSourcesLoading(true);
      try {
        const resp = await fetch("/api/sources");
        if (resp.ok) {
          const payload = (await resp.json()) as { sources?: CuratedSource[] };
          if (!cancelled && payload.sources?.length) {
            setCuratedSources(payload.sources);
          }
        }
      } catch {}
      if (!cancelled) setIsSourcesLoading(false);
    }

    async function loadDbPrompts() {
      setIsPromptsLoading(true);
      try {
        const resp = await fetch("/api/prompts");
        if (resp.ok) {
          const payload = (await resp.json()) as { prompts?: string[] };
          if (!cancelled && payload.prompts?.length) {
            setConciergeHistory((prev) => Array.from(new Set([...payload.prompts!, ...prev])));
          }
        }
      } catch {}
      if (!cancelled) setIsPromptsLoading(false);
    }

    void loadPlaces();
    void loadDbSources();
    void loadDbPrompts();

    return () => {
      cancelled = true;
    };
  }, []);

  const preferences = useMemo(() => preferencesFromQuery(query, kind), [kind, query]);
  const scoredPlaces = useMemo(
    () => places.map((place) => scorePlace(place, preferences)),
    [places, preferences],
  );
  const cuisineOptions = useMemo(() => cuisineOptionsFromPlaces(places), [places]);

  useEffect(() => {
    if (cuisine !== allCuisines && !cuisineOptions.includes(cuisine)) {
      setCuisine(allCuisines);
    }
  }, [cuisine, cuisineOptions]);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationToast, setLocationToast] = useState<string | null>(null);
  const locationToastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(locationToastTimer.current), []);

  const requestUserLocation = useCallback(
    async (autoSortByDistance = false): Promise<{ latitude: number; longitude: number } | null> => {
      const result = await requestPosition();
      clearTimeout(locationToastTimer.current);
      if (result.status === 'acquired') {
        setUserLocation(result.location); setLocationToast(null);
        if (autoSortByDistance) setSortMode('Distance');
        return result.location;
      }
      if (autoSortByDistance) {
        setLocationToast(locationFailureMessage(result.status, lang));
        locationToastTimer.current = setTimeout(() => setLocationToast(null), 6000);
      }
      return null;
    },
    [lang],
  );

  const conciergeCards = useMemo<Array<ConciergeCard | import("../lib/concierge-parser").ParsedConciergeCard>>(() => {
    if (!answer) return [];
    if (conciergeResponse && Array.isArray(conciergeResponse.cards) && conciergeResponse.cards.length > 0) {
      return conciergeResponse.cards;
    }
    const parsed = parseConciergeAnswer(answer);
    return parsed.cards || [];
  }, [answer, conciergeResponse]);

  const conciergePlaces = useMemo<ScoredPlace[]>(() => {
    if (!conciergeCards.length) return [];

    const resolved: ScoredPlace[] = [];
    for (let idx = 0; idx < conciergeCards.length; idx++) {
      const card = conciergeCards[idx];
      let match: ScoredPlace | undefined;

      const cardOsmIdentity = "osmIdentity" in card ? card.osmIdentity : undefined;
      const cardLat = "latitude" in card ? card.latitude : undefined;
      const cardLon = "longitude" in card ? card.longitude : undefined;

      // 1. Strict reconciliation bridge if response is available
      if (conciergeResponse) {
        match = resolveConciergeMapPlace(card as ConciergeCard, scoredPlaces) as ScoredPlace | undefined;
      }

      // 2. Direct ID match
      if (!match && card.id !== undefined) {
        match = scoredPlaces.find((p) => p.id === card.id);
      }

      // 3. OSM identity / alias match
      if (!match && cardOsmIdentity) {
        match = scoredPlaces.find(
          (p) => p.osmIdentity === cardOsmIdentity || p.osmAliases?.includes(cardOsmIdentity)
        );
      }

      // 4. Normalized name match
      if (!match) {
        const normCardName = normalize(card.name);
        match = scoredPlaces.find((p) => normalize(p.name) === normCardName);
      }

      // 5. Cleaned name match (stripping parentheses)
      const cardNameClean = card.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
      if (!match) {
        match = scoredPlaces.find(
          (p) => p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase() === cardNameClean
        );
      }

      // 6. Substring / prefix match
      if (!match) {
        match =
          scoredPlaces.find((p) => {
            const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
            return pClean.startsWith(cardNameClean) || cardNameClean.startsWith(pClean);
          }) ||
          scoredPlaces.find((p) =>
            p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase().includes(cardNameClean)
          ) ||
          scoredPlaces.find((p) => {
            const pClean = p.name.replace(/\s*\([^)]*\)/g, "").trim().toLowerCase();
            return cardNameClean.includes(pClean) && pClean.length > 4;
          });
      }

      // 7. If card has valid coordinates, synthesize a ScoredPlace so it is guaranteed to show on the map!
      if (
        !match &&
        typeof cardLat === "number" &&
        typeof cardLon === "number" &&
        cardLat !== 0 &&
        cardLon !== 0 &&
        scoredPlaces.length > 0
      ) {
        const cardKind = ("kind" in card && typeof card.kind === "string" ? card.kind : "Restaurant") as import("../lib/scoring").EstablishmentType;
        const template = scoredPlaces[0];
        const syntheticPlace: PlaceInput = {
          ...template,
          id: typeof card.id === "number" ? card.id : 980000 + idx,
          name: card.name,
          kind: cardKind,
          area: card.area || "Stockholm",
          latitude: cardLat,
          longitude: cardLon,
          tags: [],
          website: card.website,
          osmIdentity: cardOsmIdentity,
        };
        match = scorePlace(syntheticPlace, preferences);
      }

      if (match && !resolved.some((r) => r.id === match!.id)) {
        resolved.push(match);
      }
    }

    return resolved;
  }, [conciergeCards, conciergeResponse, preferences, scoredPlaces]);

  const ranked = useMemo(() => {
    if (conciergePlaces.length > 0) {
      return conciergePlaces;
    }
    const baseFilteredPlaces = scoredPlaces
      .filter((place) => matchesEstablishmentFilter(place, kind, savedPlaceIds))
      .filter((place) => cuisine === allCuisines || cuisineParts(place).includes(cuisine))
      .filter((place) => {
        if (selectedTags.length === 0) return true;
        const searchStr = [
          ...place.tags,
          place.kind,
          place.cuisine || "",
          place.specialty?.ownRoastery ? "Own roastery" : "",
          place.specialty?.singleOrigin ? "Single origin" : "",
          place.specialty?.filterCoffee ? "Filter" : "",
          ...(place.specialty?.manualBrewMethods || []),
        ]
          .join(" ")
          .toLowerCase();

        return selectedTags.every((t) => {
          const tLower = t.toLowerCase();
          const noteLower = (place.note ?? "").toLowerCase();
          const nameLower = (place.name ?? "").toLowerCase();
          const evLabelLower = (place.evidenceLabel ?? "").toLowerCase();
          const placeTags = (place.tags ?? []).map((pt) => pt.toLowerCase());

          if (tLower === "dog friendly" || tLower === "hundvänligt") {
            return (
              searchStr.includes("dog friendly") ||
              searchStr.includes("hundvänligt") ||
              searchStr.includes("hundvänlig") ||
              searchStr.includes("tasstipset") ||
              evLabelLower.includes("tasstipset") ||
              nameLower.includes("dog") ||
              nameLower.includes("hund") ||
              noteLower.includes("hund") ||
              noteLower.includes("dog") ||
              placeTags.some((pt) =>
                [
                  "dog friendly",
                  "hundvänligt",
                  "tasstipset",
                  "hundar välkomna",
                  "verifierad hundpolicy",
                  "hundar inne & ute",
                  "endast uteservering",
                ].includes(pt) ||
                pt.includes("dog") ||
                pt.includes("hund")
              )
            );
          }
          return (
            searchStr.includes(tLower) ||
            nameLower.includes(tLower) ||
            noteLower.includes(tLower) ||
            placeTags.some((pt) => pt.includes(tLower))
          );
        });
      })
      .filter((place) => {
        const qClean = query.trim().toLowerCase();
        if (!qClean) return true;
        const placeSearchText = `${place.name} ${place.area} ${place.address ?? ""} ${place.cuisine ?? ""} ${place.tags.join(" ")}`.toLowerCase();
        if (placeSearchText.includes(qClean)) return true;
        const queryTokens = qClean.split(/[,\s]+/).filter(Boolean);
        return queryTokens.length > 0 && queryTokens.every((token) => placeSearchText.includes(token));
      });

    const modeFilteredPlaces = filterPlacesByRankingMode(
      baseFilteredPlaces,
      mode,
      randomSeed,
      userLocation ?? stockholmCenter,
    );

    return modeFilteredPlaces.sort((a, b) => {
      if (kind === "Latest" && sortMode === "Motkarta score") {
        const dateA = new Date(a.lastUpdated ?? 0).getTime();
        const dateB = new Date(b.lastUpdated ?? 0).getTime();
        if (dateA !== dateB) return dateB - dateA;
        return b.id - a.id;
      }
      return comparePlaces(a, b, mode, sortMode, randomSeed, userLocation ?? stockholmCenter);
    });
  },
    [
      allCuisines,
      conciergePlaces,
      cuisine,
      kind,
      selectedTags,
      mode,
      query,
      randomSeed,
      savedPlaceIds,
      scoredPlaces,
      sortMode,
      userLocation,
    ],
  );
  const visibleRanked = useMemo(() => ranked.slice(0, renderLimit), [ranked]);
  const hasSearchQuery = Boolean(query.trim());
  const activeHeroStoryId =
    kind === "Restaurant"
      ? 1053351911
      : kind === "Bakery"
        ? 337511044
        : kind === "Café" || kind === "Specialty coffee"
          ? 39957690
          : DESKTOP_HERO_STORIES[0].id;

  const recommendationQueryContext = useMemo<QueryContext>(
    () => ({
      hasQuery: Boolean(query.trim()),
      queryLengthBucket: queryLengthBucket(query),
      kind: recommendationKindContext(kind),
      cuisine: recommendationCuisineContext(cuisine),
      mode: recommendationRankingModeContext(mode),
      sortMode: recommendationSortModeContext(sortMode),
      resultCount: visibleRanked.length,
      surface: "results",
    }),
    [cuisine, kind, mode, query, sortMode, visibleRanked.length],
  );
  const resultSetSignature = useMemo(
    () => recommendationResultSetSignature(recommendationQueryContext, visibleRanked.map((place) => place.id)),
    [recommendationQueryContext, visibleRanked],
  );
  const resultSetStateRef = useRef({ signature: "", sequence: 0, id: "" });
  if (resultSetStateRef.current.signature !== resultSetSignature) {
    const sequence = resultSetStateRef.current.sequence + 1;
    resultSetStateRef.current = {
      signature: resultSetSignature,
      sequence,
      id: `rs_${Date.now().toString(36)}_${sequence}_${safeRandomId().slice(0, 12)}`,
    };
  }
  const recommendationResultSetId = resultSetStateRef.current.id;
  const attemptedRecommendationEventKeysRef = useRef<Set<string>>(new Set());
  const recommendationEventFlushRef = useRef<Promise<void>>(Promise.resolve());

  const recordRecommendationEvents = useCallback(
    (drafts: RecommendationEventDraft[]) => {
      if (typeof window === "undefined" || !drafts.length) return;
      if (dataSource !== "d1") return;

      const anonymousUserId = getRecommendationAnonymousUserId();
      const sessionId = getRecommendationSessionId();
      const occurredAt = new Date().toISOString();
      const events = drafts.map((draft) => {
        const queryContext = { ...recommendationQueryContext, ...(draft.queryContext ?? {}) };
        const resultSetId = draft.resultSetId ?? (draft.eventType === "impression" ? recommendationResultSetId : null);
        return {
          establishmentId: draft.establishmentId,
          anonymousUserId,
          sessionId,
          eventType: draft.eventType,
          resultPosition: draft.resultPosition ?? null,
          recommendationMode: draft.recommendationMode ?? recommendationModeForContext(queryContext),
          queryContext,
          modelVersion: RECOMMENDATION_SCORER_VERSION,
          occurredAt,
          idempotencyKey: buildRecommendationEventIdempotencyKey({
            sessionId,
            eventType: draft.eventType,
            establishmentId: draft.establishmentId,
            resultPosition: draft.resultPosition,
            modelVersion: RECOMMENDATION_SCORER_VERSION,
            queryContext,
            resultSetId,
          }),
        };
      });

      const attemptedKeys = attemptedRecommendationEventKeysRef.current;
      const unsentEvents = events.filter((event) => {
        if (attemptedKeys.has(event.idempotencyKey)) return false;
        attemptedKeys.add(event.idempotencyKey);
        return true;
      });

      if (!unsentEvents.length) return;

      if (attemptedKeys.size > 2_000) {
        for (const key of attemptedKeys) {
          attemptedKeys.delete(key);
          if (attemptedKeys.size <= 1_500) break;
        }
      }

      recommendationEventFlushRef.current = recommendationEventFlushRef.current
        .catch(() => {})
        .then(async () => {
          for (let index = 0; index < unsentEvents.length; index += MAX_RECOMMENDATION_EVENTS_PER_BATCH) {
            const chunk = unsentEvents.slice(index, index + MAX_RECOMMENDATION_EVENTS_PER_BATCH);
            await fetch("/api/recommendation-events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ events: chunk }),
              keepalive: chunk.length <= 20,
            }).catch(() => undefined);
          }
        });
      void recommendationEventFlushRef.current;
    },
    [dataSource, recommendationQueryContext, recommendationResultSetId],
  );

  useEffect(() => {
    if (!visibleRanked.length) return;
    recordRecommendationEvents(
      visibleRanked
        .slice(0, recommendationImpressionLimit)
        .map((place, index) => ({
          establishmentId: place.id,
          eventType: "impression",
          resultPosition: index,
          resultSetId: recommendationResultSetId,
        })),
    );
  }, [recordRecommendationEvents, recommendationResultSetId, visibleRanked]);

  const active = selected !== null ? (ranked.find((place) => place.id === selected) ?? null) : null;
  const [activeCardPhoto, setActiveCardPhoto] = useState<PlacePhoto | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (active) {
      setActiveCardPhoto(null);
      void fetchPlacePhotos(active).then((fetched) => {
        if (isMounted) {
          setActiveCardPhoto(fetched && fetched.length > 0 ? fetched[0] : null);
        }
      });
    } else {
      setActiveCardPhoto(null);
    }
    return () => {
      isMounted = false;
    };
  }, [active?.id]);

  useEffect(() => {
    if (selected !== null && !ranked.some((place) => place.id === selected)) {
      setSelected(null);
    }
  }, [ranked, selected]);

  const previousRankingControlsRef = useRef({ mode, randomSeed, sortMode });
  useEffect(() => {
    const previousControls = previousRankingControlsRef.current;
    const rankingControlsChanged =
      previousControls.mode !== mode ||
      previousControls.sortMode !== sortMode ||
      previousControls.randomSeed !== randomSeed;

    previousRankingControlsRef.current = { mode, randomSeed, sortMode };

    if (rankingControlsChanged) {
      setSelected(null);
    }
  }, [mode, randomSeed, sortMode, visibleRanked]);

  const handleSelectPlace = useCallback(
    (id: number) => {
      setSelected(id);
      setMobileViewMode("map");
      recordRecommendationEvents([{ establishmentId: id, eventType: "profile_view", queryContext: { surface: "map" } }]);
      const isVisibleInRanked = ranked.some((p) => p.id === id);
      if (!isVisibleInRanked) {
        setKind("All places");
        setCuisine(allCuisines);
        setQuery("");
      }
    },
    [allCuisines, ranked, recordRecommendationEvents],
  );

  const handleViewPlaceOnMap = useCallback((place: ScoredPlace) => {
    setSelected(place.id);
    setMobileViewMode("map");
    setIsPlaceDetailOpen(false);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    });
  }, []);

  const mapPlaces = useMemo(
    () => {
      if (conciergePlaces.length > 0) {
        return active && !conciergePlaces.some((p) => p.id === active.id)
          ? [active, ...conciergePlaces]
          : conciergePlaces;
      }
      return active && !visibleRanked.some((p) => p.id === active.id) ? [active, ...visibleRanked] : visibleRanked;
    },
    [active, conciergePlaces, visibleRanked],
  );

  const [isConciergeFocused, setIsConciergeFocused] = useState(false);
  const [conciergeHistory, setConciergeHistory] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_concierge_history");
        if (stored) {
          const list: Array<{ query: string }> = JSON.parse(stored);
          return list.map((item) => item.query);
        }
      } catch {}
    }
    return [];
  });

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState<number>(-1);

  const matchingSuggestions = useMemo(() => {
    const inputClean = concierge.trim().toLowerCase();
    const allCandidates = Array.from(new Set([...conciergeHistory, ...getPopularConciergePrompts(lang)]));
    if (!inputClean) {
      return allCandidates.slice(0, 5);
    }
    return allCandidates
      .filter((prompt) => prompt.toLowerCase().includes(inputClean))
      .slice(0, 5);
  }, [concierge, conciergeHistory, lang]);

  const searchAutocompleteSuggestions = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matchedRegions = STOCKHOLM_REGION_OPTIONS.filter(
      (r) => r.label.toLowerCase().includes(q) || r.aliases.some((a) => a.includes(q))
    ).map((r) => ({
      id: `region-${r.value}`,
      label: r.label,
      value: r.value,
      badge: "Stadsdel",
      icon: "📍",
      placeId: undefined as number | undefined,
    }));

    const matchedCuisines = SEARCH_CUISINE_SUGGESTIONS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.value.toLowerCase().includes(q)
    ).map((c) => ({
      id: `cuisine-${c.value}`,
      label: c.label,
      value: c.value,
      badge: c.badge,
      icon: "🍴",
      placeId: undefined as number | undefined,
    }));

    if (!q) {
      const defaultPlaces = places.slice(0, 5).map((p) => ({
        id: `place-${p.id}`,
        label: `${p.name} (${p.area})`,
        value: p.name,
        badge: p.kind,
        icon: p.kind === "Bakery" ? "🥐" : p.kind === "Café" ? "☕" : "🏢",
        placeId: p.id,
      }));
      return [...matchedRegions.slice(0, 4), ...matchedCuisines.slice(0, 4), ...defaultPlaces];
    }

    const qClean = q.replace(/[,\s]+/g, " ").trim();
    const qTokens = qClean.split(" ").filter(Boolean);

    const matchedPlaces = places
      .map((p) => {
        const nameLower = p.name.toLowerCase();
        const areaLower = p.area.toLowerCase();
        const addressLower = (p.address || "").toLowerCase();
        const kindLower = p.kind.toLowerCase();
        const tagsStr = (p.tags || []).join(" ").toLowerCase();
        const fullPlaceText = `${nameLower} ${areaLower} ${addressLower} ${kindLower} ${tagsStr}`;

        let score = 0;
        if (nameLower === q || nameLower === qClean) score = 100;
        else if (nameLower.startsWith(q) || nameLower.startsWith(qClean)) score = 80;
        else if (qTokens.length > 1 && qTokens.every((token) => fullPlaceText.includes(token))) score = 75;
        else if (nameLower.includes(` ${qClean}`)) score = 65;
        else if (nameLower.includes(qClean)) score = 50;
        else if (areaLower.includes(qClean)) score = 30;
        else if (kindLower.includes(qClean) || tagsStr.includes(qClean)) score = 15;

        return { place: p, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name))
      .map(({ place: p }) => ({
        id: `place-${p.id}`,
        label: `${p.name} (${p.area})`,
        value: p.name,
        badge: p.kind,
        icon: p.kind === "Bakery" ? "🥐" : p.kind === "Café" ? "☕" : "🏢",
        placeId: p.id,
      }));

    return [...matchedPlaces, ...matchedRegions, ...matchedCuisines];
  }, [places, query]);

  const flatAutocompleteItems = useMemo(() => {
    const list: Array<{ id: string; label: string; value: string; badge: string; icon?: string; placeId?: number; isPrompt?: boolean }> = [];
    for (const item of searchAutocompleteSuggestions) {
      list.push(item);
    }
    for (const prompt of matchingSuggestions) {
      list.push({
        id: `prompt-${prompt}`,
        label: prompt,
        value: prompt,
        badge: lang === "sv" ? "Fråga" : "Ask",
        isPrompt: true,
      });
    }
    return list;
  }, [searchAutocompleteSuggestions, matchingSuggestions, lang]);

  const handleSelectAutocompleteItem = (item: { value: string; placeId?: number; isPrompt?: boolean }) => {
    setQuery(item.value);
    setConcierge(item.value);
    setIsSearchFocused(false);
    setAutocompleteIndex(-1);

    if (item.placeId) {
      setSelected(item.placeId);
      document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
    } else if (item.isPrompt) {
      void askWithQuery(item.value);
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isSearchFocused || flatAutocompleteItems.length === 0) {
      if (event.key === "Enter") {
        event.preventDefault();
        void askFromSearch();
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAutocompleteIndex((prev) => (prev < flatAutocompleteItems.length - 1 ? prev + 1 : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setAutocompleteIndex((prev) => (prev > 0 ? prev - 1 : flatAutocompleteItems.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (autocompleteIndex >= 0 && autocompleteIndex < flatAutocompleteItems.length) {
        handleSelectAutocompleteItem(flatAutocompleteItems[autocompleteIndex]);
      } else {
        void askFromSearch();
      }
    } else if (event.key === "Tab") {
      if (autocompleteIndex >= 0 && autocompleteIndex < flatAutocompleteItems.length) {
        event.preventDefault();
        const item = flatAutocompleteItems[autocompleteIndex];
        setQuery(item.value);
        setConcierge(item.value);
      }
    } else if (event.key === "Escape") {
      setIsSearchFocused(false);
      setAutocompleteIndex(-1);
    }
  };

  const [conciergeChatMessages, setConciergeChatMessages] = useState<import("../lib/concierge/contracts").ChatMessage[]>([]);

  async function askWithQuery(queryText: string) {
    if (!queryText.trim()) return;

    conciergeRequest.current?.abort();
    const controller = new AbortController();
    conciergeRequest.current = controller;
    setAsking(true);
    setAnswer(null);
    setConciergeResponse(null);
    let queryLocation = userLocation;
    if (DISTANCE_INTENT_REGEX.test(queryText)) {
      if (!queryLocation) queryLocation = await requestUserLocation(true);
      else setSortMode("Distance");
    }
    if (conciergeRequest.current !== controller || controller.signal.aborted) return;

    logConciergeQuery(queryText, lang);
    setConciergeHistory((prev) => {
      const filtered = prev.filter((q) => q.toLowerCase() !== queryText.trim().toLowerCase());
      return [queryText.trim(), ...filtered].slice(0, 100);
    });

    const currentMessages = conciergeChatMessages;
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const resp = await fetch("/api/concierge", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText, language: lang, messages: currentMessages, ...(queryLocation ? { location: queryLocation } : {}) }),
      });
      if (!resp.ok) throw new Error(`HTTP error ${resp.status}`);
      const payload = await resp.json() as ConciergeResponse;
      if (payload.status === 'unavailable') throw new Error('catalog_unavailable');
      if (payload.schemaVersion !== 'concierge-response-v1' || typeof payload.answer !== 'string' || !Array.isArray(payload.cards)) throw new Error('invalid_response');
      if (conciergeRequest.current !== controller || controller.signal.aborted) return;
      setConciergeResponse(payload);
      setAnswer(payload.answer);
      if (payload.action) setSuperpowerMode(payload.action);
      setConciergeChatMessages((prev) => [
        ...prev,
        { role: "user" as const, content: queryText.trim() },
        { role: "assistant" as const, content: payload.intro || payload.answer },
      ].slice(-10));
    } catch {
      if (conciergeRequest.current !== controller) return;
      if (!controller.signal.aborted) {
        try {
          // Use loaded places or fetch published places snapshot
          let catalog = places;
          if (!catalog.length) {
            const snapshot = await fetch('/data/places.json', { signal: controller.signal }).then((res) => res.json());
            catalog = Array.isArray(snapshot) ? snapshot : (snapshot.places ?? []);
          }
          if (conciergeRequest.current !== controller || controller.signal.aborted) return;
          const result = retrieveAndSynthesize(queryText, catalog, { language: lang, messages: currentMessages, ...(queryLocation ? { location: queryLocation } : {}) });
          setConciergeResponse(result);
          setAnswer(result.answer);
          if (result.action) setSuperpowerMode(result.action);
          setConciergeChatMessages((prev) => [
            ...prev,
            { role: "user" as const, content: queryText.trim() },
            { role: "assistant" as const, content: result.intro || result.answer },
          ].slice(-10));
        } catch {
          if (conciergeRequest.current === controller) setAnswer(lang === 'sv' ? 'Katalogen är inte tillgänglig just nu.' : 'The catalog is currently unavailable.');
        }
      } else {
        setAnswer(lang === 'sv' ? 'Conciergen är inte tillgänglig just nu. Försök igen.' : 'The concierge is currently unavailable. Please try again.');
      }
    } finally {
      clearTimeout(timer);
      if (conciergeRequest.current === controller) setAsking(false);
    }
  }

  const handleAddPlaceSuperpower = (newPlace: PlaceInput) => {
    setPlaces((prev) => [newPlace, ...prev]);
    setSelected(newPlace.id);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("motkarta_user_places");
        const list: PlaceInput[] = stored ? JSON.parse(stored) : [];
        localStorage.setItem("motkarta_user_places", JSON.stringify([newPlace, ...list]));
      } catch {}
    }
    setAnswer(`Superpower aktiverad. Ditt nya oberoende ställe '${newPlace.name}' i ${newPlace.area} har lagts till lokalt som kandidat för verifiering.`);
  };

  const handleAddReviewSuperpower = (placeId: number, rev: { author: string; rating: number; content: string; source: "Community Submission" }) => {
    addUserReview(placeId, rev);
    const targetPlace = places.find((p) => p.id === placeId);
    setSelected(placeId);
    setAnswer(`Superpower aktiverad. Din recension för '${targetPlace?.name ?? "Stället"}' har sparats och inväntar verifiering.`);
  };

  const handleAddPhotoSuperpower = (placeId: number, ph: { url: string; thumbnailUrl: string; caption: string; credit?: string }) => {
    addUserPhoto(placeId, ph);
    const targetPlace = places.find((p) => p.id === placeId);
    setSelected(placeId);
    setAnswer(`📷 Superpower Aktiverad! Ditt foto för '${targetPlace?.name ?? "Stället"}' har lagts till i bildgalleriet!`);
  };

  const handleRatePlaceSuperpower = (placeId: number, rating: number) => {
    handleRatePlace(placeId, rating);
    const targetPlace = places.find((p) => p.id === placeId);
    setSelected(placeId);
    setAnswer(`⭐ Superpower Aktiverad! Ditt betyg (${rating}/5 stjärnor) för '${targetPlace?.name ?? "Stället"}' har sparats!`);
  };

  async function ask() {
    await askWithQuery(concierge);
  }

  async function askFromSearch() {
    const searchText = query.trim() || concierge.trim();
    if (!searchText) return;

    setConcierge(searchText);
    await askWithQuery(searchText);

    if (typeof window !== "undefined") {
      setTimeout(() => {
        document.getElementById("concierge-answer")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }

  const handleRefineQuery = (extra: string) => {
    const updated = extra.trim();
    setConcierge(updated);
    setQuery(updated);
    void askWithQuery(updated);
  };

  if (isAdminRoute) {
    return (
      <main className="admin-app-shell">
        <header className="admin-app-topbar">
          <a className="brand" href="/" aria-label="MOTKARTA">
            <img src="/motkarta_drop_divided_black_red.svg" alt="MOTKARTA Pin" className="brand-counter-pin" />
            <img src="/logo.webp" alt="MOTKARTA" className="brand-logo" />
            <span>{t.brandDescriptor}</span>
          </a>
          <div className="admin-topbar-actions">
            {adminSession?.admin ? (
              <div className="admin-session-auth" aria-live="polite">
                <ShieldCheck size={14} weight="bold" />
                <span>
                  {adminSession.email
                    ? adminSession.email
                    : lang === "sv"
                      ? "Adminsession aktiv"
                      : "Admin session active"}
                </span>
                <button
                  type="button"
                  className="admin-review-ghost-btn admin-logout-btn"
                  onClick={handleGlobalAdminLogout}
                  title={lang === "sv" ? "Logga ut från adminsession" : "Log out from admin session"}
                >
                  <SignOut size={14} weight="bold" />
                  {adminSession.authMode === "token"
                    ? lang === "sv"
                      ? "Glöm token"
                      : "Forget token"
                    : lang === "sv"
                      ? "Logga ut"
                      : "Log out"}
                </button>
              </div>
            ) : null}
            <div className="lang-switcher" aria-label="Language selector">
              <button
                type="button"
                className={`lang-btn ${lang === "sv" ? "active" : ""}`}
                onClick={() => handleSetLang("sv")}
              >
                SV
              </button>
              <button
                type="button"
                className={`lang-btn ${lang === "en" ? "active" : ""}`}
                onClick={() => handleSetLang("en")}
              >
                EN
              </button>
            </div>
          </div>
        </header>
        <section className="admin-app-intro" aria-labelledby="admin-app-title">
          <p className="eyebrow">{lang === "sv" ? "Skyddad adminyta" : "Protected admin area"}</p>
          <h1 id="admin-app-title">{lang === "sv" ? "Operationskö" : "Operations queue"}</h1>
          <p>
            {lang === "sv"
              ? "Granska kandidater, exportera labels och kontrollera att D1-adminschemat är redo."
              : "Review candidates, export labels, and check that the D1 admin schema is ready."}
          </p>
        </section>
        <CuratedSourcesPanel
          sources={curatedSources}
          isLoading={isSourcesLoading}
          lang={lang}
          onAddSource={() => setSuperpowerMode("add_source")}
        />
        <AdminReviewPanel
          lang={lang}
          adminSession={adminSession}
          onSessionChange={setAdminSession}
          onLogout={handleGlobalAdminLogout}
        />
        {superpowerMode === "add_source" ? (
          <ConciergeSuperpowerModal
            mode={superpowerMode}
            places={places}
            activePlace={active}
            onClose={() => setSuperpowerMode(null)}
            onAddPlace={handleAddPlaceSuperpower}
            onAddReview={handleAddReviewSuperpower}
            onAddPhoto={handleAddPhotoSuperpower}
            onRatePlace={handleRatePlaceSuperpower}
            onAddSource={handleAddSourceSuperpower}
            lang={lang}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main>
      {/* Unified Motkarta Top Header */}
      <header className="topbar">
        <a
          className="brand"
          href="#"
          aria-label="MOTKARTA"
          onClick={(e) => {
            e.preventDefault();
            handleResetMobileFilters();
          }}
        >
          <img src="/motkarta_drop_divided_black_red.svg" alt="MOTKARTA Pin" className="brand-counter-pin" />
          <img src="/logo.webp" alt="MOTKARTA" className="brand-logo" />
          <span className="brand-descriptor">{t.brandDescriptor}</span>
        </a>
        <nav>
          <a href="#map" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <Compass size={14} weight="bold" /> {t.navMap}
          </a>
          <a href="#method" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <ShieldCheck size={14} weight="bold" /> {t.navMethod}
          </a>
          <a
            href="#concierge"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            onClick={(e) => {
              e.preventDefault();
              focusSearchInput();
            }}
          >
            <MagnifyingGlass size={14} weight="bold" /> {t.navConcierge}
          </a>
          <a href="#merch" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <ShoppingBag size={14} weight="bold" /> Merch
          </a>
          <button
            type="button"
            className="onboarding-trigger-btn"
            onClick={() => setShowOnboarding(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", font: "inherit", color: "inherit", cursor: "pointer" }}
          >
            <Sparkle size={14} weight="bold" /> {lang === "sv" ? "Principer" : "Principles"}
          </button>
        </nav>
        <div className="topbar-actions">
          {adminSession?.admin ? (
            <div className="admin-session-auth topbar-session-auth" aria-live="polite">
              <ShieldCheck size={14} weight="bold" />
              <span>
                {adminSession.email
                  ? adminSession.email
                  : lang === "sv"
                    ? "Admin"
                    : "Admin"}
              </span>
              <button
                type="button"
                className="admin-review-ghost-btn admin-logout-btn"
                onClick={handleGlobalAdminLogout}
                title={lang === "sv" ? "Logga ut från adminsession" : "Log out of admin session"}
              >
                <SignOut size={14} weight="bold" />
                {adminSession.authMode === "token"
                  ? lang === "sv"
                    ? "Glöm"
                    : "Forget"
                  : lang === "sv"
                    ? "Logga ut"
                    : "Log out"}
              </button>
            </div>
          ) : null}

          {/* Shopping Cart Button */}
          <button
            type="button"
            className={`topbar-cart-btn ${totalCartCount > 0 ? "has-items" : ""}`}
            onClick={() => setIsCartOpen(true)}
            aria-label={lang === "sv" ? "Öppna varukorg" : "Open shopping cart"}
            title={lang === "sv" ? `Varukorg (${totalCartCount})` : `Shopping Cart (${totalCartCount})`}
          >
            <ShoppingCart size={16} weight="bold" />
            <span className="topbar-cart-badge">{totalCartCount}</span>
          </button>

          {/* Compact Single Language Toggle Button */}
          <button
            type="button"
            className="lang-toggle-btn"
            onClick={() => handleSetLang(lang === "sv" ? "en" : "sv")}
            title={lang === "sv" ? "Switch to English" : "Byt till svenska"}
            aria-label={lang === "sv" ? "Switch to English" : "Byt till svenska"}
          >
            {lang === "sv" ? "EN" : "SV"}
          </button>

          {/* Mobile Hamburger Menu Button at Far Right */}
          <button
            type="button"
            className="mobile-hamburger-btn"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label={lang === "sv" ? "Öppna meny" : "Open menu"}
            title={lang === "sv" ? "Huvudmeny" : "Main menu"}
          >
            <ListDashes size={20} weight="bold" />
          </button>

          <a className="about" href="#method">
            <span className={`status-dot status-dot-${dataSource}`} />
            {dataSource === "osm"
              ? t.dataSourceLiveOsm
              : dataSource === "d1"
                ? t.dataSourceLiveD1
                : dataSource === "loading"
                  ? t.dataSourceLoading
                  : t.dataSourceUnavailable}
          </a>
        </div>
      </header>

      {/* Mobile-only Quick Search & Filter Controls */}
      <div className="mobile-controls-bar">
        <div className="mobile-filter-actions">
          <button
            type="button"
            className={`quick-filter-pill ${activeFilterCount > 0 ? "is-primary-active" : ""}`}
            onClick={() => setIsFilterSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isFilterSheetOpen}
          >
            <Faders size={14} weight="bold" />
            <span>{lang === "sv" ? "Filter" : "Filters"}</span>
            {activeFilterCount > 0 ? <span className="quick-filter-badge">{activeFilterCount}</span> : null}
          </button>
          <button type="button" className="quick-filter-pill" onClick={() => setIsSyncModalOpen(true)}>
            <DeviceMobile size={13} weight="bold" />
            <span>{lang === "sv" ? "Synka enheter" : "Sync Devices"}</span>
          </button>
        </div>
        <div className="mobile-type-filters" role="group" aria-label={t.typeFilterLabel}>
          {visibleEstablishmentTypes.map((item) => (
            <button
              key={item}
              type="button"
              className={`quick-filter-pill ${kind === item ? "is-active" : ""}`}
              aria-pressed={kind === item}
              onClick={() => selectKindFilter(item)}
            >
              {kindFilterLabel(item, lang)}
            </button>
          ))}
        </div>
      </div>

      <section
        className="intro countermap-hero"
        aria-labelledby="countermap-hero-heading"
        data-story={activeHeroStoryId}
      >
        <div className="countermap-hero-copy">
          <div className="countermap-hero-eyebrow">
            <span className="countermap-hero-badge-square" aria-hidden="true" />
            <span className="countermap-hero-badge-text">{t.heroBadge}</span>
          </div>
          <h1 id="countermap-hero-heading">
            <span className="countermap-hero-line">{t.titleMain}</span>
            <span className="countermap-hero-line">
              {t.titleSubPrefix ? <span>{t.titleSubPrefix}</span> : null}
              <span className="countermap-hero-highlight">{t.titleSubHighlight}</span>
            </span>
            <span className="countermap-hero-line countermap-hero-highlight">{t.titleSubEnd}</span>
          </h1>
          <div className="countermap-hero-copy-foot">
            <div
              className="countermap-hero-manifest"
              role="region"
              aria-label={t.heroManifestBadge}
              data-manifest-en={t.heroManifestEn}
            >
              <div className="countermap-hero-manifest-eyebrow">
                <span className="countermap-hero-manifest-pip" aria-hidden="true" />
                <span className="countermap-hero-manifest-badge">{t.heroManifestBadge}</span>
              </div>
              <div className="countermap-hero-manifest-body">
                <p className="countermap-hero-manifest-primary">{t.heroManifestPrimary}</p>
                <p className="countermap-hero-manifest-secondary">{t.heroManifestSecondary}</p>
              </div>
            </div>
            <p className="lede">
              {t.ledeLines ? (
                t.ledeLines.map((line, idx) => (
                  <span key={idx} className="lede-line">
                    {line}
                    {idx < t.ledeLines.length - 1 ? <br className="lede-desktop-br" /> : null}
                  </span>
                ))
              ) : (
                t.lede
              )}
            </p>
            <a className="countermap-hero-jump" href="#map">
              <span>{lang === "sv" ? "Börja upptäcka" : "Start discovering"}</span>
              <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="countermap-stage" aria-label={lang === "sv" ? "Levande motkarta med katalogbilder" : "Living counter-map with catalog photography"}>
          <div className="countermap-stage-head">
            <span>{lang === "sv" ? "Illustrativ kartvy · livekatalog nedan" : "Illustrative map view · live catalog below"}</span>
            <span>{places.length.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")} {lang === "sv" ? "platser" : "places"}</span>
          </div>

          <svg key={activeHeroStoryId} className="countermap-linework" viewBox="0 0 720 500" aria-hidden="true" focusable="false">
            <path d="M-20 82 C92 74 151 111 246 92 S422 31 744 70" />
            <path d="M38 -10 C75 118 84 211 52 515" />
            <path d="M127 -12 C151 115 182 231 148 518" />
            <path d="M246 -14 C223 105 238 226 271 515" />
            <path d="M352 -18 C323 118 351 264 326 520" />
            <path d="M480 -20 C444 123 455 306 508 524" />
            <path d="M614 -22 C576 132 618 300 590 522" />
            <path d="M-18 174 C145 149 273 187 402 148 S608 112 742 155" />
            <path d="M-15 284 C129 255 224 302 360 273 S584 220 742 254" />
            <path d="M-18 410 C116 364 249 418 386 387 S612 335 746 374" />
            <path className="countermap-water-line" d="M-28 348 C93 311 175 332 243 373 S409 456 754 424" />
            <path className="countermap-active-route" pathLength="1" d="M102 404 C154 329 236 327 294 271 S398 160 519 177 S612 207 650 133" />
          </svg>

          <div className="countermap-evidence-markers" aria-hidden="true">
            <span className="countermap-marker countermap-marker-a" />
            <span className="countermap-marker countermap-marker-b" />
            <span className="countermap-marker countermap-marker-c" />
            <span className="countermap-marker countermap-marker-d" />
            <span className="countermap-crosshair"><i /></span>
          </div>

          <div className="countermap-photo-index">
            {DESKTOP_HERO_STORIES.map((story, index) => {
              const isActiveStory = story.id === activeHeroStoryId;
              const isAvailable = places.some((place) => place.id === story.id);
              return (
                <button
                  key={story.id}
                  type="button"
                  className={`countermap-photo-card countermap-photo-card-${index + 1} ${isActiveStory ? "is-active" : ""}`}
                  onClick={() => {
                    if (!isAvailable) return;
                    handleSelectPlace(story.id);
                    document.getElementById("place-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  disabled={!isAvailable}
                  aria-label={lang === "sv" ? `Visa ${story.name} på kartan` : `Show ${story.name} on the map`}
                  title={`${story.name} · ${story.credit}`}
                >
                  <span className="countermap-photo-fallback" aria-hidden="true">{story.name}</span>
                  <img
                    src={story.imageUrl}
                    alt=""
                    loading={index === 0 ? "eager" : "lazy"}
                    referrerPolicy="no-referrer"
                    onError={(event) => event.currentTarget.classList.add("is-missing")}
                  />
                  <span className="countermap-photo-caption">
                    <span>{story.name}</span>
                    <small>{story.area} · {kindFilterLabel(story.kind, lang)}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="countermap-stage-foot">
            <p>{t.subLede}</p>
            <button
              type="button"
              className="countermap-sync-button"
              onClick={() => setIsSyncModalOpen(true)}
              title={lang === "sv" ? "Synka dina enheter utan konto eller inloggning" : "Sync devices without account or login"}
            >
              <QrCode size={18} weight="bold" aria-hidden="true" />
              <span>{lang === "sv" ? "Synka sparade ställen" : "Sync saved places"}</span>
              <ArrowRight size={15} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <section className="controls countermap-controls" id="map" aria-labelledby="countermap-controls-title">
        <header className="countermap-controls-head">
          <div className="countermap-controls-head-title-row">
            <h2 id="countermap-controls-title">{t.controlsHeading}</h2>
            <div className="countermap-selection-readout" aria-live="polite">
              <strong>{ranked.length.toLocaleString(lang === "sv" ? "sv-SE" : "en-US")}</strong>
              <span>{lang === "sv" ? "ställen i urvalet" : "places in selection"}</span>
            </div>
          </div>
          <p data-subparagraph-en="Tell us what you're in the mood for. Ask freely or use a few preferences – we'll find great places based on transparent signals.">
            {t.controlsSubparagraph}
          </p>
        </header>

        <div className="countermap-concierge-panel">
          <div className="countermap-panel-heading">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className="countermap-panel-icon"><Sparkle size={16} weight="fill" aria-hidden="true" /></span>
              <div>
                <strong>{lang === "sv" ? "Concierge" : "Concierge"}</strong>
                <small>{lang === "sv" ? "Söker först i verifierade signaler" : "Searches verified signals first"}</small>
              </div>
            </div>
            {answer ? (
              <button
                type="button"
                className="countermap-concierge-close"
                onClick={() => {
                  conciergeRequest.current?.abort();
                  setAnswer(null);
                  setConciergeResponse(null);
                  setConciergeChatMessages([]);
                }}
                title={lang === "sv" ? "Stäng svar" : "Dismiss answer"}
              >
                <X size={13} weight="bold" />
                <span>{lang === "sv" ? "Stäng" : "Close"}</span>
              </button>
            ) : null}
          </div>

          <div className="search-container-relative">
          <label className="countermap-search-label" htmlFor="desktop-discovery-search">
            {lang === "sv" ? "Plats, kök, stadsdel eller fråga" : "Place, cuisine, neighborhood or question"}
          </label>
          <div className="unified-search-input-wrapper">
            <MagnifyingGlass size={18} weight="bold" style={{ color: "var(--color-ink)", flexShrink: 0 }} />
            <input
              id="desktop-discovery-search"
              ref={searchInputRef}
              aria-label={lang === "sv" ? "Sök ställe, kök, område eller fråga" : "Search place, cuisine, region or ask"}
              list="concierge-places-datalist"
              value={query}
              onChange={(event) => {
                const val = event.target.value;
                setQuery(val);
                setConcierge(val);
                setAutocompleteIndex(-1);
                if (userLocation && DISTANCE_INTENT_REGEX.test(val)) setSortMode('Distance');
              }}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 250)}
              placeholder={lang === "sv" ? "Sök ställe, kök, stadsdel eller ställ en fråga till concierge..." : "Search place, cuisine, region or ask concierge..."}
            />
            <datalist id="concierge-places-datalist">
              {places.map((p) => (
                <option key={`dl-${p.id}`} value={p.name} label={`${p.area} • ${p.kind}`} />
              ))}
            </datalist>
            {query.trim() ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  clearConciergeState();
                  setAutocompleteIndex(-1);
                }}
                aria-label="Clear search field"
                title={lang === "sv" ? "Rensa fält" : "Clear field"}
              >
                <X size={15} weight="bold" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              className="unified-search-ai-btn"
              onClick={() => void askFromSearch()}
              disabled={asking || !(query.trim() || concierge.trim())}
              title={lang === "sv" ? "Ställ fråga till AI-Concierge" : "Ask AI Concierge"}
            >
              {asking ? (
                <CircleNotch size={15} className="animate-spin" />
              ) : (
                <Sparkle size={15} weight="bold" />
              )}
              <span>{lang === "sv" ? "Fråga concierge" : "Ask concierge"}</span>
            </button>
          </div>

          {isSearchFocused && (searchAutocompleteSuggestions.length > 0 || matchingSuggestions.length > 0) ? (
            <div className="search-autocomplete-box">
              {searchAutocompleteSuggestions.length > 0 ? (
                <>
                  <div className="autocomplete-category-header">
                    <Compass size={12} weight="bold" />
                    <span>
                      {query.trim()
                        ? lang === "sv"
                          ? `MATCHANDE STÄLLEN & STADSDELAR (${searchAutocompleteSuggestions.length})`
                          : `MATCHING PLACES & REGIONS (${searchAutocompleteSuggestions.length})`
                        : lang === "sv"
                        ? "STADSDELAR, STÄLLEN & KÖK"
                        : "REGIONS, PLACES & CUISINES"}
                    </span>
                  </div>
                  {searchAutocompleteSuggestions.map((item) => {
                    const itemIdx = flatAutocompleteItems.findIndex((f) => f.id === item.id);
                    const isActive = itemIdx === autocompleteIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`autocomplete-item ${isActive ? "active" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectAutocompleteItem(item);
                        }}
                        onMouseEnter={() => setAutocompleteIndex(itemIdx)}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {item.placeId ? <MapTrifold size={14} weight="bold" aria-hidden="true" /> : <Compass size={14} weight="bold" aria-hidden="true" />}
                          <span style={{ fontWeight: 600 }}>{item.label}</span>
                        </span>
                        <span className="autocomplete-type-badge">{item.badge}</span>
                      </button>
                    );
                  })}
                </>
              ) : null}

              {matchingSuggestions.length > 0 ? (
                <>
                  <div
                    className="autocomplete-category-header"
                    style={{
                      marginTop: searchAutocompleteSuggestions.length > 0 ? "8px" : "0",
                      borderTop: searchAutocompleteSuggestions.length > 0 ? "1px solid var(--color-mist)" : "none",
                      paddingTop: "8px",
                    }}
                  >
                    <Sparkle size={12} weight="bold" />
                    <span>{lang === "sv" ? "FRÅGA AI-CONCIERGE" : "ASK AI CONCIERGE"}</span>
                  </div>
                  {matchingSuggestions.map((prompt) => {
                    const promptId = `prompt-${prompt}`;
                    const itemIdx = flatAutocompleteItems.findIndex((f) => f.id === promptId);
                    const isActive = itemIdx === autocompleteIndex;
                    return (
                      <button
                        key={promptId}
                        type="button"
                        className={`autocomplete-item ${isActive ? "active" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectAutocompleteItem({ value: prompt, isPrompt: true });
                        }}
                        onMouseEnter={() => setAutocompleteIndex(itemIdx)}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Sparkle size={13} style={{ color: "var(--color-water)" }} />
                          <span>{prompt}</span>
                        </span>
                        <span
                          className="autocomplete-type-badge"
                          style={{ background: "rgba(37, 99, 235, 0.1)", color: "var(--color-water)" }}
                        >
                          {lang === "sv" ? "Fråga" : "Ask"}
                        </span>
                      </button>
                    );
                  })}
                </>
              ) : null}
            </div>
          ) : null}
          </div>

          {answer ? (
            <div className="concierge-panel-chat" id="concierge-answer" aria-label="Concierge answer">
              <ConciergeAnswerView
                answer={answer}
                response={conciergeResponse?.answer === answer ? conciergeResponse : undefined}
                places={places}
                onSelectPlace={handleSelectPlace}
                onRefineQuery={handleRefineQuery}
                onTriggerAction={(action, prefillName) => {
                  setSuperpowerInitialPlaceName(prefillName);
                  setSuperpowerMode(action);
                }}
                lang={lang}
                onClose={() => { conciergeRequest.current?.abort(); setAnswer(null); setConciergeResponse(null); setConciergeChatMessages([]); }}
                messages={conciergeChatMessages}
              />
            </div>
          ) : (
            <>
              <div className="countermap-starter-row" aria-label={lang === "sv" ? "Förslag till concierge" : "Concierge starters"}>
                <span>{lang === "sv" ? "Prova" : "Try"}</span>
                <div>
                  {getPopularConciergePrompts(lang).slice(0, 3).map((promptText) => (
                    <button
                      key={promptText}
                      type="button"
                      onClick={() => {
                        setQuery(promptText);
                        setConcierge(promptText);
                        window.requestAnimationFrame(() => searchInputRef.current?.focus());
                      }}
                    >
                      {promptText}
                      <ArrowRight size={13} weight="bold" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="unified-superpower-row" aria-label="Concierge superpowers">
                <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_place")}>
                  <PlusCircle size={13} weight="bold" /> {lang === "sv" ? "Nytt ställe" : "Add place"}
                </button>
                <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_review")}>
                  <Sparkle size={13} weight="bold" /> {lang === "sv" ? "Recension" : "Review"}
                </button>
                <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_photo")}>
                  <Image size={13} weight="bold" /> {lang === "sv" ? "Foto" : "Photo"}
                </button>
                <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("rate_place")}>
                  <Star size={13} weight="bold" /> {lang === "sv" ? "Betygsätt" : "Rate"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="countermap-filter-panel">
          <div className="countermap-filter-head">
            <div>
              <strong>{lang === "sv" ? "Smakindex" : "Taste index"}</strong>
              <small>{lang === "sv" ? "Urvalet uppdateras direkt" : "Selection updates instantly"}</small>
            </div>
            {(query.trim() || kind !== "All places" || cuisine !== allCuisines || selectedTags.length > 0) ? (
              <button
                type="button"
                className="countermap-reset-button"
                onClick={handleResetMobileFilters}
                title={lang === "sv" ? "Återställ alla filter och sökning" : "Reset all filters"}
              >
                <X size={14} weight="bold" aria-hidden="true" />
                {lang === "sv" ? "Rensa allt" : "Reset all"}
              </button>
            ) : (
              <span className="countermap-filter-status">{lang === "sv" ? "OFILTRERAT" : "UNFILTERED"}</span>
            )}
          </div>

        <div className="chips countermap-type-chips" aria-label="Filter typ">
          <span className="filter-label">{t.typeFilterLabel}</span>
          <div className="chip-row">
            {visibleEstablishmentTypes.map((item) => (
              <button
                key={item}
                aria-pressed={kind === item}
                className={kind === item ? "active" : ""}
                onClick={() => selectKindFilter(item)}
                type="button"
              >
                {item === "Restaurant" ? <ForkKnife size={18} weight="bold" aria-hidden="true" /> : null}
                {item === "Bakery" ? <Bread size={18} weight="bold" aria-hidden="true" /> : null}
                {item === "Café" || item === "Specialty coffee" ? <Coffee size={18} weight="bold" aria-hidden="true" /> : null}
                {item === "All places" ? <MapTrifold size={18} weight="bold" aria-hidden="true" /> : null}
                {item === "Saved" ? <Star size={18} weight="bold" aria-hidden="true" /> : null}
                {item === "Latest" ? <Sparkle size={18} weight="bold" aria-hidden="true" /> : null}
                {kindFilterLabel(item, lang)}
              </button>
            ))}
          </div>
        </div>
        <div className="chips cuisine-chips" aria-label="Filter kök">
          <span className="filter-label">{t.cuisineFilterLabel}</span>
          <div className="chip-row">
            {[allCuisines, ...cuisineOptions].map((item) => (
              <button
                key={item}
                aria-pressed={cuisine === item}
                className={cuisine === item ? "active" : ""}
                onClick={() => selectCuisineFilter(item)}
                type="button"
              >
                {item === allCuisines ? t.allCuisines : cuisineLabel(item, lang)}
              </button>
            ))}
          </div>
        </div>
        <div className="chips feature-chips" aria-label="Filter egenskaper">
          <span className="filter-label">{lang === "sv" ? "Egenskaper" : "Features"}</span>
          <div className="chip-row">
            <button
              className={selectedTags.includes("Dog friendly") ? "active" : ""}
              onClick={() => {
                const exists = selectedTags.includes("Dog friendly");
                const updated = exists
                  ? selectedTags.filter((t) => t !== "Dog friendly")
                  : [...selectedTags, "Dog friendly"];
                clearConciergeState();
                setSelectedTags(updated);
              }}
              type="button"
            >
              <PawPrint size={18} weight={selectedTags.includes("Dog friendly") ? "fill" : "bold"} />
              <span>{lang === "sv" ? "Hundvänligt" : "Dog Friendly"}</span>
            </button>
          </div>
        </div>
        </div>
      </section>

      <section className="workspace" id="place-workspace" ref={workspaceRef}>
        <div className="mobile-results-header-bar">
          <div className="mobile-results-header-top">
            <div className="mobile-results-title-group">
              <span className="mobile-results-eyebrow">{t.eyebrow}</span>
              <h2 className="mobile-results-count">
                <span>{ranked.length}</span> <span>{t.placesInView}</span>
              </h2>
            </div>
            <button
              type="button"
              className="mobile-formula-trigger-btn"
              onClick={() => setMobileRankSheet("formula")}
              title={lang === "sv" ? "Visa formel & principer" : "Show formula & principles"}
            >
              <Info size={14} weight="bold" />
              <span>{lang === "sv" ? "Formel" : "Formula"}</span>
            </button>
          </div>

          <div className="mobile-rank-ddl-row">
            <button
              type="button"
              className={`mobile-ddl-pill ${mode !== "All recommendations" ? "is-active" : ""}`}
              onClick={() => setMobileRankSheet("visa")}
            >
              <div className="mobile-ddl-text">
                <span className="mobile-ddl-label">VISA</span>
                <span className="mobile-ddl-value">{modeLabel(mode, lang)}</span>
              </div>
              <CaretDown size={14} weight="bold" className="mobile-ddl-caret" />
            </button>

            <button
              type="button"
              className={`mobile-ddl-pill ${sortMode !== "Motkarta score" ? "is-active" : ""}`}
              onClick={() => setMobileRankSheet("sortera")}
            >
              <div className="mobile-ddl-text">
                <span className="mobile-ddl-label">SORTERA</span>
                <span className="mobile-ddl-value">{sortModeLabel(sortMode, lang)}</span>
              </div>
              <CaretDown size={14} weight="bold" className="mobile-ddl-caret" />
            </button>

            {sortMode === "Surprise me" ? (
              <button
                type="button"
                className="mobile-shuffle-icon-btn"
                onClick={() => setRandomSeed((value) => value + 1)}
                title={t.shuffle}
              >
                <Shuffle size={15} weight="bold" />
              </button>
            ) : null}
          </div>
        </div>

        {mobileViewMode === "list" ? (
          <MobilePlaceCardList
            places={visibleRanked}
            activePlace={active}
            savedPlaceIds={savedPlaceIds}
            userLocation={userLocation}
            lang={lang}
            onSelectPlace={(p) => {
              setSelected(p.id);
              setIsPlaceDetailOpen(true);
            }}
            onToggleSave={handleToggleSavePlace}
          />
        ) : (
          <div className="map-panel">
            <FoodMap
              places={mapPlaces}
              activePlace={active}
              userLocation={userLocation}
              onSelect={handleSelectPlace}
              onUserLocated={(loc) => {
                setUserLocation(loc);
                setSortMode("Distance");
              }}
              lang={lang}
            />

          {locationToast ? (
            <div className="location-toast" role="status">
              <span>{locationToast}</span>
              <button type="button" onClick={() => setLocationToast(null)}>✕</button>
            </div>
          ) : null}
          <div className="legend map-legend" role="toolbar" aria-label={lang === "sv" ? "Platsfilter på kartan" : "Place filters on map"}>
            <button
              type="button"
              className={`map-legend-btn ${kind === "Specialty coffee" ? "is-active" : ""}`}
              aria-pressed={kind === "Specialty coffee"}
              onClick={() => selectKindFilter(kind === "Specialty coffee" ? "All places" : "Specialty coffee")}
              title={lang === "sv" ? "Filtrera specialkaffe (klicka för att växla)" : "Filter specialty coffee (click to toggle)"}
            >
              <Coffee size={14} weight="bold" style={{ color: kind === "Specialty coffee" ? "currentColor" : "var(--color-water)" }} />
              <span>{t.legendSpecialty}</span>
            </button>
            <button
              type="button"
              className={`map-legend-btn ${kind === "Bakery" ? "is-active" : ""}`}
              aria-pressed={kind === "Bakery"}
              onClick={() => selectKindFilter(kind === "Bakery" ? "All places" : "Bakery")}
              title={lang === "sv" ? "Filtrera bagerier (klicka för att växla)" : "Filter bakeries (click to toggle)"}
            >
              <Bread size={14} weight="bold" style={{ color: kind === "Bakery" ? "currentColor" : "var(--color-water)" }} />
              <span>{t.legendBakery}</span>
            </button>
            <button
              type="button"
              className={`map-legend-btn ${kind === "Restaurant" ? "is-active" : ""}`}
              aria-pressed={kind === "Restaurant"}
              onClick={() => selectKindFilter(kind === "Restaurant" ? "All places" : "Restaurant")}
              title={lang === "sv" ? "Filtrera restauranger (klicka för att växla)" : "Filter restaurants (click to toggle)"}
            >
              <ForkKnife size={14} weight="bold" style={{ color: kind === "Restaurant" ? "currentColor" : "var(--color-water)" }} />
              <span>{t.legendRestaurant}</span>
            </button>
            {kind !== "All places" && (kind === "Specialty coffee" || kind === "Bakery" || kind === "Restaurant") ? (
              <button
                type="button"
                className="map-legend-clear-btn"
                onClick={() => selectKindFilter("All places")}
                title={lang === "sv" ? "Rensa filter (visa alla)" : "Clear filter (show all)"}
                aria-label={lang === "sv" ? "Rensa filter" : "Clear filter"}
              >
                <X size={12} weight="bold" />
              </button>
            ) : null}
          </div>

          {active ? (
          <article className={`map-card ${isMapCardMinimized ? "is-minimized" : ""}`}>
            <div className="map-card-header">
              <div className="map-card-title-meta">
                <span className="map-card-kind-badge">
                  {kindFilterLabel(active.kind, lang)} · {active.area}
                  {userLocation && hasCoordinates(active) ? ` · 📍 ${formatDistance(distanceFromPoint(active, userLocation), lang)}` : ""}
                </span>
                <h3 className="map-card-header-title">{active.name}</h3>
              </div>
              <div className="map-card-header-actions">
                <button
                  type="button"
                  className="map-card-toggle-btn"
                  onClick={() => setIsMapCardMinimized(!isMapCardMinimized)}
                  title={
                    isMapCardMinimized
                      ? lang === "sv"
                        ? "Visa alla detaljer"
                        : "Expand details"
                      : lang === "sv"
                        ? "Minimera kort"
                        : "Minimize card"
                  }
                >
                  {isMapCardMinimized ? (
                    <>
                      <CaretDown size={14} weight="bold" />
                      <span>{lang === "sv" ? "Visa" : "Expand"}</span>
                    </>
                  ) : (
                    <>
                      <CaretUp size={14} weight="bold" />
                      <span>{lang === "sv" ? "Dölj" : "Minimize"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {!isMapCardMinimized && (
              <div className="map-card-body">
                {cuisineParts(active).length ? (
                  <p className="cuisine-line">{cuisineParts(active).map((c) => cuisineLabel(c, lang)).join(" · ")}</p>
                ) : null}
                <div
                  className={`map-card-photo-container ${!activeCardPhoto ? "map-card-photo-container-dummy" : ""}`}
                  onClick={() => setIsPlaceDetailOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setIsPlaceDetailOpen(true);
                    }
                  }}
                  title={lang === "sv" ? "Visa ställets detaljer" : "View place details"}
                >
                  <img
                    src={activeCardPhoto?.url ?? DUMMY_PLACE_IMAGE_URL}
                    alt={activeCardPhoto?.caption || active.name}
                    className={`map-card-hero-photo ${!activeCardPhoto ? "map-card-hero-photo-dummy" : ""}`}
                    loading="eager"
                    onError={(event) => {
                      event.currentTarget.src = DUMMY_PLACE_IMAGE_URL;
                      event.currentTarget.classList.add("map-card-hero-photo-dummy");
                    }}
                  />
                  {activeCardPhoto?.credit ? (
                    <span className="map-card-photo-credit">
                      📷 {activeCardPhoto.credit}
                    </span>
                  ) : null}
                </div>
                <div className="tag-row">
                  {active.tags.map((tag: string) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <MotkartaScoreWidget
                  scores={active.scores}
                  overallScore={modeScore(active, mode)}
                  lang={lang}
                />
                <div
                  className="user-rating-bar"
                  style={{
                    marginTop: "12px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--color-mist)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "10px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--color-ink)",
                      }}
                    >
                      {lang === "sv" ? "Ditt betyg:" : "Your rating:"}
                    </span>
                    <div style={{ display: "flex", gap: "3px" }}>
                      {[1, 2, 3, 4, 5].map((star) => {
                        const currentRating = userRatings[active.id] ?? 0;
                        const isFilled = currentRating >= star;
                        return (
                          <button
                            key={star}
                            type="button"
                            onClick={() => handleRatePlace(active.id, star)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: "2px",
                              cursor: "pointer",
                              display: "inline-flex",
                            }}
                            title={lang === "sv" ? `Ge ${star} av 5 stjärnor` : `Rate ${star} out of 5 stars`}
                          >
                            <Star
                              size={18}
                              weight={isFilled ? "fill" : "regular"}
                              style={{ color: isFilled ? "#F59E0B" : "var(--color-mist)" }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSavePlace(active.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      background: savedPlaceIds.includes(active.id) ? "var(--color-ink)" : "var(--color-white)",
                      color: savedPlaceIds.includes(active.id) ? "var(--color-paper)" : "var(--color-ink)",
                      border: "1px solid var(--color-mist)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all var(--motion-fast)",
                    }}
                  >
                    <Star
                      size={14}
                      weight={savedPlaceIds.includes(active.id) ? "fill" : "bold"}
                      style={{ color: savedPlaceIds.includes(active.id) ? "#F59E0B" : "currentColor" }}
                    />
                    {savedPlaceIds.includes(active.id)
                      ? lang === "sv"
                        ? "Sparad"
                        : "Saved"
                      : lang === "sv"
                        ? "Spara ställe"
                        : "Save place"}
                  </button>
                </div>

                <VerificationBar place={active} lang={lang} />
                <div className="curated-attribution-box">
                  <div className="curated-attribution-title">
                    <ShieldCheck size={14} style={{ color: "var(--color-water)" }} />
                    {lang === "sv" ? "KÄLLTILLSKRIVNING & UPPHOVSRÄTT" : "SOURCE ATTRIBUTION & COPYRIGHT"}
                  </div>
                  <div className="curated-attribution-body">
                    {lang === "sv"
                      ? "Kurerade källor används som källhänvisad plats- och evidensdata, inte som importerade betyg. Guidedata kan komma från Anders Husa & Kaitlin Orr Guide, White Guide Nordic, Specialty Coffee Sweden Registry och Visit Stockholm. Tillsynsdata från Stockholms stad (CC0). Kartdata från OpenStreetMap (ODbL)."
                      : "Curated sources are used as attributed place and evidence data, not imported ratings. Guide data may come from Anders Husa & Kaitlin Orr Guide, White Guide Nordic, Specialty Coffee Sweden Registry, and Visit Stockholm. Inspection data from Stockholm City (CC0). Map data from OpenStreetMap (ODbL)."}
                  </div>
                </div>
                <ExternalMapLinks
                  place={active}
                  lang={lang}
                  onDirectionRequest={() =>
                    recordRecommendationEvents([
                      { establishmentId: active.id, eventType: "direction_request", queryContext: { surface: "place_detail" } },
                    ])
                  }
                />
                {active.discoveryReasons?.length ? (
                  <ul className="reason-list" aria-label="Discovery score reasons">
                    {active.discoveryReasons.slice(0, 3).map((reason: string) => (
                      <li key={reason} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                        <PlusCircle size={14} weight="fill" style={{ color: "var(--orange)", flexShrink: 0, marginTop: "2px" }} />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <small>
                  {active.evidence.confidence === "High" ? t.confidenceHigh : active.evidence.confidence === "Medium" ? t.confidenceMed : t.confidenceLow} · {active.evidenceLabel}
                </small>
                <p className="source-line">
                  {t.sourceLabel}: {active.sourceName ?? "OpenStreetMap"} · {t.lastUpdatedLabel}: {formatUpdatedDate(active.lastUpdated)}
                </p>
                <LazyPlaceMediaDrawer
                  place={active}
                  lang={lang}
                  excludePhotoId={activeCardPhoto?.id}
                  excludePhotoUrl={activeCardPhoto?.url}
                  excludeFirstPhoto={Boolean(activeCardPhoto)}
                />
              </div>
            )}
          </article>
          ) : null}
        </div>
        )}

        <aside className="results">

          <div className="results-head">
            <div className="results-summary">
              <p className="eyebrow results-eyebrow">{t.eyebrow}</p>
              <div className="results-count-row">
                <h2>
                  <span>{ranked.length}</span> <span>{t.placesInView}</span>
                </h2>
                {ranked.length > renderLimit ? <small>{t.showingTop} {renderLimit}</small> : null}
              </div>
            </div>
            <div className="rank-controls">
              <label className="rank-control">
                <span>{t.resultModeControlLabel}</span>
                <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
                  {visibleModes.map((item) => (
                    <option key={item} value={item}>{modeLabel(item, lang)}</option>
                  ))}
                </select>
                <small>{t.resultModeControlHint}</small>
              </label>
              <label className="rank-control">
                <span>{t.resultSortControlLabel}</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  {sortModes.map((item) => (
                    <option key={item} value={item}>{sortModeLabel(item, lang)}</option>
                  ))}
                </select>
                <small>{t.resultSortControlHint}</small>
              </label>
              {sortMode === "Surprise me" ? (
                <button
                  type="button"
                  onClick={() => setRandomSeed((value) => value + 1)}
                  className="rank-shuffle-button"
                >
                  <Shuffle size={13} weight="bold" /> {t.shuffle}
                </button>
              ) : null}
            </div>
          </div>
          <p className="formula">
            {mode === "Hidden gems"
              ? t.formulaHiddenGems
              : mode === "Popular now"
                ? t.formulaPopularNow
                : mode === "Quality first"
                  ? t.formulaQualityFirst
                  : mode === "Expert selected"
                    ? t.formulaExpertSelected
                    : mode === "Most verified"
                      ? t.formulaMostVerified
                  : t.formulaDefault}
          </p>
          <div className="principles" aria-label="Ranking principles">
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} weight="bold" style={{ color: "var(--color-water)" }} /> {t.principle1}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} weight="bold" style={{ color: "var(--color-water)" }} /> {t.principle2}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Check size={13} weight="bold" style={{ color: "var(--color-water)" }} /> {t.principle3}
            </span>
          </div>
          <div className="list">
            {hasSearchQuery && visibleRanked.length === 0 ? (
              <div className="search-empty-state" aria-live="polite">
                <strong>{t.noSearchResultsTitle}</strong>
                <span>
                  {t.noSearchResultsText} "{query.trim()}".
                </span>
              </div>
            ) : null}
            {visibleRanked.map((place, index) => (
              <div
                key={place.id}
                className={active && place.id === active.id ? "place active-place" : "place"}
                onClick={() => {
                  setSelected(place.id);
                  recordRecommendationEvents([
                    {
                      establishmentId: place.id,
                      eventType: "profile_view",
                      resultPosition: index,
                      queryContext: { surface: "results" },
                    },
                  ]);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(place.id);
                    recordRecommendationEvents([
                      {
                        establishmentId: place.id,
                        eventType: "profile_view",
                        resultPosition: index,
                        queryContext: { surface: "results" },
                      },
                    ]);
                  }
                }}
              >
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span className="place-main">
                  <small>
                    {kindFilterLabel(place.kind, lang)} · {place.area}
                    {userLocation && hasCoordinates(place) ? ` · 📍 ${formatDistance(distanceFromPoint(place, userLocation), lang)}` : ""}
                  </small>
                  <strong>{place.name}</strong>
                  <span>{place.tags.slice(0, 2).join(" · ")}</span>
                </span>
                <span className="total">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSavePlace(place.id);
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "inline-flex" }}
                      title={savedPlaceIds.includes(place.id) ? (lang === "sv" ? "Ta bort från sparade" : "Remove from saved") : (lang === "sv" ? "Spara ställe" : "Save place")}
                    >
                      <Star
                        size={15}
                        weight={savedPlaceIds.includes(place.id) ? "fill" : "regular"}
                        style={{ color: savedPlaceIds.includes(place.id) ? "#F59E0B" : "var(--color-mist)" }}
                      />
                    </button>
                    <b>{rounded(modeScore(place, mode))}</b>
                  </div>
                  <small>{t.totalScoreLabel}</small>
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="concierge" id="concierge">
        <div>
          <p className="eyebrow">{t.conciergeEyebrow}</p>
          <h2>
            {t.conciergeHeadingMain} <i>{t.conciergeHeadingItalic}</i>
            <br />
            {t.conciergeHeadingSub}
          </h2>
          <p>{t.conciergeDesc}</p>
          <div className="superpower-chips" aria-label="Concierge superpowers">
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_place")}>
              <PlusCircle size={14} weight="bold" /> {lang === "sv" ? "➕ Lägg till nytt ställe" : "➕ Add new place"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_review")}>
              <Sparkle size={14} weight="bold" /> {lang === "sv" ? "✍️ Skriv recension" : "✍️ Write review"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("add_photo")}>
              <Image size={14} weight="bold" /> {lang === "sv" ? "📷 Lägg till foto" : "📷 Add photo"}
            </button>
            <button type="button" className="superpower-chip-btn" onClick={() => setSuperpowerMode("rate_place")}>
              <Star size={14} weight="bold" /> {lang === "sv" ? "⭐ Betygsätt ställe" : "⭐ Rate place"}
            </button>
          </div>
        </div>
        <div className="concierge-showcase-box">
          <div className="concierge-showcase-header">
            <Sparkle size={14} weight="bold" style={{ color: "var(--color-water)" }} />
            <span>{lang === "sv" ? "Populära frågor att ställa i sökfältet" : "Popular questions to ask in the search bar"}</span>
          </div>
          <div className="concierge-prompt-cloud">
            {getPopularConciergePrompts(lang).slice(0, 6).map((promptText) => (
              <button
                key={promptText}
                type="button"
                className="concierge-prompt-pill"
                onClick={() => {
                  setQuery(promptText);
                  setConcierge(promptText);
                  document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
                  void askWithQuery(promptText);
                }}
              >
                <MagnifyingGlass size={13} style={{ color: "var(--color-water)", flexShrink: 0 }} />
                <span>{promptText}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="method" id="method">
        <div>
          <p className="eyebrow">{t.methodEyebrow}</p>
          <h2>
            {t.methodHeadingMain}
            <br />
            {t.methodHeadingSub}
          </h2>
        </div>
        <div className="method-grid">
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>01</b>
              <Sliders size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method01Title}</h3>
            <p>{t.method01Desc}</p>
          </article>
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>02</b>
              <Scales size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method02Title}</h3>
            <p>{t.method02Desc}</p>
          </article>
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>03</b>
              <Certificate size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method03Title}</h3>
            <p>{t.method03Desc}</p>
          </article>
          <article>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <b>04</b>
              <Sparkle size={20} weight="bold" style={{ color: "var(--color-water)" }} />
            </div>
            <h3>{t.method04Title}</h3>
            <p>{t.method04Desc}</p>
          </article>
        </div>
        <div className="disclaimer">
          {t.dataNoteLabel}
          <span>{t.dataNoteText}</span>
        </div>
      </section>

      <MerchPanel
        lang={lang}
        cart={cart}
        onAddToCart={handleAddToCart}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {superpowerMode && superpowerMode !== "add_source" ? (
        <ConciergeSuperpowerModal
          mode={superpowerMode}
          places={places}
          activePlace={active}
          initialPlaceName={superpowerInitialPlaceName}
          onClose={() => {
            setSuperpowerMode(null);
            setSuperpowerInitialPlaceName(undefined);
          }}
          onAddPlace={handleAddPlaceSuperpower}
          onAddReview={handleAddReviewSuperpower}
          onAddPhoto={handleAddPhotoSuperpower}
          onRatePlace={handleRatePlaceSuperpower}
          onAddSource={handleAddSourceSuperpower}
          lang={lang}
        />
      ) : null}

      <PreloaderModal
        isOpen={showPreloader}
        onClose={handleClosePreloader}
        lang={lang}
      />

      <OnboardingModal
        isOpen={showOnboarding}
        onClose={handleCloseOnboarding}
        onOpenConcierge={focusSearchInput}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        lang={lang}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        lang={lang}
      />

      <MobileFilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        cuisine={cuisine}
        cuisineOptions={cuisineOptions}
        onSelectCuisine={selectCuisineFilter}
        hasActiveFilters={activeFilterCount > 0 || Boolean(query.trim())}
        onResetFilters={handleResetMobileFilters}
        matchingCount={ranked.length}
        lang={lang}
      />

      <MobileRankControlSheet
        sheetType={mobileRankSheet}
        onClose={() => setMobileRankSheet(null)}
        mode={mode}
        onSelectMode={setMode}
        sortMode={sortMode}
        onSelectSortMode={setSortMode}
        onShuffle={() => setRandomSeed((val) => val + 1)}
        lang={lang}
      />

      {active ? (
        <PlaceDetailSheet
          place={active}
          isOpen={isPlaceDetailOpen}
          isSaved={savedPlaceIds.includes(active.id)}
          userRating={userRatings[active.id] ?? 0}
          userLocation={userLocation}
          lang={lang}
          onClose={() => setIsPlaceDetailOpen(false)}
          onToggleSave={handleToggleSavePlace}
          onRatePlace={handleRatePlace}
          onViewOnMap={handleViewPlaceOnMap}
        />
      ) : null}

      <SyncDevicesModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        savedPlaceIds={savedPlaceIds}
        onImportSavedPlaces={handleImportSavedPlaces}
        lang={lang}
      />

      {syncToast ? (
        <div className="sync-toast-banner" role="status" aria-live="polite">
          <div className="sync-toast-header">
            <div className="sync-toast-main">
              <span className="sync-toast-sparkle">✨</span>
              <div className="sync-toast-copy">
                <strong>
                  {lang === "sv"
                    ? `${syncToast.count} sparade favoritställen synkade!`
                    : `${syncToast.count} saved favorites synced!`}
                </strong>
                <small>
                  {lang === "sv"
                    ? "Dina favoritställen är nu redo på denna enhet."
                    : "Your favorites are now ready on this device."}
                </small>
              </div>
            </div>
            <button
              type="button"
              className="sync-toast-close-btn"
              onClick={() => setSyncToast(null)}
              aria-label={lang === "sv" ? "Stäng" : "Close"}
            >
              <X size={18} weight="bold" />
            </button>
          </div>
          <div className="sync-toast-actions">
            <button
              type="button"
              className="sync-toast-action-btn"
              onClick={() => {
                selectKindFilter("Saved");
                setSyncToast(null);
              }}
            >
              {lang === "sv" ? "Visa sparade favoritställen ★" : "View saved favorites ★"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Mobile Navigation Drawer (Hamburger Menu) */}
      {isMobileMenuOpen ? (
        <div className="mobile-menu-overlay" onClick={() => setIsMobileMenuOpen(false)} role="dialog" aria-modal="true" aria-label="Meny">
          <div className="mobile-menu-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <div className="mobile-menu-brand">
                <img src="/motkarta_drop_divided_black_red.svg" alt="MOTKARTA Pin" className="brand-counter-pin" style={{ height: "42px", width: "auto", marginRight: "-6px" }} />
                <img src="/logo.webp" alt="MOTKARTA" className="brand-logo" style={{ height: "22px", width: "auto" }} />
              </div>
              <button
                type="button"
                className="mobile-menu-close"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label={lang === "sv" ? "Stäng meny" : "Close menu"}
              >
                <X size={20} weight="bold" />
              </button>
            </div>

            <nav className="mobile-menu-links">
              <a href="#map" onClick={() => setIsMobileMenuOpen(false)}>
                <Compass size={18} weight="bold" />
                <span>{t.navMap}</span>
              </a>
              <a href="#method" onClick={() => setIsMobileMenuOpen(false)}>
                <ShieldCheck size={18} weight="bold" />
                <span>{t.navMethod}</span>
              </a>
              <a
                href="#concierge"
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  focusSearchInput();
                }}
              >
                <MagnifyingGlass size={18} weight="bold" />
                <span>{t.navConcierge}</span>
              </a>
              <a href="#merch" onClick={() => setIsMobileMenuOpen(false)}>
                <ShoppingBag size={18} weight="bold" />
                <span>Merch & Store</span>
              </a>
              <button
                type="button"
                className="mobile-menu-action-btn"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setShowOnboarding(true);
                }}
              >
                <Sparkle size={18} weight="bold" />
                <span>{lang === "sv" ? "Principer & Charters" : "Principles & Charters"}</span>
              </button>
              <button
                type="button"
                className="mobile-menu-action-btn"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSyncModalOpen(true);
                }}
              >
                <DeviceMobile size={18} weight="bold" />
                <span>{lang === "sv" ? "Synka dina enheter" : "Sync Across Devices"}</span>
              </button>
              {adminSession?.admin || isAdminRoute ? (
                <a href="/admin" onClick={() => setIsMobileMenuOpen(false)}>
                  <ShieldCheck size={18} weight="bold" />
                  <span>{lang === "sv" ? "Admin Operationskö" : "Admin Operations"}</span>
                </a>
              ) : null}
            </nav>

            <div className="mobile-menu-footer">
              <div className="mobile-menu-lang-row">
                <span>{lang === "sv" ? "Språk:" : "Language:"}</span>
                <button
                  type="button"
                  className="lang-toggle-btn"
                  onClick={() => handleSetLang(lang === "sv" ? "en" : "sv")}
                  title={lang === "sv" ? "Switch to English" : "Byt till svenska"}
                >
                  {lang === "sv" ? "EN" : "SV"}
                </button>
              </div>
              <div className="mobile-menu-status">
                <span className={`status-dot status-dot-${dataSource}`} />
                <span>
                  {dataSource === "osm"
                    ? t.dataSourceLiveOsm
                    : dataSource === "d1"
                      ? t.dataSourceLiveD1
                      : t.dataSourceLoading}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mobile-floating-controls" role="group" aria-label={lang === "sv" ? "Vynavigering" : "View navigation"}>
        <button
          type="button"
          className="mobile-floating-control-btn floating-scroll-top-btn"
          onClick={() => window.scrollTo({
            top: 0,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
          })}
          title={lang === "sv" ? "Till toppen" : "Back to top"}
          aria-label={lang === "sv" ? "Till toppen" : "Back to top"}
        >
          <ArrowUp size={20} weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="mobile-floating-control-btn floating-view-toggle-btn"
          onClick={toggleMobileView}
          aria-controls="place-workspace"
          title={mobileViewMode === "map" ? (lang === "sv" ? "Visa lista" : "Show list") : (lang === "sv" ? "Visa karta" : "Show map")}
          aria-label={mobileViewMode === "map" ? (lang === "sv" ? "Visa lista" : "Show list") : (lang === "sv" ? "Visa karta" : "Show map")}
        >
          {mobileViewMode === "map" ? <List size={20} weight="bold" aria-hidden="true" /> : <MapTrifold size={20} weight="bold" aria-hidden="true" />}
          <span>{mobileViewMode === "map" ? (lang === "sv" ? "Lista" : "List") : (lang === "sv" ? "Karta" : "Map")}</span>
        </button>
      </div>

      <footer>

        <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
          <img src="/logo.webp" alt="MOTKARTA" className="footer-logo" />
          <span>/ {t.footerLeft.replace(/^MOTKARTA \/ /, "")}</span>
        </div>
        <span>{t.footerRight}</span>
      </footer>
    </main>
  );
}
