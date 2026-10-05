// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useCallback, useMemo, useRef } from 'react'
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import type { FeedPermissions, FeedPost, Post } from '@/types'
import { mapPosts } from '@/api/adapters'
import { feedsApi } from '@/api/feeds'

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
  /** Fetch the list again without the reader having asked: their place is kept. */
  refetch: () => Promise<void>
  /** Fetch the list again because the reader asked for it as it now is. */
  reload: () => Promise<void>
  /** Report a post coming on screen, so the list knows how far the reader is. */
  seen: (postId: string) => void
}

type InfinitePostsPage = {
  posts: FeedPost[]
  hasMore: boolean
  nextCursor: number | undefined
  permissions: FeedPermissions | undefined
  hasAi: boolean
}

/**
 * The posts an unread list keeps through a refetch the reader did not ask for:
 * everything loaded up to and including `reached`, the furthest post they have
 * had on screen. The server's unread set no longer holds the ones read on the
 * way, and replacing the list with it would take the posts on screen with them
 * and leave the scroll position on whatever moved up.
 */
export function keptPosts(
  loaded: FeedPost[],
  reached: string | null
): FeedPost[] {
  if (!reached) return []
  const index = loaded.findIndex((post) => post.id === reached)
  return index < 0 ? [] : loaded.slice(0, index + 1)
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
  // How far the reader is in this list, and what the last fetch of its first
  // page kept for them. A different feed, sort or filter is a different list.
  const reached = useRef<string | null>(null)
  const held = useRef<Set<string>>(new Set())
  const asked = useRef(false)
  const list = JSON.stringify([
    aggregate,
    feedId,
    server,
    entityContext,
    limit,
    sort,
    tag,
    unread,
  ])
  const listed = useRef(list)
  if (listed.current !== list) {
    listed.current = list
    reached.current = null
    held.current = new Set()
  }

  // The query silences query/exhaustive-deps: the reader's place is this
  // view's own, not part of what the list is. Two views of one list share its
  // posts, not how far each has been read.
  const query = useInfiniteQuery<
    InfinitePostsPage,
    Error,
    InfiniteData<InfinitePostsPage, number | undefined>,
    [
      string,
      string | null,
      {
        aggregate: boolean
        feedId: string | null
        server: string | undefined
        entityContext: boolean
        limit: number
        sort: string | undefined
        tag: string | undefined
        unread: boolean | undefined
      },
    ],
    number | undefined
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
  >({
    queryKey: [
      'posts',
      aggregate ? '__all__' : feedId,
      { aggregate, feedId, server, entityContext, limit, sort, tag, unread },
    ],
    queryFn: async ({ pageParam, client, queryKey }) => {
      if (!aggregate && !feedId) throw new Error('Feed ID required')

      const isRelevanceSort =
        sort === 'interests' || sort === 'ai' || sort === 'relevant'

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

      let posts = mapPosts(data.posts)

      if (unread) {
        if (pageParam === undefined) {
          // The head of the list: keep what the reader has reached, unless
          // they asked for the list as it now is.
          const loaded = asked.current
            ? undefined
            : client.getQueryData<
                InfiniteData<InfinitePostsPage, number | undefined>
              >(queryKey)
          const kept = keptPosts(
            loaded?.pages.flatMap((page) => page.posts) ?? [],
            reached.current
          )
          held.current = new Set(kept.map((post) => post.id))
          posts = [
            ...kept,
            ...posts.filter((post) => !held.current.has(post.id)),
          ]
        } else {
          posts = posts.filter((post) => !held.current.has(post.id))
        }
      }

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

  const loaded = useRef(posts)
  loaded.current = posts

  const seen = useCallback((postId: string) => {
    const index = loaded.current.findIndex((post) => post.id === postId)
    const furthest = loaded.current.findIndex(
      (post) => post.id === reached.current
    )
    if (index > furthest) reached.current = postId
  }, [])

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
    reload: async () => {
      reached.current = null
      asked.current = true
      try {
        await query.refetch()
      } finally {
        asked.current = false
      }
    },
    seen,
  }
}
