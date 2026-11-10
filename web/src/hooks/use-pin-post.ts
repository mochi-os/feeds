// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import type { FeedPost } from '@/types'
import { optimisticFields, type FieldsPlace } from '@mochi/web'
import { feedsApi } from '@/api/feeds'
import { changePost } from '@/lib/patch'

type Lists = InfiniteData<{ posts: FeedPost[] }>
type Single = { post?: FeedPost | null }

export interface PinVariables {
  post: FeedPost
  pinned: boolean
}

// Plenty writes the lists while a pin is out: a read mark on scroll, a
// reaction, a websocket fold. So a refused pin puts back the pin field alone,
// on its own post, and those writes stay.
const places: FieldsPlace<FeedPost>[] = [
  {
    filters: { queryKey: ['posts'] },
    edit: (old: Lists, id, change) => {
      if (!old?.pages) return old
      let changed = false
      const pages = old.pages.map((page) => {
        const posts = page.posts.map((item) =>
          item.id === id ? change(item) : item
        )
        if (posts.every((item, i) => item === page.posts[i])) return page
        changed = true
        return { ...page, posts }
      })
      return changed ? { ...old, pages } : old
    },
  },
  {
    filters: { queryKey: ['feeds', 'single-post'] },
    edit: (old: Single, id, change) => {
      if (old?.post?.id !== id) return old
      const post = change(old.post)
      return post === old.post ? old : { ...old, post }
    },
  },
]

// Pin and unpin show on the post at once, in every list that holds it and on
// the post's own page, and go back if the server refuses. Where the post sits
// in the list is the server's to say, so the order waits for the refetch on
// success. The caller toasts from the promise.
export function usePinPost() {
  const queryClient = useQueryClient()
  const patch = optimisticFields(queryClient, {
    places,
    id: ({ post }: PinVariables) => post.id,
    fields: ['pinned'],
    // `pinned` is when it was pinned, in seconds; 0 for not pinned.
    apply: (item: FeedPost, { pinned }) =>
      !!item.pinned === pinned
        ? item
        : { ...item, pinned: pinned ? Math.floor(Date.now() / 1000) : 0 },
  })
  return useMutation({
    mutationFn: ({ post, pinned }: PinVariables) =>
      feedsApi.pinPost(post.feedId, post.id, pinned),
    onMutate: patch.onMutate,
    onError: (_error, _variables, context) => patch.rollback(context),
    // The pin the server set goes on the post wherever it is shown, its own
    // page included, and the list re-reads the feed's posts for the order.
    onSuccess: (data, variables) => {
      changePost(queryClient, variables.post.id, { pinned: data.pinned })
      return queryClient.invalidateQueries({
        queryKey: ['posts', variables.post.feedId],
      })
    },
  })
}
