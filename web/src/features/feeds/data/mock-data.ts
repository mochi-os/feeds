import { createReactionCounts } from '../constants'
import type { FeedComment, FeedPost, FeedSummary } from '../types'

export const mockFeeds: FeedSummary[] = [
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
    description:
      'Customer requests surface weekly from support and success teams.',
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

const makeComment = (partial: Partial<FeedComment>): FeedComment => ({
  id: partial.id ?? '',
  author: partial.author ?? 'Commenter',
  createdAt: partial.createdAt ?? 'Just now',
  body: partial.body ?? '',
  reactions: partial.reactions ?? createReactionCounts(),
  userReaction: partial.userReaction,
  replies: partial.replies,
})

export const mockPosts: Record<string, FeedPost[]> = {
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
        makeComment({
          id: 'eng-comment-1',
          author: 'Zoe Finch',
          createdAt: '10m ago',
          body: 'Validated the build on QA and the new logging matches spec. Release notes ready.',
          reactions: createReactionCounts({ like: 3, agree: 1 }),
          replies: [
            makeComment({
              id: 'eng-comment-1-1',
              author: 'Marco Vega',
              createdAt: '5m ago',
              body: 'Drafting the notes now. Including the retry guard screenshot.',
              reactions: createReactionCounts({ love: 1 }),
            }),
          ],
        }),
        makeComment({
          id: 'eng-comment-2',
          author: 'Priya Shah',
          createdAt: 'Just now',
          body: 'Mobile team confirmed the patch works on beta. Scheduling prod rollout for 3 PM PT.',
          reactions: createReactionCounts({ like: 2, laugh: 1 }),
        }),
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
        makeComment({
          id: 'eng-comment-3',
          author: 'Mira Chen',
          createdAt: '18h ago',
          body: 'Thanks for capturing the pager tweaks. Adding a follow-up to instrument weigher metrics.',
          reactions: createReactionCounts({ love: 2, agree: 2 }),
        }),
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
        makeComment({
          id: 'design-comment-1',
          author: 'Nico Reyes',
          createdAt: 'Just now',
          body: 'Motion feels great. Suggest reducing the delay on the notification pill glow.',
          reactions: createReactionCounts({ like: 2 }),
        }),
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
        makeComment({
          id: 'community-comment-1',
          author: 'Avery Holt',
          createdAt: '21h ago',
          body: 'Pinned feeds align with navigation revamp. We can prototype next sprint.',
          reactions: createReactionCounts({ like: 2, agree: 2 }),
        }),
      ],
    },
  ],
  'field-notes': [],
}
