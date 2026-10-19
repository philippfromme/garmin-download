import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { downloadWellness, WELLNESS_DATASETS, wellnessDates } from "./wellness.js";

test("recent wellness dates follow the configured calendar zone across DST", () => {
  const dates = wellnessDates({
    days: 3,
    now: new Date("2026-03-29T22:30:00Z"),
    timeZone: "Europe/Berlin",
  });
  assert.deepEqual(dates, ["2026-03-28", "2026-03-29", "2026-03-30"]);
});

test("historical range validates dates and includes both endpoints", () => {
  assert.deepEqual(
    wellnessDates({ from: "2026-02-27", to: "2026-03-01" }),
    ["2026-02-27", "2026-02-28", "2026-03-01"],
  );
  assert.throws(() => wellnessDates({ from: "2026-02-30" }), /real YYYY-MM-DD/);
  assert.throws(() => wellnessDates({ from: "2026-10-02", to: "2026-10-01" }), /after/);
});

test("downloads a complete daily archive and preserves an existing file after a failed request", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garmin-wellness-"));
  try {
    const calls = [];
    const fetchJson = async (route) => {
      calls.push(route);
      if (route.endsWith("/socialProfile")) return { displayName: "profile-id" };
      return { ok: true };
    };
    const options = { dates: ["2026-10-12"], fetchJson, outputDir: dir };
    assert.deepEqual(await downloadWellness(options), { downloaded: 1, skipped: 0 });
    const file = path.join(dir, "2026-10-12.json");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(saved.date, "2026-10-12");
    assert.deepEqual(Object.keys(saved).slice(1), WELLNESS_DATASETS.map(([name]) => name));
    assert.equal(calls.length, WELLNESS_DATASETS.length + 1);
    assert.ok(calls.some((route) => route.includes("/usersummary/daily/profile-id?calendarDate=2026-10-12")));

    assert.deepEqual(await downloadWellness({ ...options, refresh: false }), { downloaded: 0, skipped: 1 });
    const before = fs.readFileSync(file, "utf8");
    await assert.rejects(
      downloadWellness({ ...options, fetchJson: async (route) => {
        if (route.endsWith("/socialProfile")) return { displayName: "profile-id" };
        if (route.includes("dailyStress")) throw new Error("Garmin unavailable");
        return { changed: true };
      } }),
      /Garmin unavailable/,
    );
    assert.equal(fs.readFileSync(file, "utf8"), before);
    assert.deepEqual(fs.readdirSync(dir), ["2026-10-12.json"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
