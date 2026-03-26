export interface NotificationSubscriptionState {
  exists: boolean
  types?: string[]
}

export interface NotificationPromptSubscription {
  label: string
  type: string
  defaultEnabled: boolean
}

interface RefetchResult {
  data?: {
    data?: NotificationSubscriptionState
  }
}

export const DEFAULT_NOTIFICATION_SUBSCRIPTIONS: NotificationPromptSubscription[] = [
  { label: 'New posts', type: 'post', defaultEnabled: true },
  { label: 'New comments', type: 'comment', defaultEnabled: true },
  { label: 'Mentions', type: 'mention', defaultEnabled: true },
  { label: 'Reactions', type: 'reaction', defaultEnabled: false },
]

export const MENTION_NOTIFICATION_SUBSCRIPTION: NotificationPromptSubscription = {
  label: 'Mentions',
  type: 'mention',
  defaultEnabled: true,
}

export async function resolveNotificationSubscriptionState(
  currentData: NotificationSubscriptionState | undefined,
  refetch: () => Promise<RefetchResult>,
): Promise<NotificationSubscriptionState | null> {
  if (currentData) {
    return currentData
  }

  const result = await refetch()
  return result.data?.data ?? null
}

export function getNotificationPromptSubscriptions(
  state: NotificationSubscriptionState | null | undefined,
): NotificationPromptSubscription[] {
  if (!state) {
    return []
  }

  if (!state.exists) {
    return DEFAULT_NOTIFICATION_SUBSCRIPTIONS
  }

  if (!state.types?.includes('mention')) {
    return [MENTION_NOTIFICATION_SUBSCRIPTION]
  }

  return []
}
