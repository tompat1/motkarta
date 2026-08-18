import { useState } from "react";
import { ShoppingBag, Check, Sparkle, ArrowRight, ShieldCheck, Heart } from "@phosphor-icons/react";

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
  },
  {
    id: "cap-blue",
    nameSv: "Nollpunkt Dad Cap (Kungsblå)",
    nameEn: "Nollpunkt Dad Cap (Royal Blue)",
    taglineSv: "Strukturerad bomullskeps med broderad Motkarta-nålsymbol",
    taglineEn: "Structured cotton twill cap featuring embroidered Motkarta Pin icon",
    priceSek: 320,
    priceEur: 29,
    badgeSv: "BEGRÄNSAD UPPLAGA",
    badgeEn: "LIMITED EDITION",
    descSv: "Klassisk dad cap i 100% bomullstwilling med justerbart spänne i borstad mässing. Broderad pin-logo i kontrastvit tråd.",
    descEn: "Classic dad cap in 100% cotton twill with antique brass buckle. Detailed white embroidered pin emblem.",
    specs: ["100% Bomullstwilling", "Justerbar rem (54–62 cm)", "Broderad i Sverige"],
    stockStatusSv: "Fåtal kvar i lager",
    stockStatusEn: "Low stock",
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
  },
];

export function MerchPanel({ lang = "sv" }: { lang?: Language }) {
  const [selectedItem, setSelectedItem] = useState<MerchItem | null>(null);
  const [addedItems, setAddedItems] = useState<Record<string, number>>({});
  const [showCartToast, setShowCartToast] = useState<string | null>(null);

  const isSv = lang === "sv";

  const handleAddToCart = (item: MerchItem) => {
    setAddedItems((prev) => ({
      ...prev,
      [item.id]: (prev[item.id] || 0) + 1,
    }));

    const name = isSv ? item.nameSv : item.nameEn;
    setShowCartToast(name);
    setTimeout(() => setShowCartToast(null), 2500);
  };

  const totalCount = Object.values(addedItems).reduce((sum, count) => sum + count, 0);

  return (
    <section className="merch-section" id="merch">
      <div className="merch-container">
        <div className="merch-header">
          <div className="merch-eyebrow">
            <Sparkle size={14} weight="bold" />
            <span>{isSv ? "OFFICIELL MERCH & PRINTS" : "OFFICIAL MERCH & PRINTS"}</span>
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
            const inCart = addedItems[item.id] || 0;

            return (
              <article key={item.id} className="merch-card">
                <div className="merch-card-top">
                  <span className="merch-card-badge">{badge}</span>
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
                        <span>{isSv ? "Köp nu" : "Order now"}</span>
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {/* Cart / Order Summary Bar */}
        {totalCount > 0 ? (
          <div className="merch-checkout-bar">
            <div className="checkout-summary">
              <ShoppingBag size={20} weight="fill" style={{ color: "var(--color-paper)" }} />
              <div>
                <b>
                  {totalCount} {isSv ? "artiklar i din varukorg" : "items in your order"}
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
              onClick={() =>
                alert(
                  isSv
                    ? `Tack för ditt stöd! Din order på ${totalCount} artiklar behandlas nu. För förhandsbeställningar och direkt hämtning i Vasastan/Södermalm, kontakta merch@motkarta.se.`
                    : `Thank you for supporting independent food guide! Your order of ${totalCount} items is ready. Contact merch@motkarta.se for pre-orders and local pickup.`,
                )
              }
            >
              <span>{isSv ? "Gå till kassan" : "Proceed to checkout"}</span>
              <ArrowRight size={16} weight="bold" />
            </button>
          </div>
        ) : null}

        {/* Cart Toast Notification */}
        {showCartToast ? (
          <div className="merch-toast">
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
