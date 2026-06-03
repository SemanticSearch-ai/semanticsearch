export interface Env {
  AI: Ai;
  VECTORIZE: Vectorize;
  /**
   * Legacy single key binding kept for backwards compatibility.
   */
  API_KEY?: string;
  /**
   * Comma or newline separated list of writer (read+write) keys.
   */
  API_KEY_WRITER?: string;
  /**
   * Comma or newline separated list of reader (search-only) keys.
   */
  API_KEY_READER?: string;
  /**
   * Workers AI text-embedding model id. Defaults to '@cf/google/embeddinggemma-300m'.
   * Override per-deployment via Wrangler vars (e.g. '@cf/qwen/qwen3-embedding-0.6b' for the blog).
   */
  EMBEDDING_MODEL?: string;
  /**
   * Output embedding dimension to store (MRL truncation). Defaults to '256'.
   * Must match the bound Vectorize index's dimension.
   */
  EMBEDDING_DIM?: string;
  [key: string]: unknown;
}
