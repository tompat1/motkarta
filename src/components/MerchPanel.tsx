import { useState } from "react";
import { ShoppingBag, Check, Sparkle, ArrowRight, ShieldCheck, ShoppingCart, Plus, Minus, Trash, X } from "@phosphor-icons/react";

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

  const isSv = lang === "sv";

  const handleAddToCart = (item: MerchItem) => {
    if (onAddToCart) {
      onAddToCart(item.id);
    }
    const name = isSv ? item.nameSv : item.nameEn;
    setShowCartToast(name);
    setTimeout(() => setShowCartToast(null), 2500);
  };

  const totalCount = Object.values(cart).reduce((sum, count) => sum + count, 0);

  const totalPriceSek = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = MERCH_ITEMS.find((m) => m.id === id);
    return sum + (item ? item.priceSek * qty : 0);
  }, 0);

  return (
    <section className="merch-section" id="merch">
      <div className="merch-container">
        <div className="merch-header">
          <div className="merch-header-top">
            <div className="merch-eyebrow">
              <Sparkle size={14} weight="bold" />
              <span>{isSv ? "OFFICIELL MERCH & PRINTS" : "OFFICIAL MERCH & PRINTS"}</span>
            </div>

            {/* Cart Trigger Button */}
            <button
              type="button"
              className={`merch-cart-header-btn ${totalCount > 0 ? "has-items" : ""}`}
              onClick={() => onOpenCart?.()}
            >
              <ShoppingCart size={18} weight="bold" />
              <span>{isSv ? "Varukorg" : "Cart"}</span>
              <span className="merch-cart-count-badge">{totalCount}</span>
            </button>
          </div>

          <h2>
            {isSv ? "STÖD DEN OBEROENDE MATGUIDEN" : "SUPPORT INDEPENDENT FOOD CULTURE"}
          </h2>
          <p className="merch-subtitle">
            {isSv
              ? "Ingen betald ranking, inga dolda sponsorer. Varje köp finansierar vår öppna databas och direkta kvalitetsauditer i Stockholm."
              : "No paid rankings, zero sponsored listings. Every purchase funds our open database and on-the-ground food audits in Stockholm."}
          </p>
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
              <ShieldCheck size={16} weight="bold" /> 100% INDEPENDENT & LOCAL
            </div>
            <h3>{isSv ? "Stockholm, Bord för Bord Kollektion 2026" : "Stockholm, Table by Table 2026 Collection"}</h3>
            <p>
              {isSv
                ? "T-shirts, tygkassar, kepsar och tryckta stadsdelskartor tillverkade i ekologiska premiummaterial."
                : "T-shirts, tote bags, caps, and printed city posters crafted from sustainable organic materials."}
            </p>
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="merch-grid">
          {MERCH_ITEMS.map((item) => {
            const name = isSv ? item.nameSv : item.nameEn;
            const tagline = isSv ? item.taglineSv : item.taglineEn;
            const badge = isSv ? item.badgeSv : item.badgeEn;
            const desc = isSv ? item.descSv : item.descEn;
            const stock = isSv ? item.stockStatusSv : item.stockStatusEn;
            const inCart = cart[item.id] || 0;

            return (
              <article key={item.id} className="merch-card">
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
                </div>

                <h4 className="merch-card-title">{name}</h4>
                <p className="merch-card-tagline">{tagline}</p>
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
                          {isSv ? "Tillagd" : "Added"} ({inCart})
                        </span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag size={14} weight="bold" />
                        <span>{isSv ? "Lägg i varukorg" : "Add to cart"}</span>
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {/* Cart Bottom Summary Bar */}
        {totalCount > 0 ? (
          <div className="merch-checkout-bar" onClick={() => onOpenCart?.()}>
            <div className="checkout-summary">
              <ShoppingBag size={20} weight="fill" style={{ color: "var(--color-paper)" }} />
              <div>
                <b>
                  {totalCount} {isSv ? "artiklar i din varukorg" : "items in your order"} ({totalPriceSek} SEK)
                </b>
                <span>
                  {isSv
                    ? "Fri frakt inom Sverige vid köp över 500 kr"
                    : "Free shipping in Sweden on orders over 500 SEK"}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="checkout-proceed-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpenCart?.();
              }}
            >
              <span>{isSv ? "Visa varukorg" : "View Cart"}</span>
              <ArrowRight size={16} weight="bold" />
            </button>
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
    </section>
  );
}
