// OpenRouter Decisions is a native typed endpoint, not Chat Completions.
export async function evaluateOpenRouter(request, signal, dependencies = {}) {
  const apiKey = dependencies.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");
  const response = await (dependencies.fetch ?? fetch)("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "~typesafe/jev-latest", state: request.state, questions: request.questions }),
    signal,
    redirect: "error",
  });
  if (!response.ok) {
    // Do not log provider bodies: they can echo prompts or credentials.
    const error = new Error(`OpenRouter Decisions HTTP ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  const result = await response.json();
  for (const [name, question] of Object.entries(request.questions)) {
    const answer = result.answers?.[name];
    if (!answer || answer.type !== question.type || !Number.isFinite(answer.confidence) ||
        answer.confidence < 0 || answer.confidence > 1) throw new Error("Invalid Decisions answer");
    const labels = question.type === "choice" ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
    const probabilities = answer.probabilities;
    if (!probabilities || Object.keys(probabilities).length !== labels.length ||
        labels.some((label) => !Number.isFinite(probabilities[label]) || probabilities[label] < 0 || probabilities[label] > 1) ||
        Math.abs(labels.reduce((sum, label) => sum + probabilities[label], 0) - 1) > 0.03) {
      throw new Error("Invalid Decisions probability distribution");
    }
    if (question.type === "choice" && !Object.hasOwn(question.criteria, answer.choice)) throw new Error("Unknown Decisions model");
    if (question.type === "score" && (!Number.isFinite(answer.score) || answer.score < 0 || answer.score > question.criteria.length - 1)) {
      throw new Error("Invalid Decisions score");
    }
  }
  return { ...result, confidenceSource: "typesafe-native-via-openrouter" };
}
