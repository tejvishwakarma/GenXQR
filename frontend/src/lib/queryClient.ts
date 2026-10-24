import { QueryClient } from "@tanstack/react-query"

/**
 * The app's one QueryClient. Its own module so clearClientSession (lib/api.ts)
 * can empty it on logout: query keys are not per-user (["qr-codes"],
 * ["subscription"]…), so without that the next person to sign in on the same
 * tab briefly saw the previous user's codes and billing.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})
