import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { mapPosts } from '@/api/adapters'
import feedsApi from '@/api/feeds'
import type { FeedPermissions, FeedPost } from '@/types'

const DEFAULT_LIMIT = 20

interface UseInfinitePostsOptions {
  feedId: string | null
  /** Server URL for private remote feeds (backend auto-detects local vs remote) */
  server?: string
  /** Number of posts per page */
  limit?: number
  /** Whether to enable the query */
  enabled?: boolean
  /** When true, uses getApiBasepath() for entity context (domain routing) */
  entityContext?: boolean
}

interface UseInfinitePostsResult {
  posts: FeedPost[]
  permissions: FeedPermissions | undefined
  isLoading: boolean
  isError: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  error: Error | null
  refetch: () => Promise<any>
}

export function useInfinitePosts({
  feedId,
  server,
  limit = DEFAULT_LIMIT,
  enabled = true,
  entityContext = false,
}: UseInfinitePostsOptions): UseInfinitePostsResult {
  const query = useInfiniteQuery({
    queryKey: ['posts', feedId, { server, entityContext, limit }],
    queryFn: async ({ pageParam }) => {
      if (!feedId) throw new Error('Feed ID required')

      let data: any

      // Unified endpoint handles local vs remote detection automatically
      const response = await feedsApi.get(feedId, {
        limit,
        before: pageParam as number | undefined,
        server,
      })
      data = response.data ?? {}

      const posts = mapPosts(data.posts)

      return {
        posts,
        hasMore: data.hasMore ?? false,
        nextCursor: data.nextCursor,
        permissions: data.permissions,
      }
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: enabled && !!feedId,
    staleTime: 0, // Always refetch (was 30 seconds)
    refetchOnMount: 'always', // Force refetch on mount to get fresh permissions
    refetchOnWindowFocus: false, // Don't refetch on window focus to preserve optimistic updates
  })

  // Flatten all pages into a single array of posts
  const posts = useMemo(() => {
    if (!query.data?.pages) return []
    return query.data.pages.flatMap((page) => page.posts)
  }, [query.data?.pages])

  // Get permissions from first page (they don't change between pages)
  const permissions = query.data?.pages?.[0]?.permissions

  return {
    posts,
    permissions,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
  }
}
