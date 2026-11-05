import assert from "node:assert/strict";
import test from "node:test";
import { createPersonalApiClient } from "./personal-api.js";

test("exchanges the key once, refreshes a rejected bearer token, and does not expose credentials in errors", async () => {
  const requests = [];
  let tokenNumber = 0;
  const client = createPersonalApiClient("secret-key", { fetchImpl: async (url, options) => {
    requests.push({ path: url.pathname, authorization: options.headers.Authorization });
    if (options.method === "POST") return new Response(`token-${++tokenNumber}`);
    if (options.headers.Authorization === "Bearer token-1") return new Response("", { status: 401 });
    return Response.json({ ok: true });
  } });
  assert.deepEqual(await client.getJson("/example"), { ok: true });
  assert.deepEqual(requests.map((request) => request.authorization), [
    "ApiKey secret-key", "Bearer token-1", "ApiKey secret-key", "Bearer token-2",
  ]);
  assert.throws(() => createPersonalApiClient(""), /GARMIN_PERSONAL_API_KEY/);
});

test("retries a transient response and treats a missing original file as absent", async () => {
  const waits = [];
  let calls = 0;
  const client = createPersonalApiClient("secret", {
    fetchImpl: async (_url, options) => {
      if (options.method === "POST") return new Response("token");
      calls++;
      if (calls === 1) return new Response("", { status: 503 });
      return new Response("", { status: 404 });
    },
    delay: async (ms) => waits.push(ms),
    log: () => {},
  });
  assert.equal(await client.getZip("/download-service/files/activity/1"), null);
  assert.deepEqual(waits, [5000]);
});

test("retries token exchange without putting the key in an error", async () => {
  let attempts = 0;
  const client = createPersonalApiClient("secret", {
    fetchImpl: async (_url, options) => {
      if (options.method === "POST") {
        attempts++;
        return attempts === 1 ? new Response("", { status: 503 }) : new Response("token");
      }
      return Response.json({ ok: true });
    },
    delay: async () => {},
    log: () => {},
  });
  assert.deepEqual(await client.getJson("/example"), { ok: true });
  assert.equal(attempts, 2);
});
