declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    // Provider keys (Worker secrets, `.dev.vars` locally, §6.8); a provider without one is off.
    ANTHROPIC_API_KEY?: string;
    OPENAI_API_KEY?: string;
    GOOGLE_GENERATIVE_AI_API_KEY?: string;
  }
}
