import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOpenRouter } from "../src/openrouter.mjs";
import { codexNewTurnPrompt } from "../src/codex-proxy.mjs";

test("Codex 0.155 top-level tools initiate routing while tool results stay pinned", () => {
  const body = { tools: [{ type: "function", name: "shell" }], input: [
    { type: "message", role: "user", content: [{ type: "input_text", text: "Fix typo" }] },
  ] };
  assert.equal(codexNewTurnPrompt(body), "Fix typo");
  body.input.push({ type: "function_call_output", output: "done" });
  assert.equal(codexNewTurnPrompt(body), null);
  assert.equal(codexNewTurnPrompt({ input: [{ role: "user", content: "auxiliary" }], tools: [] }), null);
});

const request = { state: { request: "Fix typo" }, questions: {
  model: { type: "choice", instructions: "Choose", criteria: { luna: "simple", sol: "hard" } },
  difficulty: { type: "score", instructions: "Rate", criteria: ["easy", "hard"] },
} };
const valid = () => ({ answers: {
  model: { type: "choice", choice: "luna", confidence: 0.8, probabilities: { luna: 0.9, sol: 0.1 } },
  difficulty: { type: "score", score: 0.1, confidence: 0.8, probabilities: { 0: 0.9, 1: 0.1 } },
}, usage: { cost: 0.00001 } });

test("OpenRouter uses native Decisions and preserves native confidence and cost", async () => {
  const signal = new AbortController().signal;
  const result = await evaluateOpenRouter(request, signal, { apiKey: "fixture", fetch: async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/alpha/decisions");
    assert.equal(options.headers.Authorization, "Bearer fixture");
    assert.equal(options.signal, signal);
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), { model: "~typesafe/jev-latest", ...request });
    return Response.json(valid());
  } });
  assert.equal(result.answers.model.confidence, 0.8);
  assert.equal(result.usage.cost, 0.00001);
  assert.equal(result.confidenceSource, "typesafe-native-via-openrouter");
});

test("OpenRouter HTTP errors expose status but not response body and do not retry", async () => {
  let calls = 0;
  await assert.rejects(evaluateOpenRouter(request, undefined, { apiKey: "fixture", fetch: async () => {
    calls++; return new Response("secret echoed by upstream", { status: 402 });
  } }), (error) => error.statusCode === 402 && !error.message.includes("secret"));
  assert.equal(calls, 1);
});

test("OpenRouter rejects unknown choices, invalid scores and incomplete evidence", async () => {
  for (const change of [
    (r) => { r.answers.model.choice = "invented"; },
    (r) => { r.answers.model.confidence = null; },
    (r) => { r.answers.difficulty.score = 5; },
    (r) => { delete r.answers.difficulty; },
    (r) => { delete r.answers.model.probabilities.sol; },
  ]) {
    const result = valid(); change(result);
    await assert.rejects(evaluateOpenRouter(request, undefined, { apiKey: "fixture", fetch: async () => Response.json(result) }));
  }
});
