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
import org.mochi.android.model.Attachment
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
    private val editingPostId: String? = savedStateHandle.get<String>("postId")
    val isEditing: Boolean = editingPostId != null

    private val _availableFeeds = MutableStateFlow<List<Feed>>(emptyList())
    val availableFeeds: StateFlow<List<Feed>> = _availableFeeds.asStateFlow()

    private val _selectedFeed = MutableStateFlow(preSelectedFeedId ?: "")
    val selectedFeed: StateFlow<String> = _selectedFeed.asStateFlow()

    private val _body = MutableStateFlow("")
    val body: StateFlow<String> = _body.asStateFlow()

    private val _attachments = MutableStateFlow<List<Uri>>(emptyList())
    val attachments: StateFlow<List<Uri>> = _attachments.asStateFlow()

    private val _existingAttachments = MutableStateFlow<List<Attachment>>(emptyList())
    val existingAttachments: StateFlow<List<Attachment>> = _existingAttachments.asStateFlow()

    private val _removedExistingIds = MutableStateFlow<Set<String>>(emptySet())
    val removedExistingIds: StateFlow<Set<String>> = _removedExistingIds.asStateFlow()

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
        if (isEditing) {
            loadExistingPost()
        }
    }

    private fun loadAvailableFeeds() {
        viewModelScope.launch {
            _isLoadingFeeds.value = true
            try {
                // Only show feeds the user owns — posts can only be written to owned feeds.
                // Matches action_post_new server behaviour.
                val feeds = repository.listFeeds().filter { it.owner == 1 }
                _availableFeeds.value = feeds
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

    private fun loadExistingPost() {
        val feedId = preSelectedFeedId ?: return
        val postId = editingPostId ?: return
        viewModelScope.launch {
            try {
                val result = repository.getPost(feedId, postId)
                _body.value = result.post.body
                _existingAttachments.value = result.post.attachments
                // Load location data from post.data if present
                result.post.data?.checkin?.let { _checkin.value = it }
                result.post.data?.travelling?.origin?.let { _travellingOrigin.value = it }
                result.post.data?.travelling?.destination?.let { _travellingDestination.value = it }
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load post"
            }
        }
    }

    fun toggleRemoveExistingAttachment(id: String) {
        val current = _removedExistingIds.value
        _removedExistingIds.value = if (id in current) current - id else current + id
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

    fun moveAttachment(uri: Uri, direction: Int) {
        val list = _attachments.value.toMutableList()
        val index = list.indexOf(uri)
        if (index < 0) return
        val newIndex = (index + direction).coerceIn(0, list.lastIndex)
        if (newIndex == index) return
        list.removeAt(index)
        list.add(newIndex, uri)
        _attachments.value = list
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
        val hasContent = bodyText.isNotEmpty() ||
                _attachments.value.isNotEmpty() ||
                _existingAttachments.value.any { it.id !in _removedExistingIds.value }
        if (!hasContent) {
            _error.value = "Please enter some text or attach a file"
            return
        }

        viewModelScope.launch {
            _isPosting.value = true
            _error.value = null
            try {
                if (isEditing) {
                    val postId = editingPostId!!
                    // Build the order list: kept existing attachments in original order, then "new:N" for each new file
                    val keptExisting = _existingAttachments.value
                        .filter { it.id !in _removedExistingIds.value }
                        .map { it.id }
                    val newPlaceholders = _attachments.value.indices.map { "new:$it" }
                    val order = keptExisting + newPlaceholders
                    val newFileUris = _attachments.value
                    // Read new files into byte arrays for the repo method
                    repository.editPost(
                        feedId = feedId,
                        postId = postId,
                        body = bodyText,
                        order = order,
                        newFiles = newFileUris,
                        contentResolver = application.contentResolver,
                        checkin = _checkin.value,
                        travellingOrigin = _travellingOrigin.value,
                        travellingDestination = _travellingDestination.value
                    )
                } else {
                    repository.createPostFromUris(
                        feedId = feedId,
                        body = bodyText,
                        uris = _attachments.value,
                        contentResolver = application.contentResolver,
                        checkin = _checkin.value,
                        travellingOrigin = _travellingOrigin.value,
                        travellingDestination = _travellingDestination.value
                    )
                }
                _postSuccess.value = true
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to save post"
            } finally {
                _isPosting.value = false
            }
        }
    }

    fun clearError() {
        _error.value = null
    }

    suspend fun searchMembers(query: String): List<org.mochi.android.ui.components.MentionSuggestion> {
        val feedId = _selectedFeed.value
        if (feedId.isEmpty()) return emptyList()
        return try {
            repository.searchMembers(feedId, query).map {
                org.mochi.android.ui.components.MentionSuggestion(id = it.id, name = it.name)
            }
        } catch (_: Exception) {
            emptyList()
        }
    }
}
