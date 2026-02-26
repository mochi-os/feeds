import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import type { Feed, FeedPermissions } from '@/types'

import { feedsApi } from '@/api/feeds'
import { EntityFeedPage, FeedsListPage } from '@/features/feeds/pages'
import { getLastFeed, clearLastFeed } from '@/hooks/use-feeds-storage'

// Response type for info endpoint - matches both class and entity context
interface InfoResponse {
  entity: boolean
  feeds?: Feed[]
  feed?: Feed
  permissions?: FeedPermissions
  fingerprint?: string
  user_id?: string
}

// Module-level flag to track if we've already done initial redirect check (resets on page refresh)
let hasCheckedRedirect = false

export const Route = createFileRoute('/_authenticated/')({
  loader: async () => {
    let info: InfoResponse | null = null
    let loaderError: string | null = null

    try {
      const response = await feedsApi.find()
      // Cast to InfoResponse because api/feeds might define a different return type for find()
      // but the underlying data (from endpoints.feeds.info) matches InfoResponse
      info = response.data as unknown as InfoResponse
    } catch (error) {
      loaderError = error instanceof Error ? error.message : 'Failed to load feeds'
    }

    // Only redirect on first load, not on subsequent navigations
    if (info && !hasCheckedRedirect) {
      hasCheckedRedirect = true

      // In class context, check for last visited feed and redirect if it still exists
      if (!info.entity) {
        const lastFeedId = getLastFeed()
        if (lastFeedId) {
          const feeds = info.feeds || []
          const feedExists = feeds.some(
            (f: Feed) => f.id === lastFeedId || f.fingerprint === lastFeedId
          )
          if (feedExists) {
            throw redirect({ to: '/$feedId', params: { feedId: lastFeedId } })
          }
          clearLastFeed()
        }
      }
    }

    return { info, loaderError }
  },
  component: IndexPage,
})

function IndexPage() {
  const { info, loaderError } = Route.useLoaderData()
  const router = useRouter()

  // If we're in entity context, show the feed page directly
  if (info?.entity && info.feed) {
    return <EntityFeedPage feed={info.feed} permissions={info.permissions} />
  }

  // Class context - show feeds list
  return (
    <FeedsListPage
      feeds={info?.feeds}
      loaderError={loaderError}
      onRetryLoader={() => void router.invalidate()}
    />
  )
}
