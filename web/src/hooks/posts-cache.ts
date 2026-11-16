// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { FeedPost } from '@/types'

/** Changes one post wherever a list of posts holds it: every ['posts'] query,
 * a single feed's and All feeds' alike. The pages show what these caches hold,
 * so a change made only on screen is undone by the next page fetched or the
 * next refetch. */
export function patchCachedPost(
  queryClient: QueryClient,
  postId: string,
  patch: (post: FeedPost) => FeedPost
) {
  queryClient.setQueriesData<InfiniteData<{ posts: FeedPost[] }>>(
    { queryKey: ['posts'] },
    (data) =>
      data?.pages
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              posts: page.posts.map((post) =>
                post.id === postId ? patch(post) : post
              ),
            })),
          }
        : data
  )
}
