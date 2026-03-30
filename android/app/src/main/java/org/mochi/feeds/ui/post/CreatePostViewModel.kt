package org.mochi.feeds.ui.post

import android.app.Application
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.mochi.android.api.MochiError
import org.mochi.android.api.userMessage
import org.mochi.android.model.PlaceData
import org.mochi.feeds.model.Feed
import org.mochi.feeds.repository.FeedsRepository
import javax.inject.Inject

@HiltViewModel
class CreatePostViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: FeedsRepository,
    private val application: Application
) : ViewModel() {

    private val preSelectedFeedId: String? = savedStateHandle.get<String>("feedId")

    private val _availableFeeds = MutableStateFlow<List<Feed>>(emptyList())
    val availableFeeds: StateFlow<List<Feed>> = _availableFeeds.asStateFlow()

    private val _selectedFeed = MutableStateFlow(preSelectedFeedId ?: "")
    val selectedFeed: StateFlow<String> = _selectedFeed.asStateFlow()

    private val _body = MutableStateFlow("")
    val body: StateFlow<String> = _body.asStateFlow()

    private val _attachments = MutableStateFlow<List<Uri>>(emptyList())
    val attachments: StateFlow<List<Uri>> = _attachments.asStateFlow()

    private val _checkin = MutableStateFlow<PlaceData?>(null)
    val checkin: StateFlow<PlaceData?> = _checkin.asStateFlow()

    private val _travellingOrigin = MutableStateFlow<PlaceData?>(null)
    val travellingOrigin: StateFlow<PlaceData?> = _travellingOrigin.asStateFlow()

    private val _travellingDestination = MutableStateFlow<PlaceData?>(null)
    val travellingDestination: StateFlow<PlaceData?> = _travellingDestination.asStateFlow()

    private val _isPosting = MutableStateFlow(false)
    val isPosting: StateFlow<Boolean> = _isPosting.asStateFlow()

    private val _isLoadingFeeds = MutableStateFlow(false)
    val isLoadingFeeds: StateFlow<Boolean> = _isLoadingFeeds.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _postSuccess = MutableStateFlow(false)
    val postSuccess: StateFlow<Boolean> = _postSuccess.asStateFlow()

    init {
        loadAvailableFeeds()
    }

    private fun loadAvailableFeeds() {
        viewModelScope.launch {
            _isLoadingFeeds.value = true
            try {
                val feeds = repository.listFeeds()
                _availableFeeds.value = feeds
                // If no feed pre-selected but we have feeds, select the first one
                if (_selectedFeed.value.isEmpty() && feeds.isNotEmpty()) {
                    _selectedFeed.value = feeds.first().fingerprint.ifEmpty { feeds.first().id }
                }
            } catch (_: Exception) {
                // Will show empty dropdown
            } finally {
                _isLoadingFeeds.value = false
            }
        }
    }

    fun setSelectedFeed(feedId: String) {
        _selectedFeed.value = feedId
    }

    fun setBody(text: String) {
        _body.value = text
    }

    fun addAttachments(uris: List<Uri>) {
        _attachments.value = _attachments.value + uris
    }

    fun removeAttachment(uri: Uri) {
        _attachments.value = _attachments.value - uri
    }

    fun setCheckin(place: PlaceData?) {
        _checkin.value = place
        // Clear travelling if checkin is set
        if (place != null) {
            _travellingOrigin.value = null
            _travellingDestination.value = null
        }
    }

    fun setTravellingOrigin(place: PlaceData?) {
        _travellingOrigin.value = place
        // Clear checkin if travelling is set
        if (place != null) {
            _checkin.value = null
        }
    }

    fun setTravellingDestination(place: PlaceData?) {
        _travellingDestination.value = place
        // Clear checkin if travelling is set
        if (place != null) {
            _checkin.value = null
        }
    }

    fun clearLocation() {
        _checkin.value = null
        _travellingOrigin.value = null
        _travellingDestination.value = null
    }

    fun createPost() {
        val feedId = _selectedFeed.value
        if (feedId.isEmpty()) {
            _error.value = "Please select a feed"
            return
        }
        val bodyText = _body.value.trim()
        if (bodyText.isEmpty() && _attachments.value.isEmpty()) {
            _error.value = "Please enter some text or attach a file"
            return
        }

        viewModelScope.launch {
            _isPosting.value = true
            _error.value = null
            try {
                repository.createPostFromUris(
                    feedId = feedId,
                    body = bodyText,
                    uris = _attachments.value,
                    contentResolver = application.contentResolver,
                    checkin = _checkin.value,
                    travellingOrigin = _travellingOrigin.value,
                    travellingDestination = _travellingDestination.value
                )
                _postSuccess.value = true
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to create post"
            } finally {
                _isPosting.value = false
            }
        }
    }

    fun clearError() {
        _error.value = null
    }
}
