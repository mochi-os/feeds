import { createFileRoute } from '@tanstack/react-router'
import { requestHelpers, GeneralError } from '@mochi/common'
import type { Feed, FeedPermissions } from '@/types'
import endpoints from '@/api/endpoints'
import { EntityFeedPage } from '@/features/feeds/pages'

// Response type for feed endpoint
interface FeedResponse {
  feed?: Feed
  permissions?: FeedPermissions
  user_id?: string
}

export const Route = createFileRoute('/_authenticated/$feedId')({
  loader: async ({ params }) => {
    const { feedId } = params
    return requestHelpers.get<FeedResponse>(endpoints.feeds.entityInfo(feedId))
  },
  component: FeedPage,
  errorComponent: ({ error }) => <GeneralError error={error} />,
})

function FeedPage() {
  const data = Route.useLoaderData()

  if (!data.feed) {
    throw new Error('Feed not found')
  }

  return <EntityFeedPage feed={data.feed} permissions={data.permissions} />
}
