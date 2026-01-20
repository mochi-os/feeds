import { createFileRoute } from '@tanstack/react-router'
import { GeneralError } from '@mochi/common'
import type { Feed } from '@/types'
import feedsApi from '@/api/feeds'
import { EntityFeedPage } from '@/features/feeds/pages'

export const Route = createFileRoute('/_authenticated/$feedId')({
  loader: async ({ params }) => {
    const { feedId } = params
    const response = await feedsApi.getInfo(feedId)
    if (!response.data.feed || !response.data.feed.id) {
      throw new Error('Feed not found')
    }
    return {
      ...response.data,
      feed: response.data.feed as Feed,
    }
  },
  component: FeedPage,
  errorComponent: ({ error }) => <GeneralError error={error} />,
})

function FeedPage() {
  const data = Route.useLoaderData()

  return <EntityFeedPage feed={data.feed} permissions={data.permissions} />
}
