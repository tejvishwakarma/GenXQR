/**
 * Ambient types for @cashfreepayments/cashfree-js (v1.0.7).
 *
 * The package ships no type declarations — its package.json has no `types`
 * field and dist/ contains only JavaScript — so without this the import is an
 * implicit `any` and `noImplicitAny` fails the build.
 *
 * Only the surface this app actually uses is declared, deliberately: a
 * hand-written guess at the full SDK would be a liability the moment it drifts.
 * Widen it as needed rather than declaring the module as `any`.
 *
 * Reference: https://www.cashfree.com/docs/payments/online/web/redirect
 */
declare module "@cashfreepayments/cashfree-js" {
  export interface CashfreeLoadOptions {
    /** Must match the environment the payment session was created in. */
    mode: "sandbox" | "production"
  }

  export interface CashfreeCheckoutOptions {
    /** payment_session_id returned by the Create Order API. */
    paymentSessionId: string
    /**
     * "_self" navigates the current tab to Cashfree's hosted checkout.
     * "_modal" renders it in an overlay; "_blank" opens a new tab.
     */
    redirectTarget?: "_self" | "_blank" | "_modal" | HTMLElement
  }

  export interface CashfreeCheckoutResult {
    /** Set when the user dismissed the modal or the payment errored. */
    error?: { message?: string; code?: string; type?: string }
    /** Set when checkout had to redirect instead of rendering inline. */
    redirect?: boolean
    /** Set once payment completes, whatever the resulting status. */
    paymentDetails?: { paymentMessage?: string }
  }

  export interface CashfreeInstance {
    checkout(options: CashfreeCheckoutOptions): Promise<CashfreeCheckoutResult>
  }

  /** Resolves to null if the SDK could not initialise (e.g. it was blocked). */
  export function load(options: CashfreeLoadOptions): Promise<CashfreeInstance | null>
}
