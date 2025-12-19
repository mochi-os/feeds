import { useInfiniteQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { mapPosts } from '@/api/adapters'
import feedsApi from '@/api/feeds'
import type { FeedPost } from '@/types'

const DEFAULT_LIMIT = 20

interface UseInfinitePostsOptions {
  feedId: string
  /** Server URL for private remote feeds (backend auto-detects local vs remote) */
  server?: string
  /** Number of posts per page */
  limit?: number
  /** Whether to enable the query */
  enabled?: boolean
}

interface UseInfinitePostsResult {
  posts: FeedPost[]
  isLoading: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  fetchNextPage: () => void
  error: Error | null
  refetch: () => void
}

export function useInfinitePosts({
  feedId,
  server,
  limit = DEFAULT_LIMIT,
  enabled = true,
}: UseInfinitePostsOptions): UseInfinitePostsResult {
  const query = useInfiniteQuery({
    queryKey: ['posts', feedId, { server }],
    queryFn: async ({ pageParam }) => {
      // Unified endpoint handles local vs remote detection automatically
      const response = await feedsApi.get(feedId, {
        limit,
        before: pageParam as number | undefined,
        server,
      })

      const data = response.data ?? {}
      const posts = mapPosts(data.posts)

      return {
        posts,
        hasMore: data.hasMore ?? false,
        nextCursor: data.nextCursor,
      }
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: enabled && !!feedId,
    staleTime: 30 * 1000, // 30 seconds
  })

  // Flatten all pages into a single array of posts
  const posts = useMemo(() => {
    if (!query.data?.pages) return []
    return query.data.pages.flatMap((page) => page.posts)
  }, [query.data?.pages])

  return {
    posts,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error,
    refetch: query.refetch,
  }
}
