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

    private val _probeResult = MutableStateFlow<Feed?>(null)
    val probeResult: StateFlow<Feed?> = _probeResult.asStateFlow()

    private val _isProbing = MutableStateFlow(false)
    val isProbing: StateFlow<Boolean> = _isProbing.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadRecommendations()
    }

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
        searchJob?.cancel()
        if (query.isBlank()) {
            _searchResults.value = emptyList()
            _probeResult.value = null
            _isSearching.value = false
            _isProbing.value = false
            return
        }
        searchJob = viewModelScope.launch {
            delay(300) // Debounce
            if (looksLikeUrl(query)) {
                probe(query)
                _searchResults.value = emptyList()
            } else {
                _probeResult.value = null
                search(query)
            }
        }
    }

    private fun looksLikeUrl(query: String): Boolean {
        val trimmed = query.trim()
        return trimmed.startsWith("http://", ignoreCase = true) ||
                trimmed.startsWith("https://", ignoreCase = true)
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

    private suspend fun probe(url: String) {
        _isProbing.value = true
        try {
            val result = repository.probeUrl(url.trim())
            _probeResult.value = result.feed
        } catch (_: Exception) {
            _probeResult.value = null
        } finally {
            _isProbing.value = false
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

    private val _interestSuggestions = MutableStateFlow<List<org.mochi.feeds.api.InterestSuggestion>>(emptyList())
    val interestSuggestions: StateFlow<List<org.mochi.feeds.api.InterestSuggestion>> = _interestSuggestions.asStateFlow()

    private val _justSubscribedFeed = MutableStateFlow<String?>(null)
    val justSubscribedFeed: StateFlow<String?> = _justSubscribedFeed.asStateFlow()

    fun subscribe(feed: Feed) {
        val feedId = feed.fingerprint.ifEmpty { feed.id }
        if (feedId.isEmpty()) return

        viewModelScope.launch {
            _subscribingFeed.value = feedId
            try {
                repository.subscribeFeed(feedId, feed.server)
                _subscribedFeeds.value = _subscribedFeeds.value + feedId
                // Load interest suggestions for the newly subscribed feed
                try {
                    val suggestions = repository.getSuggestedInterests(feedId)
                    if (suggestions.isNotEmpty()) {
                        _interestSuggestions.value = suggestions
                        _justSubscribedFeed.value = feedId
                    }
                } catch (_: Exception) { }
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to subscribe"
            } finally {
                _subscribingFeed.value = null
            }
        }
    }

    fun addInterest(suggestion: org.mochi.feeds.api.InterestSuggestion) {
        val feedId = _justSubscribedFeed.value ?: return
        viewModelScope.launch {
            try {
                repository.adjustInterest(feedId, qid = suggestion.qid.takeIf { it.isNotEmpty() }, label = suggestion.label, direction = "up")
                _interestSuggestions.value = _interestSuggestions.value - suggestion
            } catch (_: Exception) { }
        }
    }

    fun dismissInterest(suggestion: org.mochi.feeds.api.InterestSuggestion) {
        _interestSuggestions.value = _interestSuggestions.value - suggestion
    }

    fun dismissAllSuggestions() {
        _interestSuggestions.value = emptyList()
        _justSubscribedFeed.value = null
    }

    fun clearError() {
        _error.value = null
    }
}
