import { createFileRoute } from '@tanstack/react-router'
import { GeneralError } from '@mochi/common'
import feedsApi from '@/api/feeds'
import { FeedsListPage } from '@/features/feeds/pages'

export const Route = createFileRoute('/_authenticated/')({
  loader: async () => {
    // Use feedsApi.view() without params to get all feeds (class context)
    const response = await feedsApi.view()
    return response.data
  },
  component: IndexPage,
  errorComponent: ({ error }) => <GeneralError error={error} />,
})

function IndexPage() {
  const data = Route.useLoaderData()

  // Index route always shows feeds list (class context)
  return <FeedsListPage feeds={data.feeds} />
}
