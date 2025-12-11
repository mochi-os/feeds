const endpoints = {
  feeds: {
    // List/view feeds - POST /feeds/list (spec requires POST)
    list: '/feeds/list',
    // View specific feed - GET /feeds/{feed}
    get: (feedId: string) => `/feeds/${feedId}`,
    // View specific post - GET /feeds/{feed}/{post}
    getPost: (feedId: string, postId: string) => `/feeds/${feedId}/${postId}`,
    // Create new feed - POST /feeds/create
    create: '/feeds/create',
    // Find feeds form - GET /feeds/find
    find: '/feeds/find',
    // Search feeds - GET /feeds/search
    search: '/feeds/search',
    // New feed form - GET /feeds/new
    new: '/feeds/new',
    // Subscribe - POST /feeds/subscribe
    subscribe: '/feeds/subscribe',
    // Unsubscribe - POST /feeds/unsubscribe
    unsubscribe: '/feeds/unsubscribe',
    post: {
      // Get new post form (global) - GET /feeds/post/new
      new: '/feeds/post/new',
      // Get new post form for specific feed - GET /feeds/{feed}/post
      newInFeed: (feedId: string) => `/feeds/${feedId}/post`,
      // Create post (global, multipart) - POST /feeds/post/create
      create: '/feeds/post/create',
      // Create post in specific feed (JSON) - POST /feeds/{feed}/create
      createInFeed: (feedId: string) => `/feeds/${feedId}/create`,
      // React to post - POST /feeds/{feed}/{post}/react/{reaction}
      react: (feed: string, post: string, reaction: string) =>
        `/feeds/${feed}/${post}/react/${reaction}`,
    },
    comment: {
      // Get new comment form - GET /feeds/{feed}/{post}/comment
      new: (feed: string, post: string) => `/feeds/${feed}/${post}/comment`,
      // Create comment - POST /feeds/{feed}/{post}/create (multipart/form-data per spec)
      create: (feed: string, post: string) => `/feeds/${feed}/${post}/create`,
      // React to comment - POST /feeds/{feed}/{post}/{comment}/react/{reaction}
      react: (feed: string, post: string, comment: string, reaction: string) =>
        `/feeds/${feed}/${post}/${comment}/react/${reaction}`,
    },
  },
  auth: {
    login: '/login',
    signup: '/signup',
    verify: '/login/auth',
    logout: '/logout',
  },
} as const

export type Endpoints = typeof endpoints

export default endpoints
