import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Rss } from 'lucide-react'
import { Card, CardContent, Main } from '@mochi/common'
import feedsApi from '@/api/feeds'


import { FeedDirectory } from './components/feed-directory'
import { FeedDetail } from './components/feed-detail'
import { NewPostDialog } from './components/new-post-dialog'
import { CreateFeedDialog } from './components/create-feed-dialog'
import { createReactionCounts } from './constants'
import { mapFeedsToSummaries, mapPosts } from './api/adapters'
import {
  applyReaction,
  countComments,
  countReactions,
  randomId,
  sumCommentReactions,
  updateCommentTree,
} from './utils'
import { type FeedComment, type FeedPost, type FeedSummary, type ReactionId } from './types'
import type { Feed } from '@/api/types/feeds'

const groupPostsByFeed = (posts: FeedPost[]): Record<string, FeedPost[]> => {
  return posts.reduce<Record<string, FeedPost[]>>((acc, post) => {
    acc[post.feedId] = acc[post.feedId] ? [...acc[post.feedId], post] : [post]
    return acc
  }, {})
}

export function Feeds() {
  const [feeds, setFeeds] = useState<FeedSummary[]>([])
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [postsByFeed, setPostsByFeed] = useState<Record<string, FeedPost[]>>({})
  const [newPostForm, setNewPostForm] = useState({ title: '', body: '' })
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(false)
  const [loadingFeedId, setLoadingFeedId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refreshFeedsFromApi = useCallback(async () => {
    setIsLoadingFeeds(true)
    try {
      const response = await feedsApi.view()
      if (!mountedRef.current) {
        return
      }
      const data = response.data ?? {}
      // Create a set of subscribed feed IDs from the feeds array
      const subscribedFeedIds = new Set(data.feeds?.map((feed) => feed.id) ?? [])
      const mappedFeeds = mapFeedsToSummaries(data.feeds, subscribedFeedIds)
      // Only map feed if it has an id (it might be a minimal object with only name)
      const currentFeedSummary =
        data.feed && 'id' in data.feed && data.feed.id
          ? mapFeedsToSummaries([data.feed as Feed], subscribedFeedIds)[0]
          : undefined
      const dedupedFeeds = [
        ...(currentFeedSummary ? [currentFeedSummary] : []),
        ...mappedFeeds,
      ].reduce<FeedSummary[]>((acc, feed) => {
        if (!acc.some((item) => item.id === feed.id)) {
          acc.push(feed)
        }
        return acc
      }, [])
      setFeeds(dedupedFeeds)
      setSelectedFeedId((current) => {
        if (current && dedupedFeeds.some((feed) => feed.id === current)) {
          return current
        }
        return dedupedFeeds[0]?.id ?? null
      })
      const mappedPosts = mapPosts(data.posts)
      const grouped = groupPostsByFeed(mappedPosts)
      setPostsByFeed(grouped)
      setErrorMessage(null)
    } catch (error) {
      if (!mountedRef.current) {
        return
      }
      console.error('[Feeds] Failed to load feeds', error)
      setErrorMessage('Unable to sync with the feeds service. Showing cached data.')
    } finally {
      if (mountedRef.current) {
        setIsLoadingFeeds(false)
      }
    }
  }, [])

  useEffect(() => {
    void refreshFeedsFromApi()
  }, [refreshFeedsFromApi])

  const loadPostsForFeed = useCallback(async (feedId: string) => {
    setLoadingFeedId(feedId)
    try {
      const response = await feedsApi.view({ feed: feedId })
      if (!mountedRef.current) {
        return
      }
      const data = response.data ?? {}
      const mappedPosts = mapPosts(data.posts)
      setPostsByFeed((current) => ({ ...current, [feedId]: mappedPosts }))
      setErrorMessage(null)
    } catch (error) {
      if (!mountedRef.current) {
        return
      }
      console.error('[Feeds] Failed to load posts', error)
      setErrorMessage('Unable to load posts for this feed right now.')
    } finally {
      if (mountedRef.current) {
        setLoadingFeedId((current) => (current === feedId ? null : current))
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedFeedId) {
      return
    }
    void loadPostsForFeed(selectedFeedId)
  }, [selectedFeedId, loadPostsForFeed])

  const selectedFeed = useMemo(
    () => feeds.find((feed) => feed.id === selectedFeedId) ?? null,
    [feeds, selectedFeedId]
  )

  const selectedFeedPosts = useMemo(() => {
    if (!selectedFeed) return []
    return postsByFeed[selectedFeed.id] ?? []
  }, [postsByFeed, selectedFeed])

  const totalComments = useMemo(
    () => selectedFeedPosts.reduce((acc, post) => acc + countComments(post.comments), 0),
    [selectedFeedPosts]
  )

  const totalReactions = useMemo(
    () =>
      selectedFeedPosts.reduce(
        (acc, post) => acc + countReactions(post.reactions) + sumCommentReactions(post.comments),
        0
      ),
    [selectedFeedPosts]
  )

  const isSelectedFeedLoading = selectedFeed ? loadingFeedId === selectedFeed.id : false

  const toggleSubscription = useCallback(
    async (feedId: string) => {
      // Validate feedId is not undefined or empty
      if (!feedId) {
        console.error('[Feeds] Cannot toggle subscription: feedId is undefined or empty')
        return
      }
      const targetFeed = feeds.find((feed) => feed.id === feedId)
      if (!targetFeed || targetFeed.isOwner) {
        return
      }
      const wasSubscribed = targetFeed.isSubscribed
      const originalSubscribers = targetFeed.subscribers

      // Optimistic update
      setFeeds((current) =>
        current.map((feed) => {
          if (feed.id !== feedId) return feed
          const isSubscribed = !feed.isSubscribed
          const subscribers = Math.max(
            0,
            originalSubscribers + (isSubscribed ? 1 : -1)
          )
          return { ...feed, isSubscribed, subscribers }
        })
      )

      try {
        const response = wasSubscribed
          ? await feedsApi.unsubscribe({ feed: feedId })
          : await feedsApi.subscribe({ feed: feedId })

        if (!mountedRef.current) {
          return
        }

        const data = response.data ?? {}
        // Create a set of subscribed feed IDs from the response
        const subscribedFeedIds = new Set(data.feeds?.map((feed) => feed.id) ?? [])

        // Update feeds from response
        // Only include feed if it has an id (it might be a minimal object with only name)
        if (data.feeds || (data.feed && 'id' in data.feed && data.feed.id)) {
          const allFeedsFromResponse = [
            ...(data.feed && 'id' in data.feed && data.feed.id ? [data.feed as Feed] : []),
            ...(data.feeds ?? []),
          ]
          const mappedFeeds = mapFeedsToSummaries(allFeedsFromResponse, subscribedFeedIds)

          setFeeds((current) => {
            const updatedFeeds = new Map(current.map((feed) => [feed.id, feed]))

            // Update or add feeds from response
            mappedFeeds.forEach((mappedFeed) => {
              updatedFeeds.set(mappedFeed.id, mappedFeed)
            })

            // Update subscription status for feeds not in response but in current list
            updatedFeeds.forEach((feed, id) => {
              if (!mappedFeeds.some((f) => f.id === id)) {
                // Feed not in response - check if it should be unsubscribed
                if (id === feedId) {
                  // This is the feed we just toggled
                  const feedIsOwner = feed.isOwner ?? false
                  const isSubscribed: boolean = subscribedFeedIds.has(id) || feedIsOwner
                  updatedFeeds.set(id, {
                    ...feed,
                    isSubscribed,
                    subscribers: data.feed?.subscribers ?? feed.subscribers,
                  })
                }
              }
            })

            return Array.from(updatedFeeds.values())
          })
        }

        // Update posts if provided in response
        if (data.posts) {
          const mappedPosts = mapPosts(data.posts)
          const grouped = groupPostsByFeed(mappedPosts)
          setPostsByFeed((current) => ({ ...current, ...grouped }))
        }

        setErrorMessage(null)
      } catch (error) {
        if (!mountedRef.current) {
          return
        }
        console.error('[Feeds] Failed to toggle subscription', error)
        // Revert optimistic update on error
        setFeeds((current) =>
          current.map((feed) =>
            feed.id === feedId
              ? {
                ...feed,
                isSubscribed: wasSubscribed,
                subscribers: originalSubscribers,
              }
              : feed
          )
        )
        setErrorMessage('Failed to update subscription. Please try again.')
      }
    },
    [feeds]
  )

  const handleLegacyDialogPost = ({
    feedId,
    body,
  }: {
    feedId: string
    body: string
    attachment: File | null
  }) => {
    const targetFeed = feeds.find((feed) => feed.id === feedId)
    if (!targetFeed || !body.trim()) return

    const post: FeedPost = {
      id: randomId('post'),
      feedId: targetFeed.id,
      title: `${targetFeed.name} update`,
      author: 'You',
      role: 'Feed Owner',
      createdAt: 'Just now',
      body: body.trim(),
      tags: targetFeed.tags.slice(0, 1),
      reactions: createReactionCounts(),
      userReaction: null,
      comments: [],
    }

    setPostsByFeed((current) => ({
      ...current,
      [targetFeed.id]: [post, ...(current[targetFeed.id] ?? [])],
    }))

    setFeeds((current) =>
      current.map((feed) =>
        feed.id === targetFeed.id
          ? { ...feed, unreadPosts: feed.unreadPosts + 1, lastActive: 'Just now' }
          : feed
      )
    )

    setSelectedFeedId(targetFeed.id)

    void (async () => {
      try {
        await feedsApi.createPost({ feed: targetFeed.id, body: body.trim() })
        await loadPostsForFeed(targetFeed.id)
      } catch (error) {
        console.error('[Feeds] Failed to publish post', error)
      }
    })()
  }

  const handleCreateFeed = ({ name, allowSearch }: { name: string; allowSearch: boolean }) => {
    const trimmedName = name.trim()
    if (!trimmedName) return

    const feed: FeedSummary = {
      id: randomId('feed'),
      name: trimmedName,
      description: 'Share updates and decisions in one place.',
      tags: ['General'],
      owner: 'You',
      subscribers: 1,
      unreadPosts: 0,
      lastActive: 'Just now',
      isSubscribed: true,
      allowSearch,
      isOwner: true,
    }

    setFeeds((current) => [feed, ...current])
    setSelectedFeedId(feed.id)
    setPostsByFeed((current) => ({ ...current, [feed.id]: [] }))

    void (async () => {
      try {
        await feedsApi.create({
          name: trimmedName,
          privacy: allowSearch ? 'public' : 'private',
        })
        await refreshFeedsFromApi()
      } catch (error) {
        console.error('[Feeds] Failed to create feed', error)
      }
    })()
  }

  const handleCreatePost = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedFeed || !newPostForm.body.trim()) return

    const post: FeedPost = {
      id: randomId('post'),
      feedId: selectedFeed.id,
      title: newPostForm.title.trim() || 'Untitled update',
      author: 'You',
      role: 'Feed Owner',
      createdAt: 'Just now',
      body: newPostForm.body.trim(),
      tags: selectedFeed.tags.slice(0, 1),
      reactions: createReactionCounts(),
      userReaction: null,
      comments: [],
    }

    setPostsByFeed((current) => ({
      ...current,
      [selectedFeed.id]: [post, ...(current[selectedFeed.id] ?? [])],
    }))

    setFeeds((current) =>
      current.map((feed) =>
        feed.id === selectedFeed.id
          ? { ...feed, unreadPosts: feed.unreadPosts + 1, lastActive: 'Just now' }
          : feed
      )
    )

    void (async () => {
      try {
        await feedsApi.createPost({ feed: selectedFeed.id, body: newPostForm.body.trim() })
        await loadPostsForFeed(selectedFeed.id)
      } catch (error) {
        console.error('[Feeds] Failed to create post', error)
      }
    })()

    setNewPostForm({ title: '', body: '' })
  }

  const handleAddComment = (postId: string) => {
    if (!selectedFeed) return
    const draft = commentDrafts[postId]?.trim()
    if (!draft) return

    const comment: FeedComment = {
      id: randomId('comment'),
      author: 'You',
      createdAt: 'Just now',
      body: draft,
      reactions: createReactionCounts(),
      userReaction: null,
      replies: [],
    }

    setPostsByFeed((current) => {
      const posts = current[selectedFeed.id] ?? []
      const updated = posts.map((post) =>
        post.id === postId
          ? { ...post, comments: [comment, ...post.comments] }
          : post
      )
      return { ...current, [selectedFeed.id]: updated }
    })

    setFeeds((current) =>
      current.map((feed) =>
        feed.id === selectedFeed.id ? { ...feed, lastActive: 'Just now' } : feed
      )
    )

    setCommentDrafts((current) => ({ ...current, [postId]: '' }))

    void (async () => {
      try {
        await feedsApi.createComment({
          feed: selectedFeed.id,
          post: postId,
          body: draft,
        })
        await loadPostsForFeed(selectedFeed.id)
      } catch (error) {
        console.error('[Feeds] Failed to create comment', error)
      }
    })()
  }

  const handlePostReaction = (postId: string, reaction: ReactionId) => {
    if (!selectedFeed) return
    let nextReaction: ReactionId | null | undefined
    setPostsByFeed((current) => {
      const posts = current[selectedFeed.id] ?? []
      const updated = posts.map((post) =>
        post.id === postId
          ? (() => {
            const outcome = applyReaction(post.reactions, post.userReaction, reaction)
            nextReaction = outcome.userReaction ?? null
            return { ...post, ...outcome }
          })()
          : post
      )
      return { ...current, [selectedFeed.id]: updated }
    })

    if (nextReaction !== undefined) {
      const payload = nextReaction ?? ''
      void feedsApi
        .reactToPost({ post: postId, reaction: payload })
        .catch((error) => {
          console.error('[Feeds] Failed to react to post', error)
        })
    }
  }

  const handleCommentReaction = (
    postId: string,
    commentId: string,
    reaction: ReactionId
  ) => {
    if (!selectedFeed) return
    let nextReaction: ReactionId | null | undefined
    setPostsByFeed((current) => {
      const posts = current[selectedFeed.id] ?? []
      const updated = posts.map((post) => {
        if (post.id !== postId) return post
        const comments = updateCommentTree(post.comments, commentId, (comment) => ({
          ...comment,
          ...(() => {
            const outcome = applyReaction(comment.reactions, comment.userReaction, reaction)
            nextReaction = outcome.userReaction ?? null
            return outcome
          })(),
        }))
        return { ...post, comments }
      })
      return { ...current, [selectedFeed.id]: updated }
    })

    if (nextReaction !== undefined) {
      const payload = nextReaction ?? ''
      void feedsApi
        .reactToComment({ comment: commentId, reaction: payload })
        .catch((error) => {
          console.error('[Feeds] Failed to react to comment', error)
        })
    }
  }

  return (
    <>


      <Main className='space-y-6 pb-10'>
        {errorMessage ? (
          <Card className='border-destructive/30 bg-destructive/5 shadow-none'>
            <CardContent className='p-4 text-sm text-destructive'>{errorMessage}</CardContent>
          </Card>
        ) : null}
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-bold tracking-tight'>Feeds</h1>
            <p className='text-sm text-muted-foreground'>
              Organize long-form updates and follow the feeds that matter most.
            </p>
            {isLoadingFeeds ? (
              <p className='text-xs text-muted-foreground'>Syncing the latest updates…</p>
            ) : null}
          </div>
          <div className='flex items-center gap-2'>
            <NewPostDialog feeds={feeds} onSubmit={handleLegacyDialogPost} />
            <CreateFeedDialog onCreate={handleCreateFeed} />
          </div>
        </div>

        <div className='grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]'>
          <div className='h-[calc(100vh-2rem)] lg:sticky lg:top-4'>
            <FeedDirectory
              feeds={feeds}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              selectedFeedId={selectedFeed?.id ?? null}
              onSelectFeed={(feedId) => setSelectedFeedId(feedId)}
              onToggleSubscription={toggleSubscription}
            />
          </div>

          <section className='min-w-0 space-y-6'>
            {selectedFeed ? (
              <FeedDetail
                feed={selectedFeed}
                posts={selectedFeedPosts}
                totalComments={totalComments}
                totalReactions={totalReactions}
                isLoadingPosts={isSelectedFeedLoading}
                composer={newPostForm}
                onTitleChange={(value) =>
                  setNewPostForm((prev) => ({ ...prev, title: value }))
                }
                onBodyChange={(value) =>
                  setNewPostForm((prev) => ({ ...prev, body: value }))
                }
                onSubmitPost={handleCreatePost}
                commentDrafts={commentDrafts}
                onDraftChange={(postId, value) =>
                  setCommentDrafts((prev) => ({ ...prev, [postId]: value }))
                }
                onAddComment={handleAddComment}
                onPostReaction={handlePostReaction}
                onCommentReaction={handleCommentReaction}
                onToggleSubscription={toggleSubscription}
              />
            ) : (
              <Card className='shadow-md'>
                <CardContent className='flex flex-col items-center justify-center space-y-3 p-12 text-center'>
                  <div className='rounded-full bg-primary/10 p-4'>
                    <Rss className='size-10 text-primary' />
                  </div>
                  <p className='text-sm font-semibold'>Select a feed to get started</p>
                  <p className='text-sm text-muted-foreground'>Choose a feed from the list to view posts, comments, and reactions.</p>
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </Main>
    </>
  )
}
