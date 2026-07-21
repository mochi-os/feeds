// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

// Endpoints are relative to baseURL which is already set to /feeds/ in request.ts
const endpoints = {
  // Cross-app endpoints (proxied via feeds backend)
  users: {
    search: '-/users/search',
  },
  groups: {
    list: '-/groups',
  },
  notifications: {
    feedClear: (feedId: string) => `${feedId}/-/notifications/clear`,
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
    subscribe: '-/subscribe',
    unsubscribe: '-/unsubscribe',

    // Entity-level endpoints (use /-/ separator)
    entityInfo: (feedId: string) => `${feedId}/-/info`,
    share: (feedId: string) => `${feedId}/-/share`,
    posts: (feedId: string) => `${feedId}/-/posts`,
    delete: (feedId: string) => `${feedId}/-/delete`,
    rename: (feedId: string) => `${feedId}/-/rename`,
    bannerGet: (feedId: string) => `${feedId}/-/banner/get`,
    bannerSet: (feedId: string) => `${feedId}/-/banner/set`,

    // Post actions
    post: {
      new: (feedId: string) => `${feedId}/-/post/new`,
      create: (feedId: string) => `${feedId}/-/post/create`,
      get: (feedId: string, postId: string) => `${feedId}/-/${postId}`,
      image: (feedId: string, postId: string) => `${feedId}/-/${postId}/image`,
      edit: (feedId: string, postId: string) => `${feedId}/-/${postId}/edit`,
      delete: (feedId: string, postId: string) => `${feedId}/-/${postId}/delete`,
      react: (feedId: string, postId: string) => `${feedId}/-/${postId}/react`,
    },

    // Read tracking
    postsRead: (feedId: string) => `${feedId}/-/posts/read`,
    readAll: (feedId: string) => `${feedId}/-/read-all`,

    // Comment actions
    comment: {
      new: (feedId: string, postId: string) => `${feedId}/-/${postId}/comment/new`,
      create: (feedId: string, postId: string) => `${feedId}/-/${postId}/comment/create`,
      edit: (feedId: string, postId: string, commentId: string) =>
        `${feedId}/-/${postId}/${commentId}/edit`,
      delete: (feedId: string, postId: string, commentId: string) =>
        `${feedId}/-/${postId}/${commentId}/delete`,
      react: (feedId: string, postId: string) => `${feedId}/-/${postId}/comment/react`,
      asset: (feedId: string, postId: string, commentId: string, asset: string) =>
        `${feedId}/-/${postId}/${commentId}/asset/${asset}`,
    },

    // Member search (for @mention autocomplete)
    memberSearch: (feedId: string) => `${feedId}/-/members/search`,

    // Access control
    access: (feedId: string) => `${feedId}/-/access`,
    accessSet: (feedId: string) => `${feedId}/-/access/set`,
    accessRevoke: (feedId: string) => `${feedId}/-/access/revoke`,

    // AI settings
    aiSettings: (feedId: string) => `${feedId}/-/ai/settings`,
    aiPromptsGet: (feedId: string) => `${feedId}/-/ai/prompts/get`,
    aiPromptsSet: (feedId: string) => `${feedId}/-/ai/prompts/set`,

    // Tags
    tags: (feedId: string) => `${feedId}/-/tags`,
    postTags: (feedId: string, postId: string) => `${feedId}/-/${postId}/tags`,
    postTagsAdd: (feedId: string, postId: string) => `${feedId}/-/${postId}/tags/add`,
    postTagsRemove: (feedId: string, postId: string) => `${feedId}/-/${postId}/tags/remove`,

    // Interest scoring
    tagInterest: (feedId: string) => `${feedId}/-/tags/interest`,

    // Sources
    sources: (feedId: string) => `${feedId}/-/sources`,
    sourcesAdd: (feedId: string) => `${feedId}/-/sources/add`,
    sourcesEdit: (feedId: string) => `${feedId}/-/sources/edit`,
    sourcesRemove: (feedId: string) => `${feedId}/-/sources/remove`,
    sourcesPoll: (feedId: string) => `${feedId}/-/sources/poll`,

    // RSS
    rssToken: '-/rss/token',
    rssTokenRevoke: '-/rss/token/revoke',

    // Sort persistence
    sortSet: '-/sort/set',
    feedSortSet: (feedId: string) => `${feedId}/-/sort/set`,
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
