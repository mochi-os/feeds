// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import {
  type InfiniteData,
  type Query,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { FeedPost } from '@/types'
import { optimistic } from '@mochi/web'
import { feedsApi } from '@/api/feeds'

type Lists = InfiniteData<{ posts: FeedPost[] }>
type Single = { post?: FeedPost | null }

export interface PinVariables {
  post: FeedPost
  pinned: boolean
}

const holds = (query: Query, id: string) =>
  !!(query.state.data as Lists | undefined)?.pages?.some((page) =>
    page.posts.some((item) => item.id === id)
  )

// Pin and unpin show on the post at once, in every list that holds it and on
// the post's own page, and go back if the server refuses. Where the post sits
// in the list is the server's to say, so the order waits for the refetch on
// success. The caller toasts from the promise.
export function usePinPost() {
  const queryClient = useQueryClient()
  const patch = optimistic(queryClient, ({ post, pinned }: PinVariables) => {
    // `pinned` is when it was pinned, in seconds; 0 for not pinned.
    const at = pinned ? Math.floor(Date.now() / 1000) : 0
    const set = (item: FeedPost) =>
      item.id === post.id ? { ...item, pinned: at } : item
    return [
      {
        // Only the lists holding the post, so no other list's fetch is
        // stopped.
        filters: {
          queryKey: ['posts'],
          predicate: (query) => holds(query, post.id),
        },
        update: (old: Lists) => ({
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            posts: page.posts.map(set),
          })),
        }),
      },
      {
        filters: {
          queryKey: ['feeds', 'single-post'],
          predicate: (query) =>
            (query.state.data as Single | undefined)?.post?.id === post.id,
        },
        update: (old: Single) => ({ ...old, post: set(old.post!) }),
      },
    ]
  })
  return useMutation({
    mutationFn: ({ post, pinned }: PinVariables) =>
      feedsApi.pinPost(post.feedId, post.id, pinned),
    onMutate: patch.onMutate,
    onError: (_error, _variables, context) => patch.rollback(context),
    // The list re-reads the feed's posts once the server has them.
    onSuccess: (_data, { post }) =>
      queryClient.invalidateQueries({ queryKey: ['posts', post.feedId] }),
  })
}
