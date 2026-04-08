package org.mochi.feeds.ui.feed

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.mochi.android.api.MochiError
import org.mochi.android.api.userMessage
import org.mochi.android.auth.SessionManager
import org.mochi.android.websocket.MochiWebSocket
import org.mochi.feeds.model.Feed
import org.mochi.feeds.model.Permissions
import org.mochi.feeds.model.Post
import org.mochi.feeds.api.InterestSuggestion
import org.mochi.feeds.model.Tag
import org.mochi.feeds.repository.FeedsRepository
import javax.inject.Inject

@HiltViewModel
class FeedViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: FeedsRepository,
    private val webSocket: MochiWebSocket,
    private val sessionManager: SessionManager
) : ViewModel() {

    val feedId: String = savedStateHandle.get<String>("feedId") ?: ""

    private val _posts = MutableStateFlow<List<Post>>(emptyList())
    val posts: StateFlow<List<Post>> = _posts.asStateFlow()

    private val _feedInfo = MutableStateFlow<Feed?>(null)
    val feedInfo: StateFlow<Feed?> = _feedInfo.asStateFlow()

    private val _permissions = MutableStateFlow(Permissions())
    val permissions: StateFlow<Permissions> = _permissions.asStateFlow()

    private val _tags = MutableStateFlow<List<Tag>>(emptyList())
    val tags: StateFlow<List<Tag>> = _tags.asStateFlow()

    private val _suggestedInterests = MutableStateFlow<List<InterestSuggestion>>(emptyList())
    val suggestedInterests: StateFlow<List<InterestSuggestion>> = _suggestedInterests.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()

    private val _isLoadingMore = MutableStateFlow(false)
    val isLoadingMore: StateFlow<Boolean> = _isLoadingMore.asStateFlow()

    private val _hasMore = MutableStateFlow(false)
    val hasMore: StateFlow<Boolean> = _hasMore.asStateFlow()

    private var nextCursor: Long = 0

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _currentSort = MutableStateFlow("interests")
    val currentSort: StateFlow<String> = _currentSort.asStateFlow()

    private val _currentTag = MutableStateFlow<String?>(null)
    val currentTag: StateFlow<String?> = _currentTag.asStateFlow()

    private val _unreadOnly = MutableStateFlow(false)
    val unreadOnly: StateFlow<Boolean> = _unreadOnly.asStateFlow()

    val isAllFeeds: Boolean = feedId == "__all__"

    private var subscriptionId: String? = null
    private var markReadJob: Job? = null
    private val pendingReadIds = mutableSetOf<String>()

    init {
        loadFeed()
        subscribeToWebSocket()
    }

    fun loadFeed() {
        viewModelScope.launch {
            _error.value = null

            if (isAllFeeds) {
                _isLoading.value = true
                try {
                    loadAllFeeds()
                } catch (e: MochiError) {
                    _error.value = e.userMessage()
                } catch (e: Exception) {
                    _error.value = e.message ?: "Failed to load feed"
                } finally {
                    _isLoading.value = false
                }
                return@launch
            }

            // Show cached data immediately if available
            val cachedInfo = repository.getCachedFeedInfo(feedId)
            val cachedPosts = repository.getCachedPosts(feedId, _currentSort.value, _currentTag.value, _unreadOnly.value)
            if (cachedInfo != null && cachedPosts != null) {
                _feedInfo.value = cachedInfo.feed
                _permissions.value = cachedInfo.permissions
                _posts.value = cachedPosts.posts
                _hasMore.value = cachedPosts.hasMore
                nextCursor = cachedPosts.nextCursor
                _isLoading.value = false
                // Refresh in background
                refreshSilently()
                loadTags()
                return@launch
            }

            _isLoading.value = true
            try {
                val info = repository.getFeedInfo(feedId)
                _feedInfo.value = info.feed
                _permissions.value = info.permissions

                val result = repository.getPosts(
                    feedId = feedId,
                    sort = _currentSort.value,
                    tag = _currentTag.value,
                    unreadOnly = _unreadOnly.value
                )
                _posts.value = result.posts
                _hasMore.value = result.hasMore
                nextCursor = result.nextCursor

                loadTags()
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load feed"
            } finally {
                _isLoading.value = false
            }
        }
    }

    private suspend fun loadAllFeeds() {
        val feeds = repository.listFeeds()
        _feedInfo.value = Feed(name = "All feeds")
        _permissions.value = Permissions()

        val feedIds = feeds.mapNotNull { feed ->
            feed.fingerprint.ifEmpty { feed.id }.ifEmpty { null }
        }
        val deferred = feedIds.map { fid ->
            viewModelScope.async {
                try {
                    repository.getPosts(feedId = fid, sort = _currentSort.value, limit = 10).posts
                } catch (_: Exception) {
                    emptyList<Post>()
                }
            }
        }
        val allPosts = deferred.awaitAll().flatten()

        _posts.value = allPosts.sortedByDescending { it.created }
        _hasMore.value = false
    }

    fun refresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            try {
                if (isAllFeeds) {
                    loadAllFeeds()
                } else {
                    val info = repository.getFeedInfo(feedId)
                    _feedInfo.value = info.feed
                    _permissions.value = info.permissions

                    val result = repository.getPosts(
                        feedId = feedId,
                        sort = _currentSort.value,
                        tag = _currentTag.value,
                        unreadOnly = _unreadOnly.value
                    )
                    _posts.value = result.posts
                    _hasMore.value = result.hasMore
                    nextCursor = result.nextCursor

                    loadTags()
                }
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to refresh"
            } finally {
                _isRefreshing.value = false
            }
        }
    }

    private val isRelevanceSort: Boolean
        get() = _currentSort.value in listOf("interests", "ai", "relevant")

    fun loadMore() {
        if (_isLoadingMore.value || !_hasMore.value) return

        viewModelScope.launch {
            _isLoadingMore.value = true
            try {
                val result = if (isRelevanceSort) {
                    repository.getPosts(
                        feedId = feedId,
                        offset = nextCursor,
                        sort = _currentSort.value,
                        tag = _currentTag.value,
                        unreadOnly = _unreadOnly.value
                    )
                } else {
                    val lastPost = _posts.value.lastOrNull() ?: return@launch
                    repository.getPosts(
                        feedId = feedId,
                        before = lastPost.id,
                        sort = _currentSort.value,
                        tag = _currentTag.value,
                        unreadOnly = _unreadOnly.value
                    )
                }
                _posts.value = _posts.value + result.posts
                _hasMore.value = result.hasMore
                nextCursor = result.nextCursor
            } catch (_: Exception) {
                // Silent failure for pagination
            } finally {
                _isLoadingMore.value = false
            }
        }
    }

    fun setSort(sort: String) {
        if (_currentSort.value == sort) return
        _currentSort.value = sort
        reloadPosts()
    }

    fun setTagFilter(tag: String?) {
        if (_currentTag.value == tag) return
        _currentTag.value = tag
        reloadPosts()
    }

    fun setUnreadOnly(unreadOnly: Boolean) {
        if (_unreadOnly.value == unreadOnly) return
        _unreadOnly.value = unreadOnly
        reloadPosts()
    }

    fun reactToPost(postId: String, reaction: String) {
        viewModelScope.launch {
            try {
                repository.reactToPost(feedId, postId, reaction)
                // Optimistically update the post's reaction
                _posts.value = _posts.value.map { post ->
                    if (post.id == postId) {
                        val newReaction = if (post.myReaction == reaction) "" else reaction
                        post.copy(myReaction = newReaction)
                    } else post
                }
            } catch (_: Exception) {
                // Revert on failure by refreshing
                refresh()
            }
        }
    }

    fun onPostsVisible(visiblePostIds: Set<String>) {
        val unreadIds = visiblePostIds.filter { postId ->
            _posts.value.find { it.id == postId }?.read == 0L
        }.toSet()

        if (unreadIds.isEmpty()) return

        pendingReadIds.addAll(unreadIds)
        markReadJob?.cancel()
        markReadJob = viewModelScope.launch {
            delay(2000)
            val idsToMark = pendingReadIds.toList()
            pendingReadIds.clear()
            if (idsToMark.isNotEmpty()) {
                try {
                    repository.markPostsRead(feedId, idsToMark)
                    _posts.value = _posts.value.map { post ->
                        if (post.id in idsToMark && post.read == 0L) {
                            post.copy(read = System.currentTimeMillis() / 1000)
                        } else post
                    }
                    // Update feed unread count
                    _feedInfo.value = _feedInfo.value?.let { feed ->
                        feed.copy(unread = maxOf(0, feed.unread - idsToMark.size))
                    }
                } catch (_: Exception) {
                    // Non-critical
                }
            }
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            try {
                repository.markAllRead(feedId)
                val now = System.currentTimeMillis() / 1000
                _posts.value = _posts.value.map { it.copy(read = now) }
                _feedInfo.value = _feedInfo.value?.copy(unread = 0)
            } catch (_: Exception) {
                // Refresh on failure
                refresh()
            }
        }
    }

    private fun reloadPosts() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val result = repository.getPosts(
                    feedId = feedId,
                    sort = _currentSort.value,
                    tag = _currentTag.value,
                    unreadOnly = _unreadOnly.value
                )
                _posts.value = result.posts
                _hasMore.value = result.hasMore
                nextCursor = result.nextCursor
            } catch (_: Exception) {
                // Keep existing data
            } finally {
                _isLoading.value = false
            }
        }
    }

    private fun loadTags() {
        if (isAllFeeds) return
        viewModelScope.launch {
            try {
                _tags.value = repository.getTags(feedId)
            } catch (_: Exception) {
                // Tags are non-critical
            }
        }
        viewModelScope.launch {
            try {
                _suggestedInterests.value = repository.getSuggestedInterests(feedId)
            } catch (_: Exception) {
                // Suggestions are non-critical
            }
        }
    }

    fun addInterest(suggestion: InterestSuggestion) {
        viewModelScope.launch {
            try {
                repository.adjustInterest(feedId, qid = suggestion.qid, label = null, direction = "up")
                // Remove from suggestions once added
                _suggestedInterests.value = _suggestedInterests.value - suggestion
            } catch (_: Exception) {
                // Silent — user can retry
            }
        }
    }

    fun dismissInterest(suggestion: InterestSuggestion) {
        _suggestedInterests.value = _suggestedInterests.value - suggestion
    }

    private fun subscribeToWebSocket() {
        if (feedId.isEmpty() || isAllFeeds) return
        val serverUrl = sessionManager.getServerUrlBlocking()
        subscriptionId = webSocket.subscribe(serverUrl, feedId) { event ->
            when (event.type) {
                "post_created", "post_deleted", "post_updated", "comment_created",
                "comment_deleted", "reaction", "source_polled" -> {
                    viewModelScope.launch { refreshSilently() }
                }
            }
        }
    }

    private suspend fun refreshSilently() {
        try {
            val result = repository.getPosts(
                feedId = feedId,
                sort = _currentSort.value,
                tag = _currentTag.value,
                unreadOnly = _unreadOnly.value
            )
            _posts.value = result.posts
            _hasMore.value = result.hasMore
            nextCursor = result.nextCursor
        } catch (_: Exception) {
            // Silent failure
        }
    }

    override fun onCleared() {
        super.onCleared()
        markReadJob?.cancel()
        subscriptionId?.let { webSocket.unsubscribe(it) }
    }
}
