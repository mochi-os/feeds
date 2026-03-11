import { useQuery } from '@tanstack/react-query'
import { shellSubscribeNotifications, useAuthStore } from '@mochi/common'
import { feedsApi } from '@/api/feeds'

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
    if (subscriptionData?.data?.exists === false) {
      await shellSubscribeNotifications('feeds', [
        { label: 'New posts', type: 'post', defaultEnabled: true },
        { label: 'New comments', type: 'comment', defaultEnabled: true },
        { label: 'Reactions', type: 'reaction', defaultEnabled: false },
      ])
      await refetch()
    }
  }

  return { promptIfNeeded }
}
