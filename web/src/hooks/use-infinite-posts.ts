import { useInfiniteQueryWithError } from '@mochi/common'
import type { InfiniteData } from '@tanstack/react-query'
import { useMemo } from 'react'

import { mapPosts } from '@/api/adapters'
import { feedsApi } from '@/api/feeds'
import type { FeedPermissions, FeedPost, Post } from '@/types'

const DEFAULT_LIMIT = 20

interface UseInfinitePostsOptions {
  feedId: string | null
  server?: string
  limit?: number
  enabled?: boolean
  entityContext?: boolean
  sort?: string
  tag?: string
}

interface UseInfinitePostsResult {
  posts: FeedPost[]
  permissions: FeedPermissions | undefined
  relevantFallback: boolean
  isLoading: boolean
  isError: boolean
  ErrorComponent: React.ReactNode
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  error: Error | null
  refetch: () => Promise<void>
}

type InfinitePostsPage = {
  posts: FeedPost[]
  hasMore: boolean
  nextCursor: number | undefined
  permissions: FeedPermissions | undefined
  relevantFallback: boolean
}

export function useInfinitePosts({
  feedId,
  server,
  limit = DEFAULT_LIMIT,
  enabled = true,
  entityContext = false,
  sort,
  tag,
}: UseInfinitePostsOptions): UseInfinitePostsResult {
  const query = useInfiniteQueryWithError<
    InfinitePostsPage,
    Error,
    InfiniteData<InfinitePostsPage, number | undefined>,
    [
      string,
      string | null,
      {
        server: string | undefined
        entityContext: boolean
        limit: number
        sort: string | undefined
        tag: string | undefined
      },
    ],
    number | undefined
  >({
    queryKey: ['posts', feedId, { server, entityContext, limit, sort, tag }],
    queryFn: async ({ pageParam }) => {
      if (!feedId) throw new Error('Feed ID required')

      const response = await feedsApi.get(feedId, {
        limit,
        before: pageParam as number | undefined,
        server,
        sort,
        tag,
      })

      const data = (response.data ?? {}) as {
        posts?: Post[]
        hasMore?: boolean
        nextCursor?: number
        permissions?: FeedPermissions
        relevantFallback?: boolean
      }

      const posts = mapPosts(data.posts)

      return {
        posts,
        hasMore: data.hasMore ?? false,
        nextCursor: data.nextCursor,
        permissions: data.permissions,
        relevantFallback: data.relevantFallback ?? false,
      } satisfies InfinitePostsPage
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: enabled && !!feedId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })

  const posts = useMemo(() => {
    if (!query.data?.pages) return []
    return query.data.pages.flatMap((page) => page.posts)
  }, [query.data?.pages])

  const permissions = query.data?.pages?.[0]?.permissions
  const relevantFallback = query.data?.pages?.[0]?.relevantFallback ?? false

  return {
    posts,
    permissions,
    relevantFallback,
    isLoading: query.isLoading,
    isError: query.isError,
    ErrorComponent: query.ErrorComponent,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: async () => {
      await query.refetch()
    },
  }
}
