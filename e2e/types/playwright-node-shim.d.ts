/**
 * Minimal ambient shims so the e2e specs typecheck under the EXACT tsc command
 * used by CI (no --skipLibCheck, no root @types/node hoist in this worktree):
 *
 *   npx tsc --noEmit --target es2020 --module esnext \
 *     --moduleResolution bundler --lib es2020,DOM --strict <spec.ts>
 *
 * Playwright's own type declarations reference three Node built-ins and the
 * `Buffer` global, and `--lib es2020` (not esnext) is missing
 * `Symbol.asyncDispose`. These declarations fill exactly those gaps. In a
 * fully-hoisted install the CI command should add `--skipLibCheck` (the
 * standard Playwright practice) instead of relying on this file.
 */

declare module "child_process" {
  export class ChildProcess {}
}

declare module "stream" {
  export class Readable {}
}

declare module "fs" {
  export class ReadStream {}
}

declare type Buffer = Uint8Array;

interface SymbolConstructor {
  readonly asyncDispose: symbol;
}
