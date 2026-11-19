// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
import { path } from '@mochi/web'

// Endpoints are relative to baseURL which is already set to /feeds/ in request.ts.
// Every value goes in through path, as one encoded segment: a feed id comes
// from the address and a post or comment id from another server, and one
// holding a `/`, `?` or `..` would otherwise reach a different action. A value
// that cannot be one segment throws.
const endpoints = {
  // Cross-app endpoints (proxied via feeds backend)
  users: {
    search: '-/users/search',
  },
  groups: {
    list: '-/groups',
  },
  notifications: {
    feed: (feedId: string) => path`${feedId}/-/notifications`,
    feedClear: (feedId: string) => path`${feedId}/-/notifications/clear`,
    clear: '-/notifications/clear',
    feedSet: (feedId: string) => path`${feedId}/-/notifications/set`,
  },

  // Saved / read-later (class-level, per-user list spanning all feeds)
  saved: {
    list: '-/saved/list',
    add: '-/saved/add',
    remove: '-/saved/remove',
    clear: '-/saved/clear',
  },

  feeds: {
    // Class-level endpoints (no entity context)
    info: '-/info',
    // "All feeds" aggregate: posts merged across every subscribed feed,
    // paginated server-side (before/offset cursor) like a single feed.
    allPosts: '-/posts',
    create: '-/create',
    search: '-/directory/search',
    recommendations: '-/recommendations',
    probe: '-/probe',
    lookup: '-/lookup',
    subscribe: '-/subscribe',
    unsubscribe: '-/unsubscribe',

    // Entity-level endpoints (use /-/ separator)
    entityInfo: (feedId: string) => path`${feedId}/-/info`,
    share: (feedId: string) => path`${feedId}/-/share`,
    posts: (feedId: string) => path`${feedId}/-/posts`,
    delete: (feedId: string) => path`${feedId}/-/delete`,
    rename: (feedId: string) => path`${feedId}/-/rename`,
    privacy: (feedId: string) => path`${feedId}/-/privacy`,
    bannerGet: (feedId: string) => path`${feedId}/-/banner/get`,
    bannerSet: (feedId: string) => path`${feedId}/-/banner/set`,

    // Post actions
    post: {
      create: (feedId: string) => path`${feedId}/-/post/create`,
      image: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/image`,
      edit: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/edit`,
      delete: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/delete`,
      react: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/react`,
      follow: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/follow`,
      unfollow: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/unfollow`,
      // Phase 17: pinning, a vote in the post's poll, a boost from one of
      // the owner's hosted accounts
      pin: (feedId: string, postId: string) => path`${feedId}/-/${postId}/pin`,
      unpin: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/unpin`,
      vote: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/vote`,
      boost: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/boost`,
      unboost: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/unboost`,
    },

    // Read tracking
    postsRead: (feedId: string) => path`${feedId}/-/posts/read`,
    readAll: (feedId: string) => path`${feedId}/-/read-all`,
    // Class-level: mark every subscribed/owned feed read in one request.
    readAllAggregate: '-/read-all',

    // Comment actions
    comment: {
      create: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/comment/create`,
      edit: (feedId: string, postId: string, commentId: string) =>
        path`${feedId}/-/${postId}/${commentId}/edit`,
      delete: (feedId: string, postId: string, commentId: string) =>
        path`${feedId}/-/${postId}/${commentId}/delete`,
      react: (feedId: string, postId: string) =>
        path`${feedId}/-/${postId}/comment/react`,
      // The commenter's person assets; append the slot (avatar, style, ...).
      assets: (feedId: string, postId: string, commentId: string) =>
        path`${feedId}/-/${postId}/${commentId}/asset`,
      // The owner's moderation of a comment by a person on another network
      block: (feedId: string, postId: string, commentId: string) =>
        path`${feedId}/-/${postId}/${commentId}/block`,
      mute: (feedId: string, postId: string, commentId: string) =>
        path`${feedId}/-/${postId}/${commentId}/mute`,
      report: (feedId: string, postId: string, commentId: string) =>
        path`${feedId}/-/${postId}/${commentId}/report`,
    },

    // Member search (for @mention autocomplete)
    memberSearch: (feedId: string) => path`${feedId}/-/members/search`,

    // Subscriber roster, for the owner. Removal takes `member=<id>` and is the
    // only way to take someone off the fan-out and replay roster; access revoke
    // leaves both in place. A member on the fediverse is named by a URL, which
    // cannot be one segment, so memberAsset throws for them.
    members: (feedId: string) => path`${feedId}/-/members`,
    membersRemove: (feedId: string) => path`${feedId}/-/members/remove`,
    memberAsset: (feedId: string, user: string, asset: 'avatar' | 'style') =>
      path`${feedId}/-/members/${user}/asset/${asset}`,

    // Access control
    access: (feedId: string) => path`${feedId}/-/access`,
    accessSet: (feedId: string) => path`${feedId}/-/access/set`,
    accessRevoke: (feedId: string) => path`${feedId}/-/access/revoke`,

    // AI settings
    aiSettings: (feedId: string) => path`${feedId}/-/ai/settings`,
    aiPromptsGet: (feedId: string) => path`${feedId}/-/ai/prompts/get`,
    aiPromptsSet: (feedId: string) => path`${feedId}/-/ai/prompts/set`,

    // Tags
    postTagsAdd: (feedId: string, postId: string) =>
      path`${feedId}/-/${postId}/tags/add`,

    // Interest scoring
    tagInterest: (feedId: string) => path`${feedId}/-/tags/interest`,

    // Sources
    sources: (feedId: string) => path`${feedId}/-/sources`,
    sourcesAdd: (feedId: string) => path`${feedId}/-/sources/add`,
    follow: (feedId: string) => path`${feedId}/-/follow`,
    reply: (feedId: string) => path`${feedId}/-/reply`,
    // The user's accounts on other networks, by capability
    accounts: '-/accounts/list',
    publish: (feedId: string) => path`${feedId}/-/publish`,
    publishSet: (feedId: string) => path`${feedId}/-/publish/set`,
    publishForget: (feedId: string) => path`${feedId}/-/publish/forget`,
    generatorSet: (feedId: string) => path`${feedId}/-/generator/set`,
    importAccount: (feedId: string) => path`${feedId}/-/import`,
    backups: (feedId: string) => path`${feedId}/-/backups`,
    backupFile: (feedId: string) => path`${feedId}/-/backups/file`,
    sourcesEdit: (feedId: string) => path`${feedId}/-/sources/edit`,
    sourcesRemove: (feedId: string) => path`${feedId}/-/sources/remove`,
    sourcesPoll: (feedId: string) => path`${feedId}/-/sources/poll`,
    sourcesFollow: (feedId: string) => path`${feedId}/-/sources/follow`,
    sourcesImport: (feedId: string) => path`${feedId}/-/sources/import`,
    sourcesAllow: (feedId: string) => path`${feedId}/-/sources/allow`,
    // Keyword filters on a feed
    filters: (feedId: string) => path`${feedId}/-/filters`,
    filtersAdd: (feedId: string) => path`${feedId}/-/filters/add`,
    filtersRemove: (feedId: string) => path`${feedId}/-/filters/remove`,
    // The user's contacts with a handle elsewhere, to follow
    people: '-/people',

    // RSS
    rssToken: '-/rss/token',
    rssTokenRevoke: '-/rss/token/revoke',

    // Sort persistence
    sortSet: '-/sort/set',
    feedSortSet: (feedId: string) => path`${feedId}/-/sort/set`,
  },
} as const

export default endpoints
