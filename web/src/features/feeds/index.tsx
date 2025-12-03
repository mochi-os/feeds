import { useMemo, useState } from 'react'
import { Rss } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { NotificationsDropdown } from '@/components/notifications-dropdown'
import { FeedDirectory } from './components/feed-directory'
import { FeedDetail } from './components/feed-detail'
import { NewPostDialog } from './components/new-post-dialog'
import { CreateFeedDialog } from './components/create-feed-dialog'
import { createReactionCounts } from './constants'
import {
  applyReaction,
  countComments,
  countReactions,
  randomId,
  sumCommentReactions,
  updateCommentTree,
} from './utils'
import { type FeedComment, type FeedPost, type FeedSummary, type ReactionId } from './types'

const initialFeeds: FeedSummary[] = [
  {
    id: 'eng-updates',
    name: 'Engineering Updates',
    description:
      'Nightly builds, rollout health, and incident reviews for the platform team.',
    tags: ['Engineering', 'Release'],
    owner: 'Leah Torres',
    subscribers: 142,
    unreadPosts: 3,
    lastActive: '3m ago',
    isSubscribed: true,
  },
  {
    id: 'design-lab',
    name: 'Design Lab',
    description:
      'High-fidelity concepts, prototypes, and weekly inspiration drops.',
    tags: ['Design', 'Inspiration'],
    owner: 'June Park',
    subscribers: 98,
    unreadPosts: 1,
    lastActive: '25m ago',
    isSubscribed: true,
  },
  {
    id: 'community-ideas',
    name: 'Community Ideas',
    description: 'Customer requests surface weekly from support and success teams.',
    tags: ['Feedback', 'Community'],
    owner: 'Support Crew',
    subscribers: 67,
    unreadPosts: 5,
    lastActive: '1h ago',
    isSubscribed: false,
  },
  {
    id: 'field-notes',
    name: 'Field Notes',
    description: 'On-site deployment learnings and integration playbooks.',
    tags: ['Operations'],
    owner: 'Field Ops',
    subscribers: 31,
    unreadPosts: 0,
    lastActive: 'Yesterday',
    isSubscribed: false,
  },
]

const initialPosts: Record<string, FeedPost[]> = {
  'eng-updates': [
    {
      id: 'eng-post-1',
      feedId: 'eng-updates',
      title: 'Nightly build #2419 is green again',
      author: 'Leah Torres',
      role: 'Platform Lead',
      createdAt: 'Today · 08:45',
      body: 'Nightly #2419 cleared the flaky payments job. We merged the queue retry guard and re-enabled warm nodes for EU-West. Please keep an eye on CPU spikes while traffic rolls forward.',
      tags: ['Release'],
      reactions: createReactionCounts({ like: 12, love: 4, agree: 3 }),
      userReaction: 'like',
      comments: [
        {
          id: 'eng-comment-1',
          author: 'Zoe Finch',
          createdAt: '10m ago',
          body: 'Validated the build on QA and the new logging matches spec. Release notes ready.',
          reactions: createReactionCounts({ like: 3, agree: 1 }),
          replies: [
            {
              id: 'eng-comment-1-1',
              author: 'Marco Vega',
              createdAt: '5m ago',
              body: 'Drafting the notes now. Including the retry guard screenshot.',
              reactions: createReactionCounts({ love: 1 }),
            },
          ],
        },
        {
          id: 'eng-comment-2',
          author: 'Priya Shah',
          createdAt: 'Just now',
          body: 'Mobile team confirmed the patch works on beta. Scheduling prod rollout for 3 PM PT.',
          reactions: createReactionCounts({ like: 2, laugh: 1 }),
        },
      ],
    },
    {
      id: 'eng-post-2',
      feedId: 'eng-updates',
      title: 'Incident review draft posted',
      author: 'Ibrahim Musa',
      role: 'SRE',
      createdAt: 'Yesterday · 17:20',
      body: 'Posted the post-incident review for the cache saturation event. One runaway backup process dropped hit-rate 23%. Includes mitigation checklist and pager rotation updates.',
      tags: ['Postmortem'],
      reactions: createReactionCounts({ like: 8, agree: 5, sad: 1 }),
      comments: [
        {
          id: 'eng-comment-3',
          author: 'Mira Chen',
          createdAt: '18h ago',
          body: 'Thanks for capturing the pager tweaks. Adding a follow-up to instrument weigher metrics.',
          reactions: createReactionCounts({ love: 2, agree: 2 }),
        },
      ],
    },
  ],
  'design-lab': [
    {
      id: 'design-post-1',
      feedId: 'design-lab',
      title: 'Navigation revamp prototype is ready',
      author: 'June Park',
      role: 'Product Designer',
      createdAt: 'Today · 09:10',
      body: 'Full click-through of the navigation revamp is live. Focused on readability, quicker access to feeds, and subtle cues for unread items.',
      tags: ['Prototype'],
      reactions: createReactionCounts({ love: 9, like: 11, amazed: 2 }),
      comments: [
        {
          id: 'design-comment-1',
          author: 'Nico Reyes',
          createdAt: 'Just now',
          body: 'Motion feels great. Suggest reducing the delay on the notification pill glow.',
          reactions: createReactionCounts({ like: 2 }),
        },
      ],
    },
  ],
  'community-ideas': [
    {
      id: 'community-post-1',
      feedId: 'community-ideas',
      title: 'Top-requested filters from the week',
      author: 'Support Crew',
      role: 'Advocacy',
      createdAt: 'Yesterday · 14:00',
      body: 'Biggest asks: saved filters for search, being able to pin feeds for teams, and a lighter mobile widget. Full list linked in the doc.',
      tags: ['Feedback'],
      reactions: createReactionCounts({ agree: 7, like: 4, love: 1 }),
      comments: [
        {
          id: 'community-comment-1',
          author: 'Avery Holt',
          createdAt: '21h ago',
          body: 'Pinned feeds align with navigation revamp. We can prototype next sprint.',
          reactions: createReactionCounts({ like: 2, agree: 2 }),
        },
      ],
    },
  ],
  'field-notes': [],
}

export function Feeds() {
  const [feeds, setFeeds] = useState(initialFeeds)
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(
    initialFeeds[0]?.id ?? null
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [postsByFeed, setPostsByFeed] = useState(initialPosts)
  const [newPostForm, setNewPostForm] = useState({ title: '', body: '' })
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})

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

  const toggleSubscription = (feedId: string) => {
    setFeeds((current) =>
      current.map((feed) => {
        if (feed.id !== feedId) return feed
        const isSubscribed = !feed.isSubscribed
        const subscribers = Math.max(0, feed.subscribers + (isSubscribed ? 1 : -1))
        return { ...feed, isSubscribed, subscribers }
      })
    )
  }

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
  }

  const handleCreateFeed = ({ name, allowSearch }: { name: string; allowSearch: boolean }) => {
    if (!name.trim()) return

    const feed: FeedSummary = {
      id: randomId('feed'),
      name: name.trim(),
      description: 'Share updates and decisions in one place.',
      tags: ['General'],
      owner: 'You',
      subscribers: 1,
      unreadPosts: 0,
      lastActive: 'Just now',
      isSubscribed: true,
      allowSearch,
    }

    setFeeds((current) => [feed, ...current])
    setSelectedFeedId(feed.id)
    setPostsByFeed((current) => ({ ...current, [feed.id]: [] }))
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
  }

  const handlePostReaction = (postId: string, reaction: ReactionId) => {
    if (!selectedFeed) return
    setPostsByFeed((current) => {
      const posts = current[selectedFeed.id] ?? []
      const updated = posts.map((post) =>
        post.id === postId
          ? { ...post, ...applyReaction(post.reactions, post.userReaction, reaction) }
          : post
      )
      return { ...current, [selectedFeed.id]: updated }
    })
  }

  const handleCommentReaction = (
    postId: string,
    commentId: string,
    reaction: ReactionId
  ) => {
    if (!selectedFeed) return
    setPostsByFeed((current) => {
      const posts = current[selectedFeed.id] ?? []
      const updated = posts.map((post) => {
        if (post.id !== postId) return post
        const comments = updateCommentTree(post.comments, commentId, (comment) => ({
          ...comment,
          ...applyReaction(comment.reactions, comment.userReaction, reaction),
        }))
        return { ...post, comments }
      })
      return { ...current, [selectedFeed.id]: updated }
    })
  }

  return (
    <>
      <Header>
        <Search />
        <div className='ms-auto flex items-center space-x-4'>
          <NotificationsDropdown />
        </div>
      </Header>

      <Main className='space-y-6 pb-10'>
        <div className='flex flex-wrap items-center justify-between gap-4'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-bold tracking-tight'>Feeds</h1>
            <p className='text-sm text-muted-foreground'>
              Organize long-form updates and follow the feeds that matter most.
            </p>
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
