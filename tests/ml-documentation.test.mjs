import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredDocuments = [
  "AGENTS.md",
  ".agents/AGENTS.md",
  "directives/ml_recommendation_system.md",
  "docs/ml/README.md",
  "docs/ml/architecture.md",
  "docs/ml/data-contracts.md",
  "docs/ml/training-and-evaluation.md",
  "docs/ml/operations-runbook.md",
  "docs/ml/maintenance-and-change-policy.md",
  "docs/discovery-model-card.md",
];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("the complete ML documentation set remains available", async () => {
  const documents = await Promise.all(requiredDocuments.map(read));

  for (const [index, contents] of documents.entries()) {
    assert.ok(
      contents.trim().length > 200,
      `${requiredDocuments[index]} should contain substantive guidance`,
    );
  }
});

test("agents are routed to the mandatory ML directive and canonical docs", async () => {
  const [entryPoint, agentInstructions, directive, index] = await Promise.all([
    read("AGENTS.md"),
    read(".agents/AGENTS.md"),
    read("directives/ml_recommendation_system.md"),
    read("docs/ml/README.md"),
  ]);

  assert.match(
    entryPoint,
    /Before doing any work in this repository, read and follow\s+\[`\.agents\/AGENTS\.md`\]\(\.agents\/AGENTS\.md\)\./,
  );
  assert.match(
    entryPoint,
    /1\. Read \[`directives\/ml_recommendation_system\.md`\]\(directives\/ml_recommendation_system\.md\)\./,
  );
  assert.match(
    entryPoint,
    /2\. Follow the canonical documentation beginning at\s+\[`docs\/ml\/README\.md`\]\(docs\/ml\/README\.md\)\./,
  );
  assert.match(agentInstructions, /directives\/ml_recommendation_system\.md/);
  assert.match(agentInstructions, /docs\/ml\/README\.md/);

  const requiredSafetyRules = [
    "Platform data stays quarantined",
    "Residual does not mean quality",
    "Anomaly does not mean hidden gem",
    "No self-referential satisfaction metric",
    "No behavioral learning without impressions and positions",
    "No prediction without model version",
  ];

  for (const rule of requiredSafetyRules) {
    assert.ok(directive.includes(rule), `directive should preserve: ${rule}`);
  }

  const catalogLinks = [
    "architecture.md",
    "data-contracts.md",
    "training-and-evaluation.md",
    "operations-runbook.md",
    "maintenance-and-change-policy.md",
    "../discovery-model-card.md",
  ];

  for (const link of catalogLinks) {
    assert.ok(index.includes(link), `ML index should link to ${link}`);
  }
});
