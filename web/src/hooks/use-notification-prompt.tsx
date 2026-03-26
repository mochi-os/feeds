import { useQuery } from '@tanstack/react-query'
import { shellSubscribeNotifications, useAuthStore } from '@mochi/web'
import { feedsApi } from '@/api/feeds'
import {
  getNotificationPromptSubscriptions,
  resolveNotificationSubscriptionState,
} from './notification-prompt'

/**
 * Hook that manages prompting the user to configure notification preferences
 * the first time they subscribe to a feed.
 */
export function useNotificationPrompt() {
  const isLoggedIn = useAuthStore((state) => state.isAuthenticated)

  const { data: subscriptionData, refetch } = useQuery({
    queryKey: ['subscription-check', 'feeds'],
    queryFn: () => feedsApi.checkSubscription(),
    staleTime: Infinity,
    enabled: isLoggedIn,
  })

  /** Call after a successful subscribe to open the dialog if needed. */
  const promptIfNeeded = async () => {
    const state = await resolveNotificationSubscriptionState(subscriptionData?.data, refetch)
    const subscriptions = getNotificationPromptSubscriptions(state)

    if (subscriptions.length > 0) {
      await shellSubscribeNotifications('feeds', subscriptions)
      await refetch()
    }
  }

  return { promptIfNeeded }
}
