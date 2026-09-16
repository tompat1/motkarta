import { useState, useEffect } from "react";
import { ShoppingBag, Check, Sparkle, ArrowRight, ShieldCheck, ShoppingCart, Plus, Minus, Trash, X, ArrowCounterClockwise } from "@phosphor-icons/react";
import { useCms, CmsEditFlag, readStoredMerchItems, writeStoredMerchItems, resetStoredMerchItems } from "../app/cms";

export type Language = "sv" | "en";

export type MerchItem = {
  id: string;
  nameSv: string;
  nameEn: string;
  taglineSv: string;
  taglineEn: string;
  priceSek: number;
  priceEur: number;
  badgeSv: string;
  badgeEn: string;
  descSv: string;
  descEn: string;
  specs: string[];
  stockStatusSv: string;
  stockStatusEn: string;
  image: string;
};

export const MERCH_ITEMS: MerchItem[] = [
  {
    id: "tshirt-black",
    nameSv: "MOTKARTA Heavyweight T-Shirt",
    nameEn: "MOTKARTA Heavyweight T-Shirt",
    taglineSv: "Klassisk svart tischa i 240g ekologisk bomull med 'Ingen betald ranking'",
    taglineEn: "Classic black 240g organic cotton tee featuring 'Ingen betald ranking'",
    priceSek: 390,
    priceEur: 35,
    badgeSv: "BÄSTSÄLJARE",
    badgeEn: "BESTSELLER",
    descSv: "Sydd i kraftig 240 GSM ekologisk bomull. Screentryckt i Stockholm med vattenbaserad färg för maximal hållbarhet och mjuk känsla.",
    descEn: "Crafted in heavy 240 GSM organic cotton. Screen-printed in Stockholm using water-based ink for durability and soft feel.",
    specs: ["100% Ekologisk bomull (GOTS-certifierad)", "Fit: Relaxed unisex", "Screentryckt i Södermalm"],
    stockStatusSv: "I lager (S, M, L, XL)",
    stockStatusEn: "In stock (S, M, L, XL)",
    image: "/merch/tshirt.jpg",
  },
  {
    id: "tshirt-pin-white",
    nameSv: "Motkarta Pin T-Shirt (Svart / Vit)",
    nameEn: "Motkarta Pin T-Shirt (Black / White)",
    taglineSv: "Svart heavyweight-tischa med stor vit Motkarta-nålsymbol och röd linje",
    taglineEn: "Black heavyweight tee with oversized white Motkarta pin mark and red slash",
    priceSek: 390,
    priceEur: 35,
    badgeSv: "NYHET",
    badgeEn: "NEW",
    descSv: "Sydd i kraftig 240 GSM ekologisk bomull. Ett rent fronttryck med Motkarta-symbolen för dig som vill bära manifestet utan mer text.",
    descEn: "Crafted in heavy 240 GSM organic cotton. A clean front print with the Motkarta mark for wearing the manifesto without extra copy.",
    specs: ["100% Ekologisk bomull (GOTS-certifierad)", "Fit: Relaxed unisex", "Screentryckt i Södermalm"],
    stockStatusSv: "I lager (S, M, L, XL)",
    stockStatusEn: "In stock (S, M, L, XL)",
    image: "/merch/flux-reference-image-branch.webp",
  },
  {
    id: "tshirt-grid-motkarta",
    nameSv: "Motkarta Grid T-Shirt",
    nameEn: "Motkarta Grid T-Shirt",
    taglineSv: "Svart heavyweight-tischa med blå kvartersgrid, röd punkt och MOTKARTA-tryck",
    taglineEn: "Black heavyweight tee with blue neighborhood grid, red marker, and MOTKARTA print",
    priceSek: 390,
    priceEur: 35,
    badgeSv: "NYHET",
    badgeEn: "NEW",
    descSv: "Sydd i kraftig 240 GSM ekologisk bomull. Grafiskt karttryck inspirerat av Stockholms kvarter och oberoende matställen.",
    descEn: "Crafted in heavy 240 GSM organic cotton. Graphic map print inspired by Stockholm blocks and independent food spots.",
    specs: ["100% Ekologisk bomull (GOTS-certifierad)", "Fit: Relaxed unisex", "Screentryckt i Södermalm"],
    stockStatusSv: "I lager (S, M, L, XL)",
    stockStatusEn: "In stock (S, M, L, XL)",
    image: "/merch/flux-reference-image-branch (1).webp",
  },
  {
    id: "tshirt-nollpunkt-grid",
    nameSv: "Nollpunkt Grid T-Shirt",
    nameEn: "Nollpunkt Grid T-Shirt",
    taglineSv: "Svart heavyweight-tischa med vitt kvartersgrid och NOLLPUNKT-tryck",
    taglineEn: "Black heavyweight tee with white neighborhood grid and NOLLPUNKT print",
    priceSek: 390,
    priceEur: 35,
    badgeSv: "NYHET",
    badgeEn: "NEW",
    descSv: "Sydd i kraftig 240 GSM ekologisk bomull. Tydligt Nollpunkt-tryck med kartlinjer, markör och röd koordinatdetalj.",
    descEn: "Crafted in heavy 240 GSM organic cotton. Strong Nollpunkt print with map lines, marker, and a red coordinate detail.",
    specs: ["100% Ekologisk bomull (GOTS-certifierad)", "Fit: Relaxed unisex", "Screentryckt i Södermalm"],
    stockStatusSv: "I lager (S, M, L, XL)",
    stockStatusEn: "In stock (S, M, L, XL)",
    image: "/merch/flux-reference-image-branch (2).webp",
  },
  {
    id: "tshirt-pin-shadow",
    nameSv: "Motkarta Pin T-Shirt (Svart / Skugga)",
    nameEn: "Motkarta Pin T-Shirt (Black / Shadow)",
    taglineSv: "Svart heavyweight-tischa med tonad nålsymbol och stark röd linje",
    taglineEn: "Black heavyweight tee with tonal pin mark and bold red slash",
    priceSek: 390,
    priceEur: 35,
    badgeSv: "NYHET",
    badgeEn: "NEW",
    descSv: "Sydd i kraftig 240 GSM ekologisk bomull. En mer diskret version av Motkarta-symbolen med mörkgrått tryck och röd frontlinje.",
    descEn: "Crafted in heavy 240 GSM organic cotton. A quieter version of the Motkarta mark with dark gray print and red front slash.",
    specs: ["100% Ekologisk bomull (GOTS-certifierad)", "Fit: Relaxed unisex", "Screentryckt i Södermalm"],
    stockStatusSv: "I lager (S, M, L, XL)",
    stockStatusEn: "In stock (S, M, L, XL)",
    image: "/merch/flux-reference-image-branch (3).webp",
  },
  {
    id: "tshirt-radar-pink",
    nameSv: "Nollpunkt Radar T-Shirt (Rosa)",
    nameEn: "Nollpunkt Radar T-Shirt (Pink)",
    taglineSv: "Rosa heavyweight-tischa med radartryck, blå punkter och kartmotiv",
    taglineEn: "Pink heavyweight tee with radar print, blue points, and map-inspired artwork",
    priceSek: 390,
    priceEur: 35,
    badgeSv: "NYHET",
    badgeEn: "NEW",
    descSv: "Sydd i kraftig 240 GSM ekologisk bomull. Ett mjukare färgval med tydlig upptäckarenergi: radar, platspunkter och nollpunkt i centrum.",
    descEn: "Crafted in heavy 240 GSM organic cotton. A softer colorway with discovery energy: radar lines, place points, and the zero point at center.",
    specs: ["100% Ekologisk bomull (GOTS-certifierad)", "Fit: Relaxed unisex", "Screentryckt i Södermalm"],
    stockStatusSv: "I lager (S, M, L, XL)",
    stockStatusEn: "In stock (S, M, L, XL)",
    image: "/merch/flux-reference-image-branch (7).webp",
  },
  {
    id: "tote-map",
    nameSv: "Kvarterskarta Organic Tote Bag",
    nameEn: "Neighborhood Map Organic Tote Bag",
    taglineSv: "Tygkasse i kraftig canvas med handritat gatu- och kvartersnät över Stockholm",
    taglineEn: "Heavy canvas tote featuring hand-drawn Stockholm street grid print",
    priceSek: 220,
    priceEur: 20,
    badgeSv: "FAVORIT",
    badgeEn: "FAVORITE",
    descSv: "Rymlig tygkasse i 300g oblekt ekologisk canvas. Bär din matvaruhandling eller bärbara dator med stil och noll reklam.",
    descEn: "Roomy tote in 300g unbleached organic canvas. Carry groceries or laptop with clean independent aesthetics.",
    specs: ["300 GSM Oblekt bomullscanvas", "Förstärkta axelremmar (65 cm)", "Innerficka för nycklar & kort"],
    stockStatusSv: "I lager",
    stockStatusEn: "In stock",
    image: "/merch/tote.jpg",
  },
  {
    id: "cap-white",
    nameSv: "Nollpunkt Dad Cap (Vit)",
    nameEn: "Nollpunkt Dad Cap (White)",
    taglineSv: "Vit bomullskeps med broderad Motkarta-nålsymbol och röd linje",
    taglineEn: "White cotton twill cap with embroidered Motkarta pin and red slash",
    priceSek: 320,
    priceEur: 29,
    badgeSv: "BEGRÄNSAD UPPLAGA",
    badgeEn: "LIMITED EDITION",
    descSv: "Klassisk dad cap i 100% bomullstwilling med justerbart spänne i borstad mässing. Broderad pin-logo med ren vit bas och tydlig Motkarta-markering.",
    descEn: "Classic dad cap in 100% cotton twill with antique brass buckle. Embroidered pin mark on a clean white base.",
    specs: ["100% Bomullstwilling", "Justerbar rem (54–62 cm)", "Broderad i Sverige"],
    stockStatusSv: "Fåtal kvar i lager",
    stockStatusEn: "Low stock",
    image: "/merch/flux-reference-image-branch (8).webp",
  },
  {
    id: "cap-blue-black-pin",
    nameSv: "Nollpunkt Dad Cap (Kungsblå / Svart)",
    nameEn: "Nollpunkt Dad Cap (Royal Blue / Black)",
    taglineSv: "Kungsblå bomullskeps med svart Motkarta-nål och röd linje",
    taglineEn: "Royal blue cotton twill cap with black Motkarta pin and red slash",
    priceSek: 320,
    priceEur: 29,
    badgeSv: "BEGRÄNSAD UPPLAGA",
    badgeEn: "LIMITED EDITION",
    descSv: "Klassisk dad cap i 100% bomullstwilling med justerbart spänne i borstad mässing. Djupblå färg med broderad svart pin-logo i fronten.",
    descEn: "Classic dad cap in 100% cotton twill with antique brass buckle. Deep royal blue with an embroidered black pin mark.",
    specs: ["100% Bomullstwilling", "Justerbar rem (54–62 cm)", "Broderad i Sverige"],
    stockStatusSv: "Fåtal kvar i lager",
    stockStatusEn: "Low stock",
    image: "/merch/flux-reference-image-branch (9).webp",
  },
  {
    id: "cap-blue-white-pin",
    nameSv: "Nollpunkt Dad Cap (Kungsblå / Vit)",
    nameEn: "Nollpunkt Dad Cap (Royal Blue / White)",
    taglineSv: "Kungsblå bomullskeps med vit Motkarta-nål och röd linje",
    taglineEn: "Royal blue cotton twill cap with white Motkarta pin and red slash",
    priceSek: 320,
    priceEur: 29,
    badgeSv: "BEGRÄNSAD UPPLAGA",
    badgeEn: "LIMITED EDITION",
    descSv: "Klassisk dad cap i 100% bomullstwilling med justerbart spänne i borstad mässing. Blå bas med broderad vit pin-logo för stark kontrast.",
    descEn: "Classic dad cap in 100% cotton twill with antique brass buckle. Blue base with a high-contrast embroidered white pin mark.",
    specs: ["100% Bomullstwilling", "Justerbar rem (54–62 cm)", "Broderad i Sverige"],
    stockStatusSv: "Fåtal kvar i lager",
    stockStatusEn: "Low stock",
    image: "/merch/flux-reference-image-branch (10).webp",
  },
  {
    id: "poster-map",
    nameSv: "Stockholm, Bord för Bord (Poster)",
    nameEn: "Stockholm, Table by Table (Art Poster)",
    taglineSv: "Vikbar konstposter (50×70 cm) med alla 3 190+ oberoende matställen",
    taglineEn: "Folded art poster (50×70 cm) mapping 3,190+ independent food spots",
    priceSek: 280,
    priceEur: 25,
    badgeSv: "SAMLAROBJEKT",
    badgeEn: "COLLECTOR ITEM",
    descSv: "Tryckt på 170g obestruket Munken Polar-papper. Inkluderar koordinater och stadsdelsnät för alla oberoende krogar i guiden.",
    descEn: "Printed on 170g uncoated Munken Polar archival paper. Features detailed street grid and index of independent venues.",
    specs: ["Format: 50×70 cm", "Papper: 170g Munken Polar", "Tryckt i Sverige (Svanenmärkt)"],
    stockStatusSv: "I lager",
    stockStatusEn: "In stock",
    image: "/merch/poster.jpg",
  },
  {
    id: "stickers-pack",
    nameSv: "Manifesto Vinyl Sticker Pack (3-pack)",
    nameEn: "Manifesto Vinyl Sticker Pack (3-Pack)",
    taglineSv: "Väderbeständiga vinyldekaler: 'INTE SPONSRAT', 'ÄT UTAN ALGORITMEN' & Pin-logo",
    taglineEn: "Weatherproof vinyl stickers: 'INTE SPONSRAT', 'ÄT UTAN ALGORITMEN' & Pin icon",
    priceSek: 90,
    priceEur: 8,
    badgeSv: "STREETERM",
    badgeEn: "STREET PACK",
    descSv: "Tre matta vinylklistermärken med UV-laminat som tål regn, diskmaskin och vattenflaskor. Visa ditt stöd för oberoende matkultur.",
    descEn: "Three matte vinyl stickers with UV protection suitable for laptops, water bottles, and street surfaces.",
    specs: ["3 st UV-laminerade vinyldekaler", "Vattentåliga & repfria", "Mått: 7×7 cm"],
    stockStatusSv: "I lager",
    stockStatusEn: "In stock",
    image: "/merch/stickers.jpg",
  },
];

export type MerchPanelProps = {
  lang?: Language;
  cart?: Record<string, number>;
  onAddToCart?: (itemId: string) => void;
  onOpenCart?: () => void;
};

export function MerchPanel({
  lang = "sv",
  cart = {},
  onAddToCart,
  onOpenCart,
}: MerchPanelProps) {
  const [showCartToast, setShowCartToast] = useState<string | null>(null);
  const [items, setItems] = useState<MerchItem[]>(() => readStoredMerchItems(MERCH_ITEMS));
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const { t, isCmsEditMode, setActiveToast } = useCms();

  const isSv = lang === "sv";

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<MerchItem[] | null>;
      if (customEvent.detail) {
        setItems(customEvent.detail);
      } else {
        setItems(readStoredMerchItems(MERCH_ITEMS));
      }
    };
    window.addEventListener("motkarta-merch-updated", handleUpdate);
    return () => window.removeEventListener("motkarta-merch-updated", handleUpdate);
  }, []);

  const handleAddToCart = (item: MerchItem) => {
    if (onAddToCart) {
      onAddToCart(item.id);
    }
    const name = isSv ? item.nameSv : item.nameEn;
    setShowCartToast(name);
    setTimeout(() => setShowCartToast(null), 2500);
  };

  const handleDeleteProduct = (itemId: string, name: string) => {
    const confirmed = typeof window === "undefined" || window.confirm(
      isSv
        ? `Är du säker på att du vill ta bort "${name}" från produktutbudet?`
        : `Are you sure you want to remove "${name}" from the store catalog?`
    );
    if (!confirmed) return;

    const nextItems = items.filter((item) => item.id !== itemId);
    setItems(nextItems);
    writeStoredMerchItems(nextItems);
    setActiveToast(
      isSv ? `🗑️ Produkten "${name}" har tagits bort!` : `🗑️ Product "${name}" was removed!`
    );
  };

  const handleAddProduct = (newItem: MerchItem) => {
    const nextItems = [newItem, ...items];
    setItems(nextItems);
    writeStoredMerchItems(nextItems);
    setIsAddModalOpen(false);
    setActiveToast(
      isSv
        ? `✨ Ny produkt "${isSv ? newItem.nameSv : newItem.nameEn}" har lagts till i butiken!`
        : `✨ New product "${newItem.nameEn}" added to the store!`
    );
  };

  const handleResetProducts = () => {
    const confirmed = typeof window === "undefined" || window.confirm(
      isSv
        ? "Vill du återställa produktkatalogen till standardutbudet?"
        : "Reset the product catalog to standard defaults?"
    );
    if (!confirmed) return;

    resetStoredMerchItems();
    setItems(MERCH_ITEMS);
    setActiveToast(
      isSv ? "↺ Standardprodukter har återställts!" : "↺ Default products restored!"
    );
  };

  const totalCount = Object.values(cart).reduce((sum, count) => sum + count, 0);

  const totalPriceSek = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = items.find((m) => m.id === id);
    return sum + (item ? item.priceSek * qty : 0);
  }, 0);

  return (
    <section className="merch-section" id="merch">
      <div className="merch-container">
        <div className="merch-header">
          <div className="merch-header-top">
            <div className="merch-eyebrow">
              <Sparkle size={14} weight="bold" />
              <span>{t.merchEyebrow || (isSv ? "OFFICIELL MERCH & PRINTS" : "OFFICIAL MERCH & PRINTS")}</span>
              <CmsEditFlag cmsKey="merchEyebrow" label="Merch: Ögonbryn" />
            </div>

            {/* Cart Trigger Button */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                className={`merch-cart-header-btn ${totalCount > 0 ? "has-items" : ""}`}
                onClick={() => onOpenCart?.()}
              >
                <ShoppingCart size={18} weight="bold" />
                <span>{t.merchCartBtn || (isSv ? "Varukorg" : "Cart")}</span>
                <span className="merch-cart-count-badge">{totalCount}</span>
              </button>
              <CmsEditFlag cmsKey="merchCartBtn" label="Merch: Varukorg-knapp" />
            </div>
          </div>

          <h2>
            {t.merchHeading || (isSv ? "STÖD DEN OBEROENDE MATGUIDEN" : "SUPPORT INDEPENDENT FOOD CULTURE")}
            <CmsEditFlag cmsKey="merchHeading" label="Merch: Huvudrubrik" />
          </h2>
          <p className="merch-subtitle">
            {t.merchSubtitle || (isSv
              ? "Ingen betald ranking, inga dolda sponsorer. Varje köp finansierar vår öppna databas och direkta kvalitetsauditer i Stockholm."
              : "No paid rankings, zero sponsored listings. Every purchase funds our open database and on-the-ground food audits in Stockholm.")}
            <CmsEditFlag cmsKey="merchSubtitle" label="Merch: Underrubrik" />
          </p>

          {/* CMS Admin Merch Management Toolbar */}
          {isCmsEditMode && (
            <div className="cms-merch-admin-bar">
              <div className="cms-merch-admin-badge">
                <span className="cms-badge-dot">●</span>
                <span>CMS PRODUKTHANTERING</span>
                <span className="cms-merch-count-pill">{items.length} st</span>
              </div>
              <div className="cms-merch-admin-actions">
                <button
                  type="button"
                  className="cms-add-product-btn"
                  onClick={() => setIsAddModalOpen(true)}
                  data-testid="cms-add-product-btn"
                >
                  <Plus size={15} weight="bold" />
                  <span>{isSv ? "Lägg till ny produkt" : "Add new product"}</span>
                </button>
                <button
                  type="button"
                  className="cms-reset-products-btn"
                  onClick={handleResetProducts}
                  data-testid="cms-reset-products-btn"
                  title={isSv ? "Återställ till standardprodukter" : "Reset to default products"}
                >
                  <ArrowCounterClockwise size={14} weight="bold" />
                  <span>{isSv ? "Återställ produkter" : "Reset products"}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Hero Banner Showcase */}
        <div className="merch-hero-frame">
          <img
            src="/merch-hero.webp"
            alt="MOTKARTA Merchandise Collection"
            className="merch-hero-img"
          />
          <div className="merch-hero-overlay">
            <div className="merch-hero-badge">
              <ShieldCheck size={16} weight="bold" /> {t.merchHeroBadge || "100% INDEPENDENT & LOCAL"}
              <CmsEditFlag cmsKey="merchHeroBadge" label="Merch: Hero Badge" />
            </div>
            <h3>
              {t.merchHeroTitle || (isSv ? "Stockholm, Bord för Bord Kollektion 2026" : "Stockholm, Table by Table 2026 Collection")}
              <CmsEditFlag cmsKey="merchHeroTitle" label="Merch: Hero Rubrik" />
            </h3>
            <p>
              {t.merchHeroDesc || (isSv
                ? "T-shirts, tygkassar, kepsar och tryckta stadsdelskartor tillverkade i ekologiska premiummaterial."
                : "T-shirts, tote bags, caps, and printed city posters crafted from sustainable organic materials.")}
              <CmsEditFlag cmsKey="merchHeroDesc" label="Merch: Hero Beskrivning" />
            </p>
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="merch-grid">
          {items.map((item) => {
            const itemTitleKey = `merchItem_${item.id.replace(/-/g, "_")}_title` as keyof typeof t;
            const itemTaglineKey = `merchItem_${item.id.replace(/-/g, "_")}_tagline` as keyof typeof t;
            const name = (t[itemTitleKey] as string) || (isSv ? item.nameSv : item.nameEn);
            const tagline = (t[itemTaglineKey] as string) || (isSv ? item.taglineSv : item.taglineEn);
            const badge = isSv ? item.badgeSv : item.badgeEn;
            const desc = isSv ? item.descSv : item.descEn;
            const stock = isSv ? item.stockStatusSv : item.stockStatusEn;
            const inCart = cart[item.id] || 0;

            return (
              <article key={item.id} className="merch-card" data-testid={`merch-card-${item.id}`}>
                {/* Product Image Placeholder Box */}
                <div className="merch-card-image-wrap">
                  <img src={item.image} alt={name} className="merch-card-img" />
                  <span className="merch-card-badge">{badge}</span>
                  <span className="merch-image-placeholder-label">OFFICIAL PRODUCT</span>
                </div>

                <div className="merch-card-top">
                  <span className="merch-card-price">
                    {item.priceSek} SEK <small>({item.priceEur} €)</small>
                  </span>
                  {isCmsEditMode && (
                    <button
                      type="button"
                      className="cms-product-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProduct(item.id, name);
                      }}
                      data-testid={`cms-delete-product-${item.id}`}
                      title={isSv ? `Ta bort "${name}"` : `Remove "${name}"`}
                      aria-label={isSv ? `Ta bort ${name}` : `Remove ${name}`}
                    >
                      <Trash size={13} weight="bold" />
                      <span>{isSv ? "Ta bort" : "Remove"}</span>
                    </button>
                  )}
                </div>

                <h4 className="merch-card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                  <span>{name}</span>
                  <CmsEditFlag cmsKey={itemTitleKey} label={`Produkt: ${item.nameSv} (Rubrik)`} />
                </h4>
                <p className="merch-card-tagline" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" }}>
                  <span>{tagline}</span>
                  <CmsEditFlag cmsKey={itemTaglineKey} label={`Produkt: ${item.nameSv} (Tagline)`} />
                </p>
                <p className="merch-card-desc">{desc}</p>

                <ul className="merch-card-specs">
                  {item.specs.map((spec, idx) => (
                    <li key={idx}>
                      <Check size={12} weight="bold" style={{ color: "var(--color-water)" }} />
                      <span>{spec}</span>
                    </li>
                  ))}
                </ul>

                <div className="merch-card-footer">
                  <span className="merch-stock-tag">● {stock}</span>
                  <button
                    type="button"
                    className={`merch-buy-btn ${inCart > 0 ? "added" : ""}`}
                    onClick={() => handleAddToCart(item)}
                  >
                    {inCart > 0 ? (
                      <>
                        <Check size={14} weight="bold" />
                        <span>
                          {t.merchAdded || (isSv ? "Tillagd" : "Added")} ({inCart})
                        </span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag size={14} weight="bold" />
                        <span>{t.merchAddToCart || (isSv ? "Lägg i varukorg" : "Add to cart")}</span>
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}

          {/* Add Product Card Placeholder when in CMS Edit Mode */}
          {isCmsEditMode && (
            <div
              className="merch-card merch-card-add-placeholder"
              onClick={() => setIsAddModalOpen(true)}
              data-testid="cms-add-product-card-placeholder"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setIsAddModalOpen(true);
                }
              }}
            >
              <div className="merch-add-placeholder-icon">
                <Plus size={36} weight="bold" />
              </div>
              <h4>{isSv ? "+ Lägg till ny produkt" : "+ Add new product"}</h4>
              <p>
                {isSv
                  ? "Skapa ett nytt produktkort i butiken med bild, priser och tvåspråkig text (SV / EN)."
                  : "Create a new product card in the store with image, prices, and dual-language copy."}
              </p>
            </div>
          )}
        </div>

        {/* Cart Bottom Summary Bar */}
        {totalCount > 0 ? (
          <div className="merch-checkout-bar" onClick={() => onOpenCart?.()}>
            <div className="checkout-summary">
              <ShoppingBag size={20} weight="fill" style={{ color: "var(--color-paper)" }} />
              <div>
                <b>
                  {totalCount} {t.merchSummaryItems || (isSv ? "artiklar i din varukorg" : "items in your order")} ({totalPriceSek} SEK)
                </b>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span>
                    {t.merchShippingFree || (isSv
                      ? "Fri frakt inom Sverige vid köp över 500 kr"
                      : "Free shipping in Sweden on orders over 500 SEK")}
                  </span>
                  <CmsEditFlag cmsKey="merchShippingFree" label="Merch: Fri frakt text" />
                </span>
              </div>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                className="checkout-proceed-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCart?.();
                }}
              >
                <span>{t.merchViewCart || (isSv ? "Visa varukorg" : "View Cart")}</span>
                <ArrowRight size={16} weight="bold" />
              </button>
              <CmsEditFlag cmsKey="merchViewCart" label="Merch: Visa varukorg knapp" />
            </div>
          </div>
        ) : null}

        {/* Cart Toast Notification */}
        {showCartToast ? (
          <div className="merch-toast" onClick={() => onOpenCart?.()}>
            <Check size={16} weight="bold" style={{ color: "#10B981" }} />
            <span>
              <strong>{showCartToast}</strong> {isSv ? "har lagts till i varukorgen!" : "added to cart!"}
            </span>
          </div>
        ) : null}
      </div>

      {/* Add Product Modal */}
      {isAddModalOpen && (
        <CmsAddProductModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAdd={handleAddProduct}
          lang={lang}
        />
      )}
    </section>
  );
}

function CmsAddProductModal({
  isOpen,
  onClose,
  onAdd,
  lang,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (item: MerchItem) => void;
  lang: Language;
}) {
  if (!isOpen) return null;

  const isSv = lang === "sv";

  const [nameSv, setNameSv] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [taglineSv, setTaglineSv] = useState("");
  const [taglineEn, setTaglineEn] = useState("");
  const [priceSek, setPriceSek] = useState("390");
  const [priceEur, setPriceEur] = useState("35");
  const [badgeSv, setBadgeSv] = useState("NYHET");
  const [badgeEn, setBadgeEn] = useState("NEW");
  const [descSv, setDescSv] = useState("");
  const [descEn, setDescEn] = useState("");
  const [specsText, setSpecsText] = useState(
    "100% Ekologisk bomull (GOTS)\nFit: Relaxed unisex\nScreentryckt i Södermalm"
  );
  const [stockStatusSv, setStockStatusSv] = useState("I lager (S, M, L, XL)");
  const [stockStatusEn, setStockStatusEn] = useState("In stock (S, M, L, XL)");
  const [selectedImage, setSelectedImage] = useState("/merch/tshirt.jpg");
  const [customImageUrl, setCustomImageUrl] = useState("");

  const PRESET_IMAGES = [
    { label: "T-Shirt Svart", url: "/merch/tshirt.jpg" },
    { label: "T-Shirt Pin Vit", url: "/merch/flux-reference-image-branch.webp" },
    { label: "T-Shirt Grid", url: "/merch/flux-reference-image-branch (1).webp" },
    { label: "T-Shirt Nollpunkt", url: "/merch/flux-reference-image-branch (2).webp" },
    { label: "T-Shirt Pin Skugga", url: "/merch/flux-reference-image-branch (3).webp" },
    { label: "T-Shirt Radar Rosa", url: "/merch/flux-reference-image-branch (7).webp" },
    { label: "Tygkasse Karta", url: "/merch/tote.jpg" },
    { label: "Dad Cap Vit", url: "/merch/flux-reference-image-branch (8).webp" },
    { label: "Dad Cap Blå/Svart", url: "/merch/flux-reference-image-branch (9).webp" },
    { label: "Dad Cap Blå/Vit", url: "/merch/flux-reference-image-branch (10).webp" },
    { label: "Konstposter", url: "/merch/poster.jpg" },
    { label: "Stickers 3-pack", url: "/merch/stickers.jpg" },
  ];

  const activeImage = customImageUrl.trim() || selectedImage;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalNameSv = nameSv.trim() || (isSv ? "Ny Motkarta Produkt" : "New Motkarta Product");
    const finalNameEn = nameEn.trim() || finalNameSv;

    const slug = (finalNameEn || finalNameSv)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const id = `${slug || "product"}-${Date.now().toString(36)}`;

    const specs = specsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const parsedPriceSek = parseInt(priceSek, 10) || 390;
    const parsedPriceEur = parseInt(priceEur, 10) || Math.round(parsedPriceSek / 11);

    const newItem: MerchItem = {
      id,
      nameSv: finalNameSv,
      nameEn: finalNameEn,
      taglineSv: taglineSv.trim() || finalNameSv,
      taglineEn: taglineEn.trim() || finalNameEn,
      priceSek: parsedPriceSek,
      priceEur: parsedPriceEur,
      badgeSv: badgeSv.trim() || "NYHET",
      badgeEn: badgeEn.trim() || "NEW",
      descSv: descSv.trim() || "Tillverkad i hållbara ekologiska material i Stockholm.",
      descEn: descEn.trim() || "Crafted with sustainable organic materials in Stockholm.",
      specs: specs.length ? specs : ["100% Ekologisk bomull", "Tillverkad i Stockholm"],
      stockStatusSv: stockStatusSv.trim() || "I lager",
      stockStatusEn: stockStatusEn.trim() || "In stock",
      image: activeImage,
    };

    onAdd(newItem);
  };

  return (
    <div className="cms-modal-overlay" onClick={onClose}>
      <div
        className="cms-modal-card cms-product-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cms-add-product-title"
      >
        <div className="cms-modal-header">
          <div className="cms-modal-title-group">
            <span className="cms-modal-badge">🛍️ CMS PRODUKTHANTERING</span>
            <h3 id="cms-add-product-title">
              {isSv ? "Lägg till ny produkt i butiken" : "Add new merch product"}
            </h3>
          </div>
          <button
            type="button"
            className="icon-btn cms-close-btn"
            onClick={onClose}
            aria-label={isSv ? "Stäng" : "Close"}
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="cms-product-form">
          <div className="cms-product-form-body">
            {/* Image Preview & Selection */}
            <div className="cms-product-image-picker">
              <label className="cms-field-label">
                {isSv ? "Produktbild & Förhandsvisning" : "Product Image & Preview"}
              </label>
              <div className="cms-image-preview-box">
                <img src={activeImage} alt="Förhandsvisning" className="cms-image-preview-thumb" />
                <div className="cms-image-preview-details">
                  <span className="cms-preview-badge">{badgeSv || "NYHET"}</span>
                  <strong>{nameSv || (isSv ? "Produktnamn" : "Product Name")}</strong>
                  <span>{priceSek} SEK ({priceEur} €)</span>
                </div>
              </div>

              <div className="cms-image-presets-grid">
                {PRESET_IMAGES.map((preset) => (
                  <button
                    key={preset.url}
                    type="button"
                    className={`cms-image-preset-btn ${selectedImage === preset.url && !customImageUrl ? "active" : ""}`}
                    onClick={() => {
                      setSelectedImage(preset.url);
                      setCustomImageUrl("");
                    }}
                    title={preset.label}
                  >
                    <img src={preset.url} alt={preset.label} />
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>

              <div className="cms-form-group" style={{ marginTop: "8px" }}>
                <label className="cms-sub-label">
                  {isSv ? "Eller ange egen bild-URL / data-URL:" : "Or provide custom image URL:"}
                </label>
                <input
                  type="text"
                  className="cms-input"
                  placeholder="https://... eller /merch/..."
                  value={customImageUrl}
                  onChange={(e) => setCustomImageUrl(e.target.value)}
                  data-testid="cms-input-product-image"
                />
              </div>
            </div>

            {/* Form Fields: Two Columns (SV & EN) */}
            <div className="cms-dual-col-grid">
              {/* Svenska */}
              <div className="cms-lang-column">
                <div className="cms-lang-column-header">
                  <span className="cms-lang-flag">🇸🇪</span>
                  <h4>Svenska</h4>
                </div>

                <div className="cms-form-group">
                  <label className="cms-field-label">Produktnamn (SV) *</label>
                  <input
                    type="text"
                    required
                    className="cms-input"
                    placeholder="t.ex. MOTKARTA Zip Hoodie"
                    value={nameSv}
                    onChange={(e) => setNameSv(e.target.value)}
                    data-testid="cms-input-product-name-sv"
                  />
                </div>

                <div className="cms-form-group">
                  <label className="cms-field-label">Tagline (SV)</label>
                  <input
                    type="text"
                    className="cms-input"
                    placeholder="Kort sammanfattning under titeln"
                    value={taglineSv}
                    onChange={(e) => setTaglineSv(e.target.value)}
                    data-testid="cms-input-product-tagline-sv"
                  />
                </div>

                <div className="cms-form-group">
                  <label className="cms-field-label">Beskrivning (SV)</label>
                  <textarea
                    rows={3}
                    className="cms-textarea"
                    placeholder="Detaljerad produktbeskrivning och material..."
                    value={descSv}
                    onChange={(e) => setDescSv(e.target.value)}
                    data-testid="cms-input-product-desc-sv"
                  />
                </div>

                <div className="cms-form-row">
                  <div className="cms-form-group" style={{ flex: 1 }}>
                    <label className="cms-field-label">Badge (SV)</label>
                    <input
                      type="text"
                      className="cms-input"
                      value={badgeSv}
                      onChange={(e) => setBadgeSv(e.target.value)}
                      placeholder="NYHET"
                      data-testid="cms-input-product-badge-sv"
                    />
                  </div>
                  <div className="cms-form-group" style={{ flex: 1.5 }}>
                    <label className="cms-field-label">Lagerstatus (SV)</label>
                    <input
                      type="text"
                      className="cms-input"
                      value={stockStatusSv}
                      onChange={(e) => setStockStatusSv(e.target.value)}
                      placeholder="I lager (S, M, L)"
                      data-testid="cms-input-product-stock-sv"
                    />
                  </div>
                </div>
              </div>

              {/* Engelska */}
              <div className="cms-lang-column">
                <div className="cms-lang-column-header">
                  <span className="cms-lang-flag">🇬🇧</span>
                  <h4>English</h4>
                </div>

                <div className="cms-form-group">
                  <label className="cms-field-label">Product Name (EN) *</label>
                  <input
                    type="text"
                    required
                    className="cms-input"
                    placeholder="e.g. MOTKARTA Zip Hoodie"
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    data-testid="cms-input-product-name-en"
                  />
                </div>

                <div className="cms-form-group">
                  <label className="cms-field-label">Tagline (EN)</label>
                  <input
                    type="text"
                    className="cms-input"
                    placeholder="Short summary under title"
                    value={taglineEn}
                    onChange={(e) => setTaglineEn(e.target.value)}
                    data-testid="cms-input-product-tagline-en"
                  />
                </div>

                <div className="cms-form-group">
                  <label className="cms-field-label">Description (EN)</label>
                  <textarea
                    rows={3}
                    className="cms-textarea"
                    placeholder="Detailed description and materials..."
                    value={descEn}
                    onChange={(e) => setDescEn(e.target.value)}
                    data-testid="cms-input-product-desc-en"
                  />
                </div>

                <div className="cms-form-row">
                  <div className="cms-form-group" style={{ flex: 1 }}>
                    <label className="cms-field-label">Badge (EN)</label>
                    <input
                      type="text"
                      className="cms-input"
                      value={badgeEn}
                      onChange={(e) => setBadgeEn(e.target.value)}
                      placeholder="NEW"
                      data-testid="cms-input-product-badge-en"
                    />
                  </div>
                  <div className="cms-form-group" style={{ flex: 1.5 }}>
                    <label className="cms-field-label">Stock Status (EN)</label>
                    <input
                      type="text"
                      className="cms-input"
                      value={stockStatusEn}
                      onChange={(e) => setStockStatusEn(e.target.value)}
                      placeholder="In stock (S, M, L)"
                      data-testid="cms-input-product-stock-en"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Price & Specs row */}
            <div className="cms-product-extra-row">
              <div className="cms-form-group" style={{ flex: 1 }}>
                <label className="cms-field-label">{isSv ? "Pris SEK *" : "Price SEK *"}</label>
                <input
                  type="number"
                  required
                  min={1}
                  className="cms-input"
                  value={priceSek}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPriceSek(val);
                    const num = parseInt(val, 10);
                    if (!isNaN(num)) {
                      setPriceEur(String(Math.round(num / 11)));
                    }
                  }}
                  data-testid="cms-input-product-price-sek"
                />
              </div>

              <div className="cms-form-group" style={{ flex: 1 }}>
                <label className="cms-field-label">{isSv ? "Pris EUR (€)" : "Price EUR (€)"}</label>
                <input
                  type="number"
                  min={1}
                  className="cms-input"
                  value={priceEur}
                  onChange={(e) => setPriceEur(e.target.value)}
                  data-testid="cms-input-product-price-eur"
                />
              </div>

              <div className="cms-form-group" style={{ flex: 2 }}>
                <label className="cms-field-label">
                  {isSv ? "Specifikationer (en per rad)" : "Specifications (one per line)"}
                </label>
                <textarea
                  rows={2}
                  className="cms-textarea"
                  value={specsText}
                  onChange={(e) => setSpecsText(e.target.value)}
                  placeholder="100% Ekologisk bomull&#10;Fit: Relaxed unisex"
                  data-testid="cms-input-product-specs"
                />
              </div>
            </div>
          </div>

          <div className="cms-modal-footer">
            <button
              type="button"
              className="cms-btn-secondary"
              onClick={onClose}
              data-testid="cms-add-product-cancel-btn"
            >
              {isSv ? "Avbryt" : "Cancel"}
            </button>
            <button
              type="submit"
              className="cms-btn-primary"
              data-testid="cms-add-product-submit-btn"
            >
              <Check size={16} weight="bold" />
              <span>{isSv ? "Publicera produkt" : "Publish product"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
