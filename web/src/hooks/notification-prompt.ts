export interface NotificationSubscriptionState {
  exists: boolean
  types?: string[]
}

export interface NotificationPromptSubscription {
  label: string
  topic: string
  defaultEnabled: boolean
}

interface RefetchResult {
  data?: {
    data?: NotificationSubscriptionState
  }
}

export const DEFAULT_NOTIFICATION_SUBSCRIPTIONS: NotificationPromptSubscription[] = [
  { label: 'New posts', topic: 'post', defaultEnabled: true },
  { label: 'Comments on my posts', topic: 'comment/mine', defaultEnabled: true },
  { label: 'Comments in threads', topic: 'comment/thread', defaultEnabled: true },
  { label: 'Mentions', topic: 'mention', defaultEnabled: true },
  { label: 'Reactions on my posts', topic: 'reaction/mine', defaultEnabled: false },
  { label: 'Reactions in threads', topic: 'reaction/thread', defaultEnabled: false },
]

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
  _state: NotificationSubscriptionState | null | undefined,
): NotificationPromptSubscription[] {
  // Always declare the full set; the shell reconciles against existing subs
  // (orphans deleted, missing topics prompted for).
  return DEFAULT_NOTIFICATION_SUBSCRIPTIONS
}
