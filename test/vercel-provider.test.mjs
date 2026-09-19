import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { distributionConfidence, evaluateVercel } from "../src/vercel.mjs";
import { readCodexProvider } from "../src/codex-provider.mjs";
import { codexArgs } from "../src/codex-cli.mjs";
import { jevDecisionEvents } from "../src/codex-proxy.mjs";

test("Gateway adaptation keeps probabilities and labels its derived confidence", async () => {
  const abort = new AbortController();
  const request = { state: { request: "fix typo" }, questions: {
    model: { type: "choice", instructions: "Pick", criteria: { luna: "simple", sol: "hard" } },
  } };
  const result = await evaluateVercel(request, abort.signal, {
    gateway: { evaluationModel: (id) => { assert.equal(id, "typesafe-ai/jev"); return "test-model"; } },
    evaluate: async (options) => {
      assert.equal(options.abortSignal, abort.signal);
      assert.equal(options.maxRetries, 0);
      assert.deepEqual(options.questions, request.questions);
      return { answers: { model: { type: "choice", choice: "luna", probabilities: { luna: 1, sol: 0 } } }, usage: { inputTokens: 10 } };
    },
  });
  assert.equal(result.answers.model.confidence, 1);
  assert.deepEqual(result.answers.model.probabilities, { luna: 1, sol: 0 });
  assert.match(result.confidenceSource, /not native TypeSafe/);
  assert.match(jevDecisionEvents({ model: "luna", confidence: 1, confidenceSource: result.confidenceSource, reason: "jev" }), /distribution concentration/);
});

test("Missing or invalid probability evidence never yields high confidence", () => {
  assert.equal(distributionConfidence(undefined), 0);
  assert.equal(distributionConfidence({ a: 0.5, b: 0.5 }), 0);
  assert.equal(distributionConfidence({ a: NaN, b: 0 }), 0);
  assert.equal(distributionConfidence({ a: 0.2, b: 0.2 }), 0);
});

test("Gateway failure propagates to caller fallback without retries", async () => {
  await assert.rejects(evaluateVercel({ state: "test", questions: {} }, undefined, {
    gateway: { evaluationModel: () => "test-model" },
    evaluate: async () => { throw new Error("blocked"); },
  }), /blocked/);
});

test("Custom provider supports inline, environment and auth.json keys without CLI exposure", (t) => {
  const root = mkdtempSync(join(tmpdir(), "jev-provider-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = (fields) => writeFileSync(join(root, "config.toml"), `model_provider="relay"\n[model_providers.relay]\nbase_url="http://127.0.0.1:9234/v1"\nwire_api="responses"\n${fields}\n`);
  config('experimental_bearer_token="fixture-secret"');
  assert.deepEqual(readCodexProvider(root, {}), { baseURL: "http://127.0.0.1:9234/v1", key: "fixture-secret" });
  config('env_key="RELAY_TEST_KEY"');
  assert.equal(readCodexProvider(root, { RELAY_TEST_KEY: "fixture-secret" }).key, "fixture-secret");
  config('requires_openai_auth=true');
  writeFileSync(join(root, "auth.json"), JSON.stringify({ OPENAI_API_KEY: "fixture-secret" }));
  assert.equal(readCodexProvider(root, {}).key, "fixture-secret");
  const args = codexArgs("http://127.0.0.1:1234", [], true);
  assert(args.includes("model_providers.jev.requires_openai_auth=false"));
  assert(args.includes('model_providers.jev.env_key="JEV_CODEX_UPSTREAM_KEY"'));
  assert(!args.join(" ").includes("fixture-secret"));
});

test("Malformed or uncredentialed custom provider fails instead of sending keys to official upstream", (t) => {
  const root = mkdtempSync(join(tmpdir(), "jev-provider-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, "config.toml");
  assert.equal(readCodexProvider(root, {}), null);
  writeFileSync(file, 'model_provider="relay"\n[model_providers.relay]\nbase_url="https://example.com/v1"');
  assert.throws(() => readCodexProvider(root, {}), /no usable API key/);
  writeFileSync(file, 'model_provider="relay"\n[model_providers.relay]\nbase_url="http://example.com/v1"');
  assert.throws(() => readCodexProvider(root, {}), /HTTPS/);
  writeFileSync(file, 'model_provider=bad');
  assert.throws(() => readCodexProvider(root, {}), /Cannot parse/);
});
