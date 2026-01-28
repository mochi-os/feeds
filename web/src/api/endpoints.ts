// Endpoints are relative to baseURL which is already set to /feeds/ in request.ts
const endpoints = {
  // Cross-app endpoints (proxied via feeds backend)
  users: {
    search: 'users/search',
  },
  groups: {
    list: 'groups',
  },
  notifications: {
    subscribe: 'notifications/subscribe',
    check: 'notifications/check',
    destinations: 'notifications/destinations',
  },

  feeds: {
    // Class-level endpoints (no entity context)
    info: 'info',
    create: 'create',
    search: 'directory/search',
    recommendations: 'recommendations',
    probe: 'probe',
    subscribe: 'subscribe',
    unsubscribe: 'unsubscribe',

    // Entity-level endpoints (use /-/ separator)
    entityInfo: (feedId: string) => `${feedId}/-/info`,
    posts: (feedId: string) => `${feedId}/-/posts`,
    delete: (feedId: string) => `${feedId}/-/delete`,
    rename: (feedId: string) => `${feedId}/-/rename`,

    // Post actions
    post: {
      new: (feedId: string) => `${feedId}/-/post/new`,
      create: (feedId: string) => `${feedId}/-/post/create`,
      get: (feedId: string, postId: string) => `${feedId}/-/${postId}`,
      edit: (feedId: string, postId: string) => `${feedId}/-/${postId}/edit`,
      delete: (feedId: string, postId: string) => `${feedId}/-/${postId}/delete`,
      react: (feedId: string, postId: string) => `${feedId}/-/${postId}/react`,
    },

    // Comment actions
    comment: {
      new: (feedId: string, postId: string) => `${feedId}/-/${postId}/comment/new`,
      create: (feedId: string, postId: string) => `${feedId}/-/${postId}/comment/create`,
      edit: (feedId: string, postId: string, commentId: string) =>
        `${feedId}/-/${postId}/${commentId}/edit`,
      delete: (feedId: string, postId: string, commentId: string) =>
        `${feedId}/-/${postId}/${commentId}/delete`,
      react: (feedId: string, postId: string) => `${feedId}/-/${postId}/comment/react`,
    },

    // Access control
    access: (feedId: string) => `${feedId}/-/access`,
    accessSet: (feedId: string) => `${feedId}/-/access/set`,
    accessRevoke: (feedId: string) => `${feedId}/-/access/revoke`,

    // Member management
    members: (feedId: string) => `${feedId}/-/members`,
    membersAdd: (feedId: string) => `${feedId}/-/members/add`,
    membersRemove: (feedId: string) => `${feedId}/-/members/remove`,
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
