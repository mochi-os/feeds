// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { useCallback } from 'react'
import { useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useLingui } from '@lingui/react/macro'
import { feedsApi } from '@/api/feeds'
import { patchPostReaction } from '@/features/feeds/utils'
import type { FeedPost, ReactionId } from '@/types'
import { toast, getErrorMessage } from '@mochi/web'

export type UsePostActionsOptions = {
  setPostsByFeed: React.Dispatch<React.SetStateAction<Record<string, FeedPost[]>>>
}

export type UsePostActionsResult = {
  /** React to a post */
  handlePostReaction: (feedId: string, postId: string, reaction: ReactionId | '') => void
}

export function usePostActions({
  setPostsByFeed,
}: UsePostActionsOptions): UsePostActionsResult {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const handlePostReaction = useCallback((feedId: string, postId: string, reaction: ReactionId | '') => {
    // Broad ['posts'] match (not ['posts', feedId]) so the same post is patched
    // in every cache it appears in — the single feed AND the "All feeds"
    // aggregate (['posts','__all__']) — and survives that view's pagination.
    // The updater keys on post.id, so unrelated caches are untouched.
    const previousPostsQueries = queryClient.getQueriesData<InfiniteData<{ posts: FeedPost[] }>>({
      queryKey: ['posts'],
    })
    let previousFeedPosts: FeedPost[] = []

    setPostsByFeed((current) => {
      const posts = current[feedId] ?? []
      previousFeedPosts = posts
      const updated = posts.map((post) =>
        post.id === postId
          ? patchPostReaction(post, reaction)
          : post
      )
      return { ...current, [feedId]: updated }
    })

    queryClient.setQueriesData<InfiniteData<{ posts: FeedPost[] }>>(
      { queryKey: ['posts'] },
      (data) => {
        if (!data?.pages) return data
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            posts: page.posts.map((post) =>
              post.id === postId ? patchPostReaction(post, reaction) : post
            ),
          })),
        }
      },
    )

    // Call API to set or remove reaction (empty string removes)
    void feedsApi.reactToPost(feedId, postId, reaction).catch((error) => {
      setPostsByFeed((current) => ({ ...current, [feedId]: previousFeedPosts }))
      previousPostsQueries.forEach(([key, data]) => {
        queryClient.setQueryData(key, data)
      })
      toast.error(getErrorMessage(error, t`Failed to update reaction`))
    })
  }, [queryClient, setPostsByFeed, t])

  return {
    handlePostReaction,
  }
}
