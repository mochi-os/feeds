import { createFileRoute, redirect, useRouter, useNavigate } from '@tanstack/react-router'
import { GeneralError, Main, PageHeader, getErrorMessage } from '@mochi/common'
import type { Feed } from '@/types'
import { feedsApi } from '@/api/feeds'
import { EntityFeedPage } from '@/features/feeds/pages'

export const Route = createFileRoute('/_authenticated/$feedId')({
  loader: async ({ params }) => {
    const { feedId } = params
    let response: Awaited<ReturnType<typeof feedsApi.getInfo>>
    try {
      response = await feedsApi.getInfo(feedId)
    } catch (error) {
      return {
        feed: null as Feed | null,
        permissions: undefined,
        loaderError: getErrorMessage(error, 'Failed to load feed'),
      }
    }

    if (!response.data.feed || !response.data.feed.id) {
      // Feed not found or not accessible - redirect to all feeds
      throw redirect({ to: '/' })
    }
    return {
      permissions: response.data.permissions,
      feed: response.data.feed as Feed,
      loaderError: null,
    }
  },
  component: FeedPage,
})

function FeedPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()

  if (!data.feed) {
    return (
      <>
        <PageHeader title='Feed' back={{ label: 'Back to feeds', onFallback: () => navigate({ to: '/' }) }} />
        <Main>
          <GeneralError
            error={new Error(data.loaderError ?? 'Failed to load feed')}
            minimal
            mode='inline'
            reset={() => void router.invalidate()}
          />
        </Main>
      </>
    )
  }

  return <EntityFeedPage feed={data.feed} permissions={data.permissions} />
}
