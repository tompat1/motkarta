import React from "react";
import { Compass, MapTrifold, BookmarkSimple } from "@phosphor-icons/react";
import type { Language } from "../app/shared";

export type MobileTab = "discover" | "map" | "saved";

interface MobileAppToolbarProps {
  activeTab: MobileTab;
  onSelectTab: (tab: MobileTab) => void;
  savedCount?: number;
  lang: Language;
}

export function MobileAppToolbar({
  activeTab,
  onSelectTab,
  savedCount = 0,
  lang,
}: MobileAppToolbarProps) {
  const tabs: Array<{ id: MobileTab; label: string; icon: React.ReactNode }> = [
    {
      id: "discover",
      label: lang === "sv" ? "Upptäck" : "Discover",
      icon: <Compass size={24} weight={activeTab === "discover" ? "fill" : "regular"} />,
    },
    {
      id: "map",
      label: lang === "sv" ? "Kartan" : "Map",
      icon: <MapTrifold size={24} weight={activeTab === "map" ? "fill" : "regular"} />,
    },
    {
      id: "saved",
      label: lang === "sv" ? "Sparade" : "Saved",
      icon: <BookmarkSimple size={24} weight={activeTab === "saved" ? "fill" : "regular"} />,
    },
  ];

  return (
    <nav className="mobile-app-toolbar" role="tablist" aria-label={lang === "sv" ? "Huvudnavigering" : "Main Navigation"}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`mobile-toolbar-tab ${isActive ? "is-active" : ""}`}
            data-tab={tab.id}
            onClick={() => onSelectTab(tab.id)}
          >
            <div className="mobile-toolbar-icon-wrap">
              {tab.icon}
              {tab.id === "saved" && savedCount > 0 ? (
                <span className="mobile-toolbar-badge">{savedCount}</span>
              ) : null}
            </div>
            <span className="mobile-toolbar-label">{tab.label}</span>
            {isActive ? <div className="mobile-toolbar-active-indicator" /> : null}
          </button>
        );
      })}
    </nav>
  );
}
