// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import type { FeedPermissions, FeedPost, Post } from '@/types'
import { mapPosts } from '@/api/adapters'
import { feedsApi } from '@/api/feeds'

const DEFAULT_LIMIT = 20

/** Which list of posts: the feed, and how it is asked for. */
export interface PostsList {
  feedId: string | null
  /** Fetch the "All feeds" aggregate (posts across every subscribed feed) via
   *  the class-level endpoint instead of a single feed. feedId is ignored. */
  aggregate?: boolean
  server?: string
  limit?: number
  entityContext?: boolean
  sort?: string
  tag?: string
  unread?: boolean
}

interface UseInfinitePostsOptions extends PostsList {
  enabled?: boolean
  /** The first page this navigation's route loader started fetching, if it did. */
  prefetched?: PostsPrefetch
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

export type InfinitePostsPage = {
  posts: FeedPost[]
  hasMore: boolean
  nextCursor: number | undefined
  permissions: FeedPermissions | undefined
  hasAi: boolean
}

type PostsData = InfiniteData<InfinitePostsPage, number | undefined>

type PostsKey = [
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
]

/** The query key of a list of posts. */
export function postsKey({
  feedId,
  aggregate = false,
  server,
  limit = DEFAULT_LIMIT,
  entityContext = false,
  sort,
  tag,
  unread,
}: PostsList): PostsKey {
  return [
    'posts',
    aggregate ? '__all__' : feedId,
    { aggregate, feedId, server, entityContext, limit, sort, tag, unread },
  ]
}

/**
 * Fetch one page of a list of posts, as the server holds it. `local` asks for
 * a feed held here only: one held elsewhere is not found, rather than fetched
 * from another server.
 */
export async function fetchPostsPage(
  {
    feedId,
    aggregate = false,
    server,
    limit = DEFAULT_LIMIT,
    sort,
    tag,
    unread,
  }: PostsList,
  pageParam: number | undefined,
  local = false
): Promise<InfinitePostsPage> {
  if (!aggregate && !feedId) throw new Error('Feed ID required')

  const isRelevanceSort =
    sort === 'interests' || sort === 'ai' || sort === 'relevant'

  const cursor = {
    limit,
    before: isRelevanceSort ? undefined : pageParam,
    offset: isRelevanceSort ? pageParam : undefined,
    sort,
    unread: unread ? '1' : undefined,
  }
  const response = aggregate
    ? await feedsApi.getAll(cursor)
    : await feedsApi.get(feedId as string, {
        ...cursor,
        server,
        tag,
        local: local ? '1' : undefined,
      })

  const data = (response.data ?? {}) as {
    posts?: Post[]
    hasMore?: boolean
    nextCursor?: number
    permissions?: FeedPermissions

    hasAi?: boolean
  }

  return {
    posts: mapPosts(data.posts),
    hasMore: data.hasMore ?? false,
    nextCursor: data.nextCursor,
    permissions: data.permissions,

    hasAi: data.hasAi ?? false,
  }
}

/** A first page of posts a route loader fetched for the page it opens. */
export interface PostsPrefetch {
  /** The list as the prefetch left it, once it has landed. */
  data?: PostsData
}

// Prefetches already shown. One is honoured once, by the page its navigation
// opens; a later mount of that page is a return, which shows what has
// changed since.
const spent = new WeakSet<PostsPrefetch>()

/** A first page of posts already asked for, before the list's key was known. */
export interface PostsEarly {
  page: Promise<InfinitePostsPage>
  /** When it was asked for. */
  asked: number
}

/**
 * Start fetching the first page of a list for the page a navigation opens, so
 * the page shows it rather than asking again. A list a page already shows is
 * left to that page: fetching it from here would replace what the reader has
 * without the page's own handling, such as the posts an unread list keeps.
 * `early`, when given, is that first page already on its way; it is used once,
 * and only if it answers and the list holds nothing fetched after it was asked
 * for. Otherwise the page is asked for afresh.
 */
export function prefetchPosts(
  client: QueryClient,
  list: PostsList,
  early?: PostsEarly
): PostsPrefetch | undefined {
  const key = postsKey(list)
  const query = client.getQueryCache().find({ queryKey: key, exact: true })
  if (query && query.getObserversCount() > 0) return undefined
  const held = client.getQueryState(key)?.dataUpdatedAt ?? 0
  let pending = early && held <= early.asked ? early.page : undefined
  const prefetch: PostsPrefetch = {}
  const asked = Date.now()
  // `pending` is not part of what the list is: it carries an answer to the
  // same request the key names, already on its way.
  void client
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    .prefetchInfiniteQuery({
      queryKey: key,
      queryFn: ({ pageParam }) => {
        if (pageParam === undefined && pending) {
          const page = pending
          pending = undefined
          return page.catch(() => fetchPostsPage(list, undefined))
        }
        return fetchPostsPage(list, pageParam)
      },
      initialPageParam: undefined as number | undefined,
      getNextPageParam: (lastPage: InfinitePostsPage) =>
        lastPage.hasMore ? lastPage.nextCursor : undefined,
    })
    .then(() => {
      // Only a list this prefetch answered stands for the page. A failed one
      // leaves an older list or none, which the page must ask for again.
      const state = client.getQueryState<PostsData>(key)
      if (state?.status === 'success' && state.dataUpdatedAt >= asked) {
        prefetch.data = state.data
      }
    })
  return prefetch
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
  prefetched,
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
    PostsData,
    PostsKey,
    number | undefined
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
  >({
    queryKey: postsKey({
      feedId,
      aggregate,
      server,
      limit,
      entityContext,
      sort,
      tag,
      unread,
    }),
    queryFn: async ({ pageParam, client, queryKey }) => {
      const fetched = await fetchPostsPage(
        { feedId, aggregate, server, limit, sort, tag, unread },
        pageParam
      )

      let posts = fetched.posts

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

      return { ...fetched, posts } satisfies InfinitePostsPage
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: enabled && (aggregate || !!feedId),
    staleTime: 0,
    // Opening or returning to a list shows its posts and permissions as they
    // now are, so a mount fetches it again - unless it holds the first page
    // this navigation's loader has just fetched, and nothing has changed
    // since (an event invalidates it).
    refetchOnMount: (cached) =>
      prefetched !== undefined &&
      !spent.has(prefetched) &&
      prefetched.data !== undefined &&
      cached.state.data === prefetched.data &&
      !cached.state.isInvalidated
        ? false
        : 'always',
    refetchOnWindowFocus: false,
  })

  // Declared after the query, so this runs once the query has subscribed and
  // made its mount-time decision.
  useEffect(() => {
    if (prefetched) spent.add(prefetched)
  }, [prefetched])

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
