import { createGateway, experimental_evaluate as evaluate } from "ai";

// Gateway does not expose TypeSafe's native confidence. Use an explicitly
// identified distribution-concentration statistic for the existing policy gates.
export function distributionConfidence(probabilities) {
  const values = Object.values(probabilities ?? {});
  if (values.length < 2 || values.some((p) => !Number.isFinite(p) || p < 0 || p > 1)) return 0;
  const total = values.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 1) > 0.03) return 0;
  const entropy = values.reduce((s, p) => p ? s - (p / total) * Math.log(p / total) : s, 0);
  return Math.max(0, Math.min(1, 1 - entropy / Math.log(values.length)));
}

export async function evaluateVercel(request, signal, dependencies = {}) {
  const run = dependencies.evaluate ?? evaluate;
  const gateway = dependencies.gateway ?? createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });
  const result = await run({
    model: gateway.evaluationModel("typesafe-ai/jev"),
    state: request.state,
    questions: request.questions,
    abortSignal: signal,
    maxRetries: 0,
  });
  const answer = result.answers.model;
  if (!Object.hasOwn(request.questions.model.criteria, answer?.choice)) {
    throw new Error("Gateway returned an unknown model");
  }
  return {
    answers: {
      ...result.answers,
      model: { ...answer, confidence: distributionConfidence(answer.probabilities) },
    },
    usage: result.usage,
    confidenceSource: "gateway-normalized-entropy (not native TypeSafe confidence or success probability)",
  };
}
