import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";

// Read only the selected user-level provider. Never load destinations or keys
// from repository configuration, and never put credentials on the command line.
export function readCodexProvider(root = process.env.CODEX_HOME ?? join(homedir(), ".codex"), env = process.env) {
  let config;
  try { config = parse(readFileSync(join(root, "config.toml"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw new Error("Cannot parse Codex user configuration"); }
  const name = config.model_provider;
  if (!name || name === "openai") return null;
  const provider = config.model_providers?.[name];
  if (!provider?.base_url) throw new Error("Selected Codex provider has no base_url");
  if (provider.wire_api && provider.wire_api !== "responses") throw new Error("Codex upstream must support Responses API");
  const url = new URL(provider.base_url);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("Codex upstream must use HTTPS or local loopback HTTP, without URL credentials");
  }
  let key = provider.experimental_bearer_token ?? (provider.env_key ? env[provider.env_key] : undefined);
  if (!key && provider.requires_openai_auth) {
    try { key = JSON.parse(readFileSync(join(root, "auth.json"), "utf8")).OPENAI_API_KEY; }
    catch (error) { if (error.code !== "ENOENT") throw new Error("Cannot read Codex API-key authentication"); }
  }
  if (!key) throw new Error("Selected Codex custom provider has no usable API key");
  return { baseURL: url.href.replace(/\/$/, ""), key };
}
