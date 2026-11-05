import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { downloadActivities, fitFileName } from "./activities.js";

test("extracts FIT from Garmin's original ZIP and skips an existing file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garmin-fit-"));
  try {
    const activity = { activityId: 123, startTimeLocal: "2026-11-04 08:12:35.000" };
    const zip = new AdmZip();
    zip.addFile("123_ACTIVITY.fit", Buffer.from("fit bytes"));
    let downloads = 0;
    const client = {
      getJson: async () => [activity],
      getZip: async () => { downloads++; return zip.toBuffer(); },
    };
    const options = { client, outputDir: dir, limit: 1 };
    assert.equal(fitFileName(activity), "2026-11-04-08-12-35.fit");
    assert.deepEqual(await downloadActivities(options), { found: 1, downloaded: 1, skipped: 0 });
    assert.equal(fs.readFileSync(path.join(dir, fitFileName(activity)), "utf8"), "fit bytes");
    assert.deepEqual(await downloadActivities(options), { found: 1, downloaded: 0, skipped: 1 });
    assert.equal(downloads, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
