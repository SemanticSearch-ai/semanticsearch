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
  [key: string]: unknown;
}
