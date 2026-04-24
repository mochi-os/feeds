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
    check: '-/notifications/check',
    feedClear: (feedId: string) => `${feedId}/-/notifications/clear`,
    feedGet: (feedId: string) => `${feedId}/-/notifications/get`,
    feedSet: (feedId: string) => `${feedId}/-/notifications/set`,
    feedReset: (feedId: string) => `${feedId}/-/notifications/reset`,
  },

  feeds: {
    // Class-level endpoints (no entity context)
    info: '-/info',
    create: '-/create',
    search: '-/directory/search',
    recommendations: '-/recommendations',
    probe: '-/probe',
    subscribe: '-/subscribe',
    unsubscribe: '-/unsubscribe',

    // Entity-level endpoints (use /-/ separator)
    entityInfo: (feedId: string) => `${feedId}/-/info`,
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
    suggestInterests: (feedId: string) => `${feedId}/-/interests/suggest`,

    // Sources
    sources: (feedId: string) => `${feedId}/-/sources`,
    sourcesAdd: (feedId: string) => `${feedId}/-/sources/add`,
    sourcesEdit: (feedId: string) => `${feedId}/-/sources/edit`,
    sourcesRemove: (feedId: string) => `${feedId}/-/sources/remove`,
    sourcesPoll: (feedId: string) => `${feedId}/-/sources/poll`,

    // RSS
    rssToken: '-/rss/token',

    // Member management
    members: (feedId: string) => `${feedId}/-/members`,
    membersAdd: (feedId: string) => `${feedId}/-/members/add`,
    membersRemove: (feedId: string) => `${feedId}/-/members/remove`,
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
