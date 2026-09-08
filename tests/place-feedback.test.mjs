import test from "node:test";
import assert from "node:assert/strict";
import { placeFacts } from "../lib/concierge/facts.ts";

test("placeFacts includes base facts for RAG document context", () => {
  const samplePlace = {
    id: 116240012,
    name: "Soldaten Svejk",
    kind: "Restaurant",
    area: "Södermalm",
    address: "Östgötagatan 12, 116 24 Stockholm",
    cuisine: "pub",
    openingHours: "Mo-Th 16:00-23:00; Fr-Sa 15:00-00:00; Su 16:00-23:00",
    priceSEK: "160–350",
    tags: ["Czech", "Pub", "Södermalm", "Spotted by Locals", "Hidden Gem"],
  };

  const res = placeFacts(samplePlace);
  assert.equal(res.id, 116240012);
  assert.ok(res.document.includes("name: Soldaten Svejk"));
  assert.ok(res.document.includes("area: Södermalm"));
  assert.ok(res.document.includes("cuisine: pub"));
});

test("placeFacts dynamically incorporates user RAG feedback when window.localStorage exists", () => {
  const samplePlace = {
    id: 329797914,
    name: "Solkant",
    kind: "Specialty coffee",
    area: "Vasastan",
    address: "Hälsingegatan 2, Stockholm",
    cuisine: "bakery",
  };

  // Mock global window & localStorage
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => {
        if (key === "motkarta_rag_learning_feedback") {
          return JSON.stringify([
            {
              targetId: 329797914,
              targetName: "Solkant",
              isPositive: true,
              selectedReasons: ["Genuint & fantastisk mat/kaffe", "Exakt rätt område"],
              comment: "Fantastiska surdegsbullar!",
              timestampMs: Date.now(),
            },
          ]);
        }
        return null;
      },
    },
  };

  try {
    const res = placeFacts(samplePlace);
    assert.ok(res.document.includes("user_feedback"));
    assert.ok(res.document.includes("Fantastiska surdegsbullar!"));
    assert.ok(res.facts.some((f) => f.source === "Community Fast Feedback Loop"));
  } finally {
    globalThis.window = originalWindow;
  }
});
