import { useMemo, useState } from 'react'
import {
  MessageSquare,
  Plus,
  Rss,
  Search as SearchIcon,
  Sparkles,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { NotificationsDropdown } from '@/components/notifications-dropdown'
import { cn } from '@/lib/utils'

type ReactionId =
  | 'like'
  | 'dislike'
  | 'laugh'
  | 'amazed'
  | 'love'
  | 'sad'
  | 'angry'
  | 'agree'
  | 'disagree'

type ReactionCounts = Record<ReactionId, number>

type FeedSummary = {
  id: string
  name: string
  description: string
  tags: string[]
  owner: string
  subscribers: number
  unreadPosts: number
  lastActive: string
  isSubscribed: boolean
}

type FeedComment = {
  id: string
  author: string
  avatar?: string
  createdAt: string
  body: string
  reactions: ReactionCounts
  userReaction?: ReactionId | null
  replies?: FeedComment[]
}

type FeedPost = {
  id: string
  feedId: string
  title: string
  author: string
  role: string
  avatar?: string
  createdAt: string
  body: string
  tags?: string[]
  reactions: ReactionCounts
  userReaction?: ReactionId | null
  comments: FeedComment[]
}

const reactionOptions: { id: ReactionId; label: string; emoji: string }[] = [
  { id: 'like', label: 'Like', emoji: '👍' },
  { id: 'dislike', label: 'Dislike', emoji: '👎' },
  { id: 'laugh', label: 'Laugh', emoji: '😂' },
  { id: 'amazed', label: 'Amazed', emoji: '😮' },
  { id: 'love', label: 'Love', emoji: '😍' },
  { id: 'sad', label: 'Sad', emoji: '😢' },
  { id: 'angry', label: 'Angry', emoji: '😡' },
  { id: 'agree', label: 'Agree', emoji: '🤝' },
  { id: 'disagree', label: 'Disagree', emoji: '🙅' },
]

const createReactionCounts = (
  preset: Partial<ReactionCounts> = {}
): ReactionCounts => {
  return reactionOptions.reduce((acc, option) => {
    acc[option.id] = preset[option.id] ?? 0
    return acc
  }, {} as ReactionCounts)
}

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

const initials = (value: string) =>
  value
    .split(' ')
    .map((part) => part.slice(0, 1) || '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

const countReactions = (counts: ReactionCounts) =>
  Object.values(counts).reduce((acc, value) => acc + value, 0)

const countComments = (comments: FeedComment[]): number => {
  return comments.reduce((total, comment) => {
    const replies = comment.replies ? countComments(comment.replies) : 0
    return total + 1 + replies
  }, 0)
}

const sumCommentReactions = (comments: FeedComment[]): number => {
  return comments.reduce((total, comment) => {
    const replies = comment.replies ? sumCommentReactions(comment.replies) : 0
    return total + countReactions(comment.reactions) + replies
  }, 0)
}

const randomId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`

export function FeedsDashboard() {
  const [feeds, setFeeds] = useState(initialFeeds)
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(
    initialFeeds[0]?.id ?? null
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateFeedOpen, setIsCreateFeedOpen] = useState(false)
  const [newFeedForm, setNewFeedForm] = useState({ name: '', description: '', tags: '' })
  const [postsByFeed, setPostsByFeed] = useState(initialPosts)
  const [newPostForm, setNewPostForm] = useState({ title: '', body: '' })
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})

  const selectedFeed = useMemo(
    () => feeds.find((feed) => feed.id === selectedFeedId) ?? null,
    [feeds, selectedFeedId]
  )

  const filteredFeeds = useMemo(() => {
    if (!searchTerm.trim()) return feeds
    const term = searchTerm.toLowerCase()
    return feeds.filter((feed) => {
      return (
        feed.name.toLowerCase().includes(term) ||
        feed.description.toLowerCase().includes(term) ||
        feed.tags.some((tag) => tag.toLowerCase().includes(term))
      )
    })
  }, [feeds, searchTerm])

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

  const handleCreateFeed = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!newFeedForm.name.trim()) return

    const tags = newFeedForm.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    const feed: FeedSummary = {
      id: randomId('feed'),
      name: newFeedForm.name.trim(),
      description:
        newFeedForm.description.trim() || 'Share updates and decisions in one place.',
      tags: tags.length ? tags : ['General'],
      owner: 'You',
      subscribers: 1,
      unreadPosts: 0,
      lastActive: 'Just now',
      isSubscribed: true,
    }

    setFeeds((current) => [feed, ...current])
    setSelectedFeedId(feed.id)
    setPostsByFeed((current) => ({ ...current, [feed.id]: [] }))
    setNewFeedForm({ name: '', description: '', tags: '' })
    setIsCreateFeedOpen(false)
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
          <Dialog open={isCreateFeedOpen} onOpenChange={setIsCreateFeedOpen}>
            <DialogTrigger asChild>
              <Button size='sm'>
                <Plus className='size-4' />
                Create feed
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a new feed</DialogTitle>
                <DialogDescription>
                  Curate updates for a team, project, or initiative. Connect it to Mochi services later.
                </DialogDescription>
              </DialogHeader>
              <form className='space-y-4' onSubmit={handleCreateFeed}>
                <div className='space-y-2'>
                  <Label htmlFor='feed-name'>Name</Label>
                  <Input
                    id='feed-name'
                    placeholder='Weekly delivery review'
                    value={newFeedForm.name}
                    onChange={(event) =>
                      setNewFeedForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='feed-description'>Description</Label>
                  <Textarea
                    id='feed-description'
                    rows={3}
                    placeholder='Describe the purpose of this feed'
                    value={newFeedForm.description}
                    onChange={(event) =>
                      setNewFeedForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='feed-tags'>Tags</Label>
                  <Input
                    id='feed-tags'
                    placeholder='engineering, release, weekly'
                    value={newFeedForm.tags}
                    onChange={(event) =>
                      setNewFeedForm((prev) => ({ ...prev, tags: event.target.value }))
                    }
                  />
                </div>
                <DialogFooter>
                  <Button type='button' variant='outline' onClick={() => setIsCreateFeedOpen(false)}>
                    Cancel
                  </Button>
                  <Button type='submit' disabled={!newFeedForm.name.trim()}>
                    Create feed
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className='grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]'>
          <Card>
            <CardContent className='space-y-4 p-4'>
              <div className='space-y-1'>
                <p className='text-sm font-semibold'>Feeds directory</p>
                <p className='text-xs text-muted-foreground'>Search, subscribe, or jump into any space.</p>
              </div>
              <div className='relative'>
                <SearchIcon className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  placeholder='Search feeds or tags'
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  className='pl-9'
                />
              </div>
              <ScrollArea className='h-[calc(100vh-320px)] pr-3'>
                <div className='space-y-3'>
                  {filteredFeeds.length === 0 ? (
                    <div className='flex flex-col items-center justify-center space-y-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                      <p>No feeds match that search.</p>
                      <p className='text-xs'>Try another keyword or create a feed.</p>
                    </div>
                  ) : (
                    filteredFeeds.map((feed) => (
                      <FeedListItem
                        key={feed.id}
                        feed={feed}
                        isActive={feed.id === selectedFeed?.id}
                        onSelect={(feedId) => setSelectedFeedId(feedId)}
                        onToggleSubscription={toggleSubscription}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className='space-y-6'>
            {selectedFeed ? (
              <>
                <Card>
                  <CardContent className='space-y-4 p-6'>
                    <div className='flex flex-wrap items-start justify-between gap-4'>
                      <div className='space-y-2'>
                        <div className='flex items-center gap-2'>
                          <Rss className='size-4 text-primary' />
                          <p className='text-lg font-semibold'>{selectedFeed.name}</p>
                        </div>
                        <p className='text-sm text-muted-foreground'>
                          {selectedFeed.description}
                        </p>
                        <div className='flex flex-wrap gap-2'>
                          {selectedFeed.tags.map((tag) => (
                            <Badge key={tag} variant='secondary'>
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        <p className='text-xs text-muted-foreground'>
                          Owned by <span className='font-medium'>{selectedFeed.owner}</span> · Last active {selectedFeed.lastActive}
                        </p>
                      </div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Badge variant='outline'>{selectedFeed.subscribers} subscribers</Badge>
                        <Button
                          size='sm'
                          variant={selectedFeed.isSubscribed ? 'secondary' : 'default'}
                          onClick={() => toggleSubscription(selectedFeed.id)}
                        >
                          {selectedFeed.isSubscribed ? 'Following' : 'Subscribe'}
                        </Button>
                      </div>
                    </div>
                    <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
                      {[
                        { label: 'Unread posts', value: selectedFeed.unreadPosts, icon: Rss },
                        { label: 'Active subscribers', value: selectedFeed.subscribers, icon: Users },
                        { label: 'Comments logged', value: totalComments, icon: MessageSquare },
                        { label: 'Reactions', value: totalReactions, icon: Sparkles },
                      ].map((stat) => (
                        <div key={stat.label} className='rounded-lg border bg-background p-3'>
                          <stat.icon className='mb-2 size-4 text-primary' />
                          <p className='text-xs text-muted-foreground'>{stat.label}</p>
                          <p className='text-lg font-semibold'>{stat.value}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className='space-y-4 p-6'>
                    <form className='space-y-4' onSubmit={handleCreatePost}>
                      <div className='space-y-2'>
                        <Label htmlFor='post-title'>Title</Label>
                        <Input
                          id='post-title'
                          placeholder='Share a milestone or question'
                          value={newPostForm.title}
                          onChange={(event) =>
                            setNewPostForm((prev) => ({ ...prev, title: event.target.value }))
                          }
                        />
                      </div>
                      <div className='space-y-2'>
                        <Label htmlFor='post-body'>Post</Label>
                        <Textarea
                          id='post-body'
                          rows={4}
                          placeholder='Write an update for this feed'
                          value={newPostForm.body}
                          onChange={(event) =>
                            setNewPostForm((prev) => ({ ...prev, body: event.target.value }))
                          }
                        />
                      </div>
                      <div className='flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground'>
                        <span>Everyone subscribed will receive this update.</span>
                        <Button type='submit' size='sm' disabled={!newPostForm.body.trim()}>
                          Publish update
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                {selectedFeedPosts.length === 0 ? (
                  <Card>
                    <CardContent className='flex flex-col items-center justify-center space-y-3 p-12 text-center'>
                      <Rss className='size-10 text-muted-foreground' />
                      <p className='text-sm font-semibold'>No posts yet</p>
                      <p className='text-sm text-muted-foreground'>Share an update above to start the conversation.</p>
                    </CardContent>
                  </Card>
                ) : (
                  selectedFeedPosts.map((post) => (
                    <Card key={post.id}>
                      <CardContent className='space-y-5 p-6'>
                        <div className='flex items-start justify-between gap-4'>
                          <div className='flex items-start gap-3'>
                            <Avatar className='size-10'>
                              <AvatarImage src={post.avatar} alt='' />
                              <AvatarFallback>{initials(post.author)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className='text-sm font-semibold'>{post.author}</p>
                              <p className='text-xs text-muted-foreground'>
                                {post.role} · {post.createdAt}
                              </p>
                            </div>
                          </div>
                          <div className='flex flex-wrap gap-2'>
                            {post.tags?.map((tag) => (
                              <Badge key={tag} variant='outline'>
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className='space-y-2'>
                          <p className='font-medium'>{post.title}</p>
                          <p className='text-sm leading-relaxed text-muted-foreground'>
                            {post.body}
                          </p>
                        </div>
                        <ReactionBar
                          counts={post.reactions}
                          activeReaction={post.userReaction}
                          onSelect={(reaction) => handlePostReaction(post.id, reaction)}
                        />
                        <div className='space-y-4 rounded-lg bg-muted/30 p-4'>
                          <div className='flex items-center justify-between text-sm text-muted-foreground'>
                            <span className='font-semibold'>Discussion ({countComments(post.comments)})</span>
                            <span>{post.comments.length} threads</span>
                          </div>
                          <div className='space-y-3'>
                            {post.comments.map((comment) => (
                              <CommentThread
                                key={comment.id}
                                comment={comment}
                                onReact={(commentId, reaction) =>
                                  handleCommentReaction(post.id, commentId, reaction)
                                }
                              />
                            ))}
                          </div>
                          <div className='space-y-2'>
                            <Label htmlFor={`comment-${post.id}`}>Add a comment</Label>
                            <Textarea
                              id={`comment-${post.id}`}
                              rows={3}
                              placeholder='Share feedback or a follow-up'
                              value={commentDrafts[post.id] ?? ''}
                              onChange={(event) =>
                                setCommentDrafts((prev) => ({
                                  ...prev,
                                  [post.id]: event.target.value,
                                }))
                              }
                            />
                            <div className='flex justify-end'>
                              <Button
                                type='button'
                                size='sm'
                                disabled={!commentDrafts[post.id]?.trim()}
                                onClick={() => handleAddComment(post.id)}
                              >
                                Post comment
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </>
            ) : (
              <Card>
                <CardContent className='flex flex-col items-center justify-center space-y-3 p-12 text-center'>
                  <Rss className='size-10 text-muted-foreground' />
                  <p className='text-sm font-semibold'>Select a feed to get started</p>
                  <p className='text-sm text-muted-foreground'>Choose a feed from the list to view posts, comments, and reactions.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </Main>
    </>
  )
}

type FeedListItemProps = {
  feed: FeedSummary
  isActive: boolean
  onSelect: (feedId: string) => void
  onToggleSubscription: (feedId: string) => void
}

function FeedListItem({ feed, isActive, onSelect, onToggleSubscription }: FeedListItemProps) {
  return (
    <button
      type='button'
      onClick={() => onSelect(feed.id)}
      className={cn(
        'w-full rounded-xl border p-4 text-start transition hover:border-primary hover:bg-primary/5',
        isActive && 'border-primary bg-primary/5'
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <div>
          <div className='flex items-center gap-2'>
            <Rss className='size-3.5 text-primary' />
            <p className='text-sm font-semibold'>{feed.name}</p>
            {feed.isSubscribed && (
              <Badge variant='secondary' className='text-[10px]'>
                Following
              </Badge>
            )}
          </div>
          <p className='mt-1 line-clamp-2 text-xs text-muted-foreground'>
            {feed.description}
          </p>
        </div>
        <Badge variant='outline'>{feed.unreadPosts} unread</Badge>
      </div>
      <div className='mt-3 flex flex-wrap gap-2'>
        {feed.tags.map((tag) => (
          <Badge key={tag} variant='outline' className='text-[10px]'>
            {tag}
          </Badge>
        ))}
      </div>
      <div className='mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'>
        <div className='flex flex-wrap items-center gap-4'>
          <span className='flex items-center gap-1'>
            <Users className='size-3.5' />
            {feed.subscribers} subs
          </span>
          <span>Last active {feed.lastActive}</span>
        </div>
        <Button
          size='sm'
          variant={feed.isSubscribed ? 'outline' : 'secondary'}
          onClick={(event) => {
            event.stopPropagation()
            onToggleSubscription(feed.id)
          }}
        >
          {feed.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
        </Button>
      </div>
    </button>
  )
}

type ReactionBarProps = {
  counts: ReactionCounts
  activeReaction?: ReactionId | null
  onSelect: (reaction: ReactionId) => void
}

function ReactionBar({ counts, activeReaction, onSelect }: ReactionBarProps) {
  return (
    <div className='flex flex-wrap gap-2'>
      {reactionOptions.map((reaction) => {
        const count = counts[reaction.id] ?? 0
        const isActive = activeReaction === reaction.id
        return (
          <Button
            key={reaction.id}
            type='button'
            size='sm'
            variant={isActive ? 'default' : 'outline'}
            className='h-8 gap-1 px-2 text-xs'
            aria-label={`${reaction.label} (${count})`}
            onClick={() => onSelect(reaction.id)}
          >
            <span aria-hidden='true' role='img'>
              {reaction.emoji}
            </span>
            <span>{count}</span>
          </Button>
        )
      })}
    </div>
  )
}

type CommentThreadProps = {
  comment: FeedComment
  onReact: (commentId: string, reaction: ReactionId) => void
}

function CommentThread({ comment, onReact }: CommentThreadProps) {
  return (
    <div className='space-y-3 rounded-lg border bg-card/50 p-4'>
      <div className='flex items-start gap-3'>
        <Avatar className='size-9'>
          <AvatarImage src={comment.avatar} alt='' />
          <AvatarFallback>{initials(comment.author)}</AvatarFallback>
        </Avatar>
        <div>
          <p className='text-sm font-semibold'>{comment.author}</p>
          <p className='text-xs text-muted-foreground'>{comment.createdAt}</p>
        </div>
      </div>
      <p className='text-sm text-muted-foreground'>{comment.body}</p>
      <ReactionBar
        counts={comment.reactions}
        activeReaction={comment.userReaction}
        onSelect={(reaction) => onReact(comment.id, reaction)}
      />
      {comment.replies?.length ? (
        <div className='space-y-3 border-l pl-4'>
          {comment.replies.map((reply) => (
            <CommentThread key={reply.id} comment={reply} onReact={onReact} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function updateCommentTree(
  comments: FeedComment[],
  targetId: string,
  updater: (comment: FeedComment) => FeedComment
): FeedComment[] {
  let changed = false

  const next = comments.map<FeedComment>((comment) => {
    if (comment.id === targetId) {
      changed = true
      return updater(comment)
    }
    if (comment.replies?.length) {
      const replies = updateCommentTree(comment.replies, targetId, updater)
      if (replies !== comment.replies) {
        changed = true
        return { ...comment, replies }
      }
    }
    return comment
  })

  return changed ? next : comments
}

const applyReaction = (
  counts: ReactionCounts,
  currentReaction: ReactionId | null | undefined,
  reaction: ReactionId
) => {
  const updated: ReactionCounts = { ...counts }
  let nextReaction = currentReaction ?? null

  if (currentReaction === reaction) {
    updated[reaction] = Math.max(0, (updated[reaction] ?? 0) - 1)
    nextReaction = null
  } else {
    if (currentReaction) {
      updated[currentReaction] = Math.max(0, (updated[currentReaction] ?? 0) - 1)
    }
    updated[reaction] = (updated[reaction] ?? 0) + 1
    nextReaction = reaction
  }

  return { reactions: updated, userReaction: nextReaction }
}
