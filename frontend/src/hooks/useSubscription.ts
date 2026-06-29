import { useQuery } from "@tanstack/react-query"
import { getSubscription, type SubscriptionInfo } from "@/lib/api"

/**
 * React Query hook that fetches the current user's subscription and plan limits.
 * Cached for 5 minutes; background-refetched on window focus.
 */
export function useSubscription() {
  const query = useQuery<{ success: boolean; data: SubscriptionInfo }>({
    queryKey: ["subscription"],
    queryFn: getSubscription,
    staleTime: 5 * 60 * 1000,
  })

  const sub = query.data?.data

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    planName: sub?.planName ?? "FREE",
    limits: sub?.limits,
    isTrialing: sub?.isTrialing ?? false,
    trialEndsAt: sub?.trialEndsAt ?? null,
    subscriptionStatus: sub?.subscriptionStatus ?? "ACTIVE",
    subscription: sub?.subscription,
    /** Refetch after a plan change */
    refetch: query.refetch,
  }
}
