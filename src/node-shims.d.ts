/**
 * `tsconfig.json` keeps `types: ["vite/client"]`, so this project has no
 * @types/node. `vite.config.ts` still runs in Node, and its texture step needs
 * exactly four built-ins; they are declared here rather than pulling a whole
 * Node type package into the app's type space.
 */

declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function writeFileSync(path: string, data: Uint8Array): void
}

declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string
}

declare const Buffer: {
  from(input: string, encoding: 'base64'): Uint8Array
}
