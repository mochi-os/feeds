/// <reference types="vite/client" />

// @lingui/vite-plugin compiles .po files into JS modules at build time.
// Declared here so TypeScript can typecheck the dynamic imports in main.tsx.
declare module '*.po' {
  import type { Messages } from '@lingui/core'
  export const messages: Messages
}
