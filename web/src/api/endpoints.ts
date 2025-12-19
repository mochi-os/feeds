const endpoints = {
  feeds: {
    // Class context (no entity) - use _/ prefix to separate from frontend routes
    info: '_/info',
    create: '_/create',
    search: '_/search',
    probe: '_/probe',

    // Entity context (:feed/-/...)
    entityInfo: (feedId: string) => `${feedId}/-/info`,
    posts: (feedId: string) => `${feedId}/-/posts`,
    subscribe: (feedId: string) => `${feedId}/-/subscribe`,
    unsubscribe: (feedId: string) => `${feedId}/-/unsubscribe`,
    delete: (feedId: string) => `${feedId}/-/delete`,

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
    accessGrant: (feedId: string) => `${feedId}/-/access/grant`,
    accessDeny: (feedId: string) => `${feedId}/-/access/deny`,
    accessRevoke: (feedId: string) => `${feedId}/-/access/revoke`,
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
