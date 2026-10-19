import assert from "node:assert/strict";
import test from "node:test";

import { fetchGarminJson, fetchInBrowser } from "./garmin-json.js";

test("an in-browser Garmin fetch aborts after its deadline", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  });
  try {
    assert.deepEqual(await fetchInBrowser({ fetchUrl: "https://example.test", headers: {}, timeoutMs: 10 }), {
      networkError: "timeout",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a timed-out Garmin request reports its retry and resumes", async () => {
  let calls = 0;
  const page = { evaluate: async () => ++calls === 1
    ? { networkError: "timeout" }
    : { status: 200, data: { ok: true } } };
  const waits = [];
  const messages = [];
  const data = await fetchGarminJson(page, { headers: {} }, "/gc-api/test", {
    delay: async (ms) => waits.push(ms),
    log: (message) => messages.push(message),
    maxRetries: 1,
    retryDelayMs: 5,
    timeoutMs: 10,
  });
  assert.deepEqual(data, { ok: true });
  assert.deepEqual(waits, [5]);
  assert.match(messages[0], /timed out after 0\.01s; retrying/);
});

test("a persistently timed-out Garmin request fails with a resumable error", async () => {
  const page = { evaluate: async () => ({ networkError: "timeout" }) };
  await assert.rejects(fetchGarminJson(page, { headers: {} }, "/gc-api/test", {
    delay: async () => {},
    log: () => {},
    maxRetries: 1,
    retryDelayMs: 1,
    timeoutMs: 10,
  }), /timed out.*after 2 attempts/);
});
