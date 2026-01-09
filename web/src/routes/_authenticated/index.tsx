import { createFileRoute } from '@tanstack/react-router'
import { requestHelpers, GeneralError } from '@mochi/common'
import type { Feed, FeedPermissions } from '@/types'
import endpoints from '@/api/endpoints'
import { EntityFeedPage, FeedsListPage } from '@/features/feeds/pages'

// Response type for info endpoint - matches both class and entity context
interface InfoResponse {
  entity: boolean
  feeds?: Feed[]
  feed?: Feed
  permissions?: FeedPermissions
  fingerprint?: string
  user_id?: string
}

export const Route = createFileRoute('/_authenticated/')({
  loader: async () => {
    return requestHelpers.get<InfoResponse>(endpoints.feeds.info)
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
