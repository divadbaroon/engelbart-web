// The little of jsdom that one script uses.
//
// jsdom ships no types and @types/jsdom is not a dependency here. Rather
// than add one for a single verification script, this names the three
// things scripts/semantics/verify.mts imports and nothing else — so the
// script typechecks, and anything it starts using has to be added here
// deliberately rather than arriving as `any`.
declare module "jsdom" {
  export class VirtualConsole {
    sendTo(console: Console): this;
  }

  export function requestInterceptor(
    handler: (request: Request) => Response | Promise<Response> | null | undefined,
  ): unknown;

  export class JSDOM {
    constructor(html: string, options?: {
      url?: string;
      runScripts?: "dangerously" | "outside-only";
      pretendToBeVisual?: boolean;
      virtualConsole?: VirtualConsole;
      resources?: { interceptors?: unknown[] } | string;
    });
    readonly window: Window & typeof globalThis;
    serialize(): string;
  }
}
