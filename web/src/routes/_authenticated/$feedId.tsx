// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { QueryClient } from '@tanstack/react-query'
import {
  createFileRoute,
  useRouter,
  useNavigate,
  Link,
} from '@tanstack/react-router'
import type { Feed } from '@/types'
import { t } from '@lingui/core/macro'
import { Trans, useLingui } from '@lingui/react/macro'
import {
  Button,
  EmptyState,
  GeneralError,
  Main,
  PageHeader,
  extractStatus,
  getErrorMessage,
  useAuthStore,
} from '@mochi/web'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { feedsApi } from '@/api/feeds'
import { useFeedsStore } from '@/stores/feeds-store'
import {
  fetchPostsPage,
  prefetchPosts,
  type PostsEarly,
  type PostsList,
  type PostsPrefetch,
} from '@/hooks/use-infinite-posts'
import { readFilter } from '@/hooks/use-read-filter'
import { EntityFeedPage } from '@/features/feeds/pages'
import { initialSort } from '@/features/feeds/utils'

export type FeedLoaderData = {
  feed: Feed | null
  permissions?: import('@/types').FeedPermissions
  loaderError: string | null
  // The thrown error itself, so the page keeps its status (403 shows Access denied).
  error: unknown
  notFound: boolean
  /** The page's first page of posts, started alongside the feed. */
  prefetched?: PostsPrefetch
}

// The feed the last load was for. A load for it again while it is open is the
// page refreshing itself (the route invalidated), not a navigation.
let shown: string | undefined

// The list of posts the page will open on, as far as can be told before the
// feed's own row arrives: the feed's sort from the sidebar's list when it holds
// the feed, the reader's default and read filter otherwise, as the page does.
function expectedList(feedId: string): PostsList & { known: boolean } {
  const { feeds, defaultSort } = useFeedsStore.getState()
  const known = feeds.find((f) => f.id === feedId || f.fingerprint === feedId)
  return {
    known: known !== undefined,
    feedId: known?.id ?? feedId,
    entityContext: true,
    sort: initialSort(
      known?.sort,
      defaultSort,
      useAuthStore.getState().isAuthenticated
    ),
    unread: readFilter() === 'unread',
  }
}

// Resolve the routed feed. A missing/inaccessible feed returns notFound (the
// page renders an explanatory empty state) rather than silently redirecting to
// the timeline, so a user who followed a dead or private link learns why.
//
// A navigation starts the page's first page of posts alongside the feed's row,
// under the query the page's list reads, so the page shows it instead of
// asking again. For a feed the sidebar's list does not hold, the list's key
// waits for the row to name the feed's id and sort, so the page is asked for
// by the identifier in the address, of this server only: a feed held
// elsewhere is refused here, rather than fetched from another server. The
// page refreshing itself fetches only the row: its list stays as the reader
// has it.
export async function loadFeed(
  feedId: string,
  options?: { client?: QueryClient; cause?: 'enter' | 'stay' | 'preload' }
): Promise<FeedLoaderData> {
  const cause = options?.cause ?? 'enter'
  const again = cause === 'stay' && shown === feedId
  if (cause !== 'preload') shown = feedId

  const client = again ? undefined : options?.client
  const { known, ...list } = expectedList(feedId)
  let prefetched = client && known ? prefetchPosts(client, list) : undefined
  const early: PostsEarly | undefined =
    client && !known
      ? { asked: Date.now(), page: fetchPostsPage(list, undefined, true) }
      : undefined
  void early?.page.catch(() => {})

  let response: Awaited<ReturnType<typeof feedsApi.getInfo>>
  try {
    response = await feedsApi.getInfo(feedId)
  } catch (error) {
    return {
      feed: null,
      permissions: undefined,
      loaderError: getErrorMessage(error, t`Failed to load feed`),
      error,
      notFound: false,
    }
  }

  if (!response.data.feed || !response.data.feed.id) {
    return {
      feed: null,
      permissions: undefined,
      loaderError: null,
      error: null,
      notFound: true,
    }
  }

  const feed = response.data.feed as Feed
  if (client && !known) {
    const sort = initialSort(
      feed.sort,
      useFeedsStore.getState().defaultSort,
      useAuthStore.getState().isAuthenticated
    )
    // The early page stands for the list when the row confirms the sort it
    // was asked in; otherwise the list is asked for afresh.
    prefetched = prefetchPosts(
      client,
      { ...list, feedId: feed.id, sort },
      sort === list.sort ? early : undefined
    )
  }

  return {
    permissions: response.data.permissions,
    feed,
    loaderError: null,
    error: null,
    notFound: false,
    prefetched,
  }
}

export const Route = createFileRoute('/_authenticated/$feedId')({
  loader: ({ params, context, cause }) =>
    loadFeed(params.feedId, { client: context.queryClient, cause }),
  component: FeedPage,
})

function FeedPage() {
  const { t } = useLingui()
  const data = Route.useLoaderData()
  const router = useRouter()
  const navigate = useNavigate()

  if (data.notFound) {
    return (
      <>
        <PageHeader
          title={t`Feed`}
          back={{
            label: t`Back to feeds`,
            onFallback: () => navigate({ to: '/' }),
          }}
        />
        <Main className='space-y-4'>
          <EmptyState
            icon={FileQuestion}
            title={t`Feed not found`}
            description={t`This feed may have been deleted, or you may not have access to it.`}
          >
            <Link to='/'>
              <Button variant='outline'>
                <ArrowLeft className='size-4 rtl:rotate-180' />
                <Trans>Back to feeds</Trans>
              </Button>
            </Link>
          </EmptyState>
        </Main>
      </>
    )
  }

  if (!data.feed) {
    return (
      <>
        <PageHeader
          title={t`Feed`}
          back={{
            label: t`Back to feeds`,
            onFallback: () => navigate({ to: '/' }),
          }}
        />
        <Main>
          <GeneralError
            error={
              data.error ??
              new Error(data.loaderError ?? t`Failed to load feed`)
            }
            minimal
            mode='inline'
            // A retry cannot lift a block, so a 403 gets no Try again.
            reset={
              extractStatus(data.error) === 403
                ? undefined
                : () => void router.invalidate()
            }
          />
        </Main>
      </>
    )
  }

  // Keyed by feed, so moving to another feed opens a fresh page - its own
  // sort, no tag filter or queued posts carried over - whose list mounts with
  // the first page the loader started.
  return (
    <EntityFeedPage
      key={data.feed.id}
      feed={data.feed}
      permissions={data.permissions}
      prefetched={data.prefetched}
    />
  )
}
