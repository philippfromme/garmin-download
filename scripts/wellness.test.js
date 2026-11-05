import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { downloadWellness, WELLNESS_DATASETS, wellnessDates } from "./wellness.js";

test("recent wellness dates follow the configured calendar zone across DST", () => {
  assert.deepEqual(wellnessDates({
    days: 3,
    now: new Date("2026-03-29T22:30:00Z"),
    timeZone: "Europe/Berlin",
  }), ["2026-03-28", "2026-03-29", "2026-03-30"]);
});

test("historical range validates dates and includes both endpoints", () => {
  assert.deepEqual(wellnessDates({ from: "2026-02-27", to: "2026-03-01" }),
    ["2026-02-27", "2026-02-28", "2026-03-01"]);
  assert.throws(() => wellnessDates({ from: "2026-02-30" }), /real YYYY-MM-DD/);
  assert.throws(() => wellnessDates({ from: "2026-10-02", to: "2026-10-01" }), /after/);
});

test("saves a complete Personal API day, backs up a legacy day, and leaves it intact on failure", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garmin-wellness-"));
  const date = "2026-10-12";
  const file = path.join(dir, `${date}.json`);
  const legacy = JSON.stringify({ date, summary: { totalSteps: 42 } });
  fs.writeFileSync(file, legacy);
  try {
    const calls = [];
    const client = { getJson: async (route) => { calls.push(route); return { ok: true }; } };
    const options = { dates: [date], client, outputDir: dir };
    assert.deepEqual(await downloadWellness(options), { downloaded: 1, skipped: 0 });
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(saved.schemaVersion, 2);
    assert.deepEqual(Object.keys(saved).slice(2), WELLNESS_DATASETS.map(([name]) => name));
    assert.deepEqual(saved.sleep, { dailySleepDTO: { ok: true } });
    assert.equal(calls.length, WELLNESS_DATASETS.length);
    assert.equal(fs.readFileSync(path.join(dir, `${date}.legacy.json`), "utf8"), legacy);

    assert.deepEqual(await downloadWellness({ ...options, refresh: false }), { downloaded: 0, skipped: 1 });
    const before = fs.readFileSync(file, "utf8");
    await assert.rejects(downloadWellness({ ...options, client: { getJson: async (route) => {
      if (route.includes("dailySleep")) throw new Error("Garmin unavailable");
      return { changed: true };
    } } }), /Garmin unavailable/);
    assert.equal(fs.readFileSync(file, "utf8"), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
