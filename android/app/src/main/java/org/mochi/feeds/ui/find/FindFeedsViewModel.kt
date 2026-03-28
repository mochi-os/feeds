package org.mochi.feeds.ui.find

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.mochi.android.api.MochiError
import org.mochi.android.api.userMessage
import org.mochi.feeds.model.Feed
import org.mochi.feeds.repository.FeedsRepository
import javax.inject.Inject

@HiltViewModel
class FindFeedsViewModel @Inject constructor(
    private val repository: FeedsRepository
) : ViewModel() {

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _searchResults = MutableStateFlow<List<Feed>>(emptyList())
    val searchResults: StateFlow<List<Feed>> = _searchResults.asStateFlow()

    private val _recommendations = MutableStateFlow<List<Feed>>(emptyList())
    val recommendations: StateFlow<List<Feed>> = _recommendations.asStateFlow()

    private val _isSearching = MutableStateFlow(false)
    val isSearching: StateFlow<Boolean> = _isSearching.asStateFlow()

    private val _isLoadingRecommendations = MutableStateFlow(false)
    val isLoadingRecommendations: StateFlow<Boolean> = _isLoadingRecommendations.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _subscribingFeed = MutableStateFlow<String?>(null)
    val subscribingFeed: StateFlow<String?> = _subscribingFeed.asStateFlow()

    private val _subscribedFeeds = MutableStateFlow<Set<String>>(emptySet())
    val subscribedFeeds: StateFlow<Set<String>> = _subscribedFeeds.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadRecommendations()
    }

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
        searchJob?.cancel()
        if (query.isBlank()) {
            _searchResults.value = emptyList()
            _isSearching.value = false
            return
        }
        searchJob = viewModelScope.launch {
            delay(300) // Debounce
            search(query)
        }
    }

    private suspend fun search(query: String) {
        _isSearching.value = true
        try {
            _searchResults.value = repository.searchDirectory(query)
        } catch (e: MochiError) {
            _error.value = e.userMessage()
        } catch (e: Exception) {
            _error.value = e.message ?: "Search failed"
        } finally {
            _isSearching.value = false
        }
    }

    private fun loadRecommendations() {
        viewModelScope.launch {
            _isLoadingRecommendations.value = true
            try {
                _recommendations.value = repository.getRecommendations()
            } catch (_: Exception) {
                // Non-critical
            } finally {
                _isLoadingRecommendations.value = false
            }
        }
    }

    fun subscribe(feed: Feed) {
        val feedId = feed.fingerprint.ifEmpty { feed.id }
        if (feedId.isEmpty()) return

        viewModelScope.launch {
            _subscribingFeed.value = feedId
            try {
                repository.subscribeFeed(feedId, feed.server)
                _subscribedFeeds.value = _subscribedFeeds.value + feedId
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to subscribe"
            } finally {
                _subscribingFeed.value = null
            }
        }
    }

    fun clearError() {
        _error.value = null
    }
}
