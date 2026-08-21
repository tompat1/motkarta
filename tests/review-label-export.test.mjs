import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("review label export converts latest admin events into labels and duplicate resolutions", async () => {
  const source = join(tmpdir(), `motkarta-review-events-${process.pid}.json`);
  const target = join(tmpdir(), `motkarta-review-labels-${process.pid}.json`);

  await writeFile(
    source,
    JSON.stringify({
      results: [
        {
          event_id: 3,
          establishment_id: 10,
          name: "Quiet Counter",
          candidate_source_type: "municipal_unmatched",
          candidate_source_id: "source-10",
          duplicate_resolution: null,
          merged_into_establishment_id: null,
          lifecycle_state: "verified",
          validation_label: "known_hidden_gem",
          validation_notes: "Two independent signals and field check.",
          action: "promote",
          target_establishment_id: null,
          reviewed_at: "2026-08-21T10:00:00Z",
        },
        {
          event_id: 4,
          establishment_id: 11,
          name: "Duplicate Counter",
          candidate_source_type: "google_metadata",
          candidate_source_id: "google-11",
          duplicate_resolution: "merged",
          merged_into_establishment_id: 10,
          lifecycle_state: "candidate",
          validation_label: null,
          validation_notes: "Merged into canonical row.",
          action: "merge_duplicate",
          target_establishment_id: 10,
          reviewed_at: "2026-08-21T10:03:00Z",
        },
      ],
    }),
    "utf8",
  );

  await execFileAsync("node", ["scripts/export_review_labels.mjs", source, target]);
  const payload = JSON.parse(await readFile(target, "utf8"));

  assert.equal(payload.labels.length, 1);
  assert.equal(payload.labels[0].label, "known_hidden_gem");
  assert.equal(payload.labels[0].sourceType, "municipal_unmatched");
  assert.equal(payload.duplicateResolutions.length, 1);
  assert.equal(payload.duplicateResolutions[0].duplicateResolution, "merged");
  assert.equal(payload.duplicateResolutions[0].targetEstablishmentId, 10);
});
