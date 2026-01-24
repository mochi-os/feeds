import { createFileRoute, redirect } from '@tanstack/react-router'
import { GeneralError } from '@mochi/common'
import type { Feed, FeedPermissions } from '@/types'
import endpoints from '@/api/endpoints'
import { feedsRequest } from '@/api/request'
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
    const info = await feedsRequest.get<InfoResponse>(endpoints.feeds.info)

    // Only redirect on first load, not on subsequent navigations
    if (hasCheckedRedirect) {
      // Already checked this session - just return without redirect or clearing
      return info
    }
    hasCheckedRedirect = true

    // In class context, check for last visited feed and redirect if it still exists
    if (!info.entity) {
      const lastFeedId = getLastFeed()
      if (lastFeedId) {
        const feeds = info.feeds || []
        const feedExists = feeds.some(f => f.id === lastFeedId || f.fingerprint === lastFeedId)
        if (feedExists) {
          throw redirect({ to: '/$feedId', params: { feedId: lastFeedId } })
        } else {
          clearLastFeed()
        }
      }
    }

    return info
  },
  component: IndexPage,
  errorComponent: ({ error }) => <GeneralError error={error} />,
})

function IndexPage() {
  const data = Route.useLoaderData()

  // If we're in entity context, show the feed page directly
  if (data.entity && data.feed) {
    return <EntityFeedPage feed={data.feed} permissions={data.permissions} />
  }

  // Class context - show feeds list
  return <FeedsListPage feeds={data.feeds} />
}
