import React, { useEffect, useState } from "react";
import { ShoppingBag, ShoppingCart, Plus, Minus, Trash, X, ArrowRight } from "@phosphor-icons/react";
import { MERCH_ITEMS, type Language, type MerchItem } from "./MerchPanel";
import { useCms, CmsEditFlag, readStoredMerchItems } from "../app/cms";

export type CartDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  cart: Record<string, number>;
  onUpdateQuantity: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
  lang?: Language;
  items?: MerchItem[];
};

export function CartDrawer({
  isOpen,
  onClose,
  cart,
  onUpdateQuantity,
  onRemoveItem,
  lang = "sv",
  items,
}: CartDrawerProps) {
  if (!isOpen) return null;

  const { t } = useCms();
  const isSv = lang === "sv";

  const [activeItems, setActiveItems] = useState<MerchItem[]>(() => items || readStoredMerchItems(MERCH_ITEMS));

  useEffect(() => {
    if (items) {
      setActiveItems(items);
      return;
    }
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<MerchItem[] | null>;
      if (customEvent.detail) {
        setActiveItems(customEvent.detail);
      } else {
        setActiveItems(readStoredMerchItems(MERCH_ITEMS));
      }
    };
    window.addEventListener("motkarta-merch-updated", handleUpdate);
    return () => window.removeEventListener("motkarta-merch-updated", handleUpdate);
  }, [items]);

  const totalCount = Object.values(cart).reduce((sum, count) => sum + count, 0);
  const totalPriceSek = Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = activeItems.find((m) => m.id === id);
    return sum + (item ? item.priceSek * qty : 0);
  }, 0);

  return (
    <div className="merch-drawer-overlay" onClick={onClose}>
      <aside className="merch-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="merch-drawer-header">
          <div className="merch-drawer-title" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
            <ShoppingCart size={20} weight="bold" />
            <h3>{t.merchDrawerTitle || (isSv ? "Din Varukorg" : "Your Shopping Cart")}</h3>
            <CmsEditFlag cmsKey="merchDrawerTitle" label="Varukorg: Rubrik" />
            <span className="merch-drawer-count">({totalCount})</span>
          </div>
          <button
            type="button"
            className="merch-drawer-close-btn"
            onClick={onClose}
            aria-label={isSv ? "Stäng varukorg" : "Close cart"}
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="merch-drawer-body">
          {totalCount === 0 ? (
            <div className="merch-empty-cart">
              <ShoppingBag size={48} weight="thin" style={{ color: "var(--color-stone)" }} />
              <p style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span>{t.merchDrawerEmpty || (isSv ? "Din varukorg är tom" : "Your shopping cart is empty")}</span>
                <CmsEditFlag cmsKey="merchDrawerEmpty" label="Varukorg: Tom varukorg rubrik" />
              </p>
              <small style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span>
                  {t.merchDrawerEmptyDesc || (isSv
                    ? "Utforska vår kurerade kollektion i merch-sektionen och lägg till din favorit-artikel."
                    : "Explore our collection in the merch section to add your favorite items.")}
                </span>
                <CmsEditFlag cmsKey="merchDrawerEmptyDesc" label="Varukorg: Tom varukorg beskrivning" />
              </small>
            </div>
          ) : (
            <ul className="merch-drawer-item-list">
              {Object.entries(cart).map(([id, qty]) => {
                const item = activeItems.find((m) => m.id === id);
                if (!item) return null;
                const name = isSv ? item.nameSv : item.nameEn;

                return (
                  <li key={id} className="merch-drawer-item">
                    <img src={item.image} alt={name} className="merch-drawer-item-img" />
                    <div className="merch-drawer-item-info">
                      <h5>{name}</h5>
                      <span className="merch-drawer-item-price">{item.priceSek} SEK / st</span>
                      <div className="merch-qty-controls">
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => onUpdateQuantity(id, -1)}
                          title={isSv ? "Minska" : "Decrease"}
                        >
                          <Minus size={12} weight="bold" />
                        </button>
                        <span className="qty-val">{qty}</span>
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => onUpdateQuantity(id, 1)}
                          title={isSv ? "Öka" : "Increase"}
                        >
                          <Plus size={12} weight="bold" />
                        </button>
                      </div>
                    </div>
                    <div className="merch-drawer-item-total">
                      <b>{item.priceSek * qty} SEK</b>
                      <button
                        type="button"
                        className="remove-btn"
                        onClick={() => onRemoveItem(id)}
                        title={isSv ? "Ta bort" : "Remove"}
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {totalCount > 0 ? (
          <div className="merch-drawer-footer">
            <div className="merch-subtotal-row">
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <span>{t.merchDrawerSubtotal || (isSv ? "Totalt belopp:" : "Subtotal:")}</span>
                <CmsEditFlag cmsKey="merchDrawerSubtotal" label="Varukorg: Delsumma etikett" />
              </span>
              <b>{totalPriceSek} SEK</b>
            </div>
            <p className="shipping-info">
              {totalPriceSek >= 500
                ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <span>{t.merchDrawerFreeShippingQualified || (isSv ? "✨ Fri frakt i Sverige kvalificerad!" : "✨ Free shipping in Sweden qualified!")}</span>
                    <CmsEditFlag cmsKey="merchDrawerFreeShippingQualified" label="Varukorg: Fri frakt kvalificerad" />
                  </span>
                )
                : isSv
                  ? `Handla för ${500 - totalPriceSek} kr till för fri frakt`
                  : `Add ${500 - totalPriceSek} SEK more for free shipping`}
            </p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", width: "100%" }}>
              <button
                type="button"
                className="drawer-checkout-btn"
                style={{ flex: 1 }}
                onClick={() => {
                  alert(
                    isSv
                      ? `Tack för ditt stöd! Din order på ${totalCount} artiklar (${totalPriceSek} kr) behandlas nu. För förhandsbeställningar och direkt hämtning i Vasastan/Södermalm, kontakta merch@motkarta.se.`
                      : `Thank you for supporting independent food guide! Your order of ${totalCount} items (${totalPriceSek} SEK) is ready. Contact merch@motkarta.se for pre-orders and local pickup.`,
                  );
                  onClose();
                }}
              >
                <span>{t.merchDrawerCheckout || (isSv ? "Gå till kassan" : "Proceed to checkout")}</span>
                <ArrowRight size={16} weight="bold" />
              </button>
              <CmsEditFlag cmsKey="merchDrawerCheckout" label="Varukorg: Kassa knapp" />
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
