/// <reference types="vite/client" />

declare const __APP_HOSTING_URL__: string;

interface ImportMetaEnv {
  readonly VITE_APP_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
