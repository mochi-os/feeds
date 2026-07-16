// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { useMemo } from 'react'

import { mapPosts } from '@/api/adapters'
import { feedsApi } from '@/api/feeds'
import type { FeedPermissions, FeedPost, Post } from '@/types'

const DEFAULT_LIMIT = 20

interface UseInfinitePostsOptions {
  feedId: string | null
  /** Fetch the "All feeds" aggregate (posts across every subscribed feed) via
   *  the class-level endpoint instead of a single feed. feedId is ignored. */
  aggregate?: boolean
  server?: string
  limit?: number
  enabled?: boolean
  entityContext?: boolean
  sort?: string
  tag?: string
  unread?: boolean
}

interface UseInfinitePostsResult {
  posts: FeedPost[]
  permissions: FeedPermissions | undefined

  hasAi: boolean

  isLoading: boolean
  isError: boolean
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
  hasAi: boolean
}

export function useInfinitePosts({
  feedId,
  aggregate = false,
  server,
  limit = DEFAULT_LIMIT,
  enabled = true,
  entityContext = false,
  sort,
  tag,
  unread,
}: UseInfinitePostsOptions): UseInfinitePostsResult {
  const query = useInfiniteQuery<
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
        unread: boolean | undefined
      },
    ],
    number | undefined
  >({
    queryKey: ['posts', aggregate ? '__all__' : feedId, { server, entityContext, limit, sort, tag, unread }],
    queryFn: async ({ pageParam }) => {
      if (!aggregate && !feedId) throw new Error("Feed ID required")

      const isRelevanceSort = sort === 'interests' || sort === 'ai' || sort === 'relevant'

      const cursor = {
        limit,
        before: isRelevanceSort ? undefined : (pageParam as number | undefined),
        offset: isRelevanceSort ? (pageParam as number | undefined) : undefined,
        sort,
        unread: unread ? '1' : undefined,
      }
      const response = aggregate
        ? await feedsApi.getAll(cursor)
        : await feedsApi.get(feedId as string, { ...cursor, server, tag })

      const data = (response.data ?? {}) as {
        posts?: Post[]
        hasMore?: boolean
        nextCursor?: number
        permissions?: FeedPermissions

        hasAi?: boolean

      }

      const posts = mapPosts(data.posts)

      return {
        posts,
        hasMore: data.hasMore ?? false,
        nextCursor: data.nextCursor,
        permissions: data.permissions,

        hasAi: data.hasAi ?? false,
      } satisfies InfinitePostsPage
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: enabled && (aggregate || !!feedId),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })

  const posts = useMemo(() => {
    if (!query.data?.pages) return []
    return query.data.pages.flatMap((page) => page.posts)
  }, [query.data?.pages])

  const permissions = query.data?.pages?.[0]?.permissions

  const hasAi = query.data?.pages?.[0]?.hasAi ?? false

  return {
    posts,
    permissions,
    hasAi,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    error: query.error ?? null,
    refetch: async () => {
      await query.refetch()
    },
  }
}
