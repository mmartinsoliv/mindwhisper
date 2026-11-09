/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend URL baked into release builds; unset or blank means the local development server. */
  readonly VITE_DEFAULT_BACKEND_URL?: string;
}
