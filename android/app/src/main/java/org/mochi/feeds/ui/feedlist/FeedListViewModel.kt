package org.mochi.feeds.ui.feedlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.mochi.android.api.MochiError
import org.mochi.android.api.userMessage
import org.mochi.android.auth.SessionManager
import org.mochi.android.websocket.MochiWebSocket
import org.mochi.feeds.model.Feed
import org.mochi.feeds.repository.FeedsRepository
import javax.inject.Inject

@HiltViewModel
class FeedListViewModel @Inject constructor(
    private val repository: FeedsRepository,
    private val webSocket: MochiWebSocket,
    private val sessionManager: SessionManager
) : ViewModel() {

    private val _feeds = MutableStateFlow<List<Feed>>(emptyList())
    val feeds: StateFlow<List<Feed>> = _feeds.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _showCreateDialog = MutableStateFlow(false)
    val showCreateDialog: StateFlow<Boolean> = _showCreateDialog.asStateFlow()

    private val _createError = MutableStateFlow<String?>(null)
    val createError: StateFlow<String?> = _createError.asStateFlow()

    private val _isCreating = MutableStateFlow(false)
    val isCreating: StateFlow<Boolean> = _isCreating.asStateFlow()

    private val _currentSort = MutableStateFlow("")
    val currentSort: StateFlow<String> = _currentSort.asStateFlow()

    // Global RSS URL state — null when not yet generated, set once a token
    // has been minted for the chosen mode. Resetting (mode change) wipes it.
    private val _globalRssUrl = MutableStateFlow<String?>(null)
    val globalRssUrl: StateFlow<String?> = _globalRssUrl.asStateFlow()

    private val _rssCopiedMessage = MutableStateFlow<String?>(null)
    val rssCopiedMessage: StateFlow<String?> = _rssCopiedMessage.asStateFlow()

    private val subscriptionIds = mutableListOf<String>()

    init {
        loadFeeds()
        loadGlobalSort()
    }

    private fun loadGlobalSort() {
        viewModelScope.launch {
            try {
                _currentSort.value = repository.getGlobalSort()
            } catch (_: Exception) {
                // Non-critical — leave as default.
            }
        }
    }

    fun setSort(sort: String) {
        if (_currentSort.value == sort) return
        _currentSort.value = sort
        viewModelScope.launch {
            try {
                repository.setGlobalSort(sort)
            } catch (_: Exception) {
                // Non-critical — UI state already updated.
            }
        }
    }

    fun loadFeeds() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                val feedList = repository.listFeeds()
                _feeds.value = feedList
                subscribeToWebSockets(feedList)
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load feeds"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _isRefreshing.value = true
            try {
                val feedList = repository.listFeeds()
                _feeds.value = feedList
                subscribeToWebSockets(feedList)
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to refresh feeds"
            } finally {
                _isRefreshing.value = false
            }
        }
    }

    fun showCreateDialog() {
        _showCreateDialog.value = true
        _createError.value = null
    }

    fun hideCreateDialog() {
        _showCreateDialog.value = false
        _createError.value = null
    }

    fun createFeed(name: String, privacy: String, memories: Boolean) {
        viewModelScope.launch {
            _isCreating.value = true
            _createError.value = null
            try {
                repository.createFeed(name, privacy, memories)
                _showCreateDialog.value = false
                refresh()
            } catch (e: MochiError) {
                _createError.value = e.userMessage()
            } catch (e: Exception) {
                _createError.value = e.message ?: "Failed to create feed"
            } finally {
                _isCreating.value = false
            }
        }
    }

    fun generateGlobalRssUrl(mode: String) {
        viewModelScope.launch {
            try {
                val token = repository.getRssToken("*", mode)
                val serverUrl = sessionManager.getServerUrlBlocking().trimEnd('/')
                _globalRssUrl.value = "$serverUrl/feeds/-/rss?token=$token"
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to generate RSS URL"
            }
        }
    }

    fun clearGlobalRssUrl() {
        _globalRssUrl.value = null
    }

    fun setRssCopiedMessage(message: String) {
        _rssCopiedMessage.value = message
    }

    fun clearRssCopiedMessage() {
        _rssCopiedMessage.value = null
    }

    fun updateFeedUnreadCount(feedFingerprint: String, delta: Int) {
        _feeds.value = _feeds.value.map { feed ->
            if (feed.fingerprint == feedFingerprint) {
                feed.copy(unread = maxOf(0, feed.unread + delta))
            } else {
                feed
            }
        }
    }

    private fun subscribeToWebSockets(feedList: List<Feed>) {
        unsubscribeAll()
        val serverUrl = sessionManager.getServerUrlBlocking()
        for (feed in feedList) {
            if (feed.fingerprint.isNotEmpty()) {
                val subId = webSocket.subscribe(serverUrl, feed.fingerprint) { event ->
                    when (event.type) {
                        "post_created", "post_deleted", "source_polled" -> {
                            viewModelScope.launch { refreshFeedSilently() }
                        }
                    }
                }
                subscriptionIds.add(subId)
            }
        }
    }

    private suspend fun refreshFeedSilently() {
        try {
            val feedList = repository.listFeeds()
            _feeds.value = feedList
        } catch (_: Exception) {
            // Silent refresh failure
        }
    }

    private fun unsubscribeAll() {
        subscriptionIds.forEach { webSocket.unsubscribe(it) }
        subscriptionIds.clear()
    }

    override fun onCleared() {
        super.onCleared()
        unsubscribeAll()
    }
}
