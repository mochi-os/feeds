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
import org.mochi.android.auth.SessionManager
import org.mochi.android.websocket.MochiWebSocket
import org.mochi.feeds.model.Permissions
import org.mochi.feeds.model.Post
import org.mochi.feeds.model.Tag
import org.mochi.feeds.repository.FeedsRepository
import javax.inject.Inject

@HiltViewModel
class PostDetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: FeedsRepository,
    private val webSocket: MochiWebSocket,
    private val sessionManager: SessionManager,
    private val application: Application
) : ViewModel() {

    val feedId: String = savedStateHandle.get<String>("feedId") ?: ""
    val postId: String = savedStateHandle.get<String>("postId") ?: ""

    private val _post = MutableStateFlow<Post?>(null)
    val post: StateFlow<Post?> = _post.asStateFlow()

    private val _permissions = MutableStateFlow(Permissions())
    val permissions: StateFlow<Permissions> = _permissions.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _commentText = MutableStateFlow("")
    val commentText: StateFlow<String> = _commentText.asStateFlow()

    private val _commentAttachments = MutableStateFlow<List<Uri>>(emptyList())
    val commentAttachments: StateFlow<List<Uri>> = _commentAttachments.asStateFlow()

    private val _isSendingComment = MutableStateFlow(false)
    val isSendingComment: StateFlow<Boolean> = _isSendingComment.asStateFlow()

    private val _replyingTo = MutableStateFlow<String?>(null)
    val replyingTo: StateFlow<String?> = _replyingTo.asStateFlow()

    private val _editingCommentId = MutableStateFlow<String?>(null)
    val editingCommentId: StateFlow<String?> = _editingCommentId.asStateFlow()

    private val _editCommentText = MutableStateFlow("")
    val editCommentText: StateFlow<String> = _editCommentText.asStateFlow()

    private val _tags = MutableStateFlow<List<Tag>>(emptyList())
    val tags: StateFlow<List<Tag>> = _tags.asStateFlow()

    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError.asStateFlow()

    private var subscriptionId: String? = null

    init {
        loadPost()
        subscribeToWebSocket()
    }

    fun loadPost() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                val result = repository.getPost(feedId, postId)
                _post.value = result.post
                _permissions.value = result.permissions
                loadTags()
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load post"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun reactToPost(reaction: String) {
        viewModelScope.launch {
            try {
                repository.reactToPost(feedId, postId, reaction)
                _post.value = _post.value?.let { post ->
                    val newReaction = if (post.myReaction == reaction) "" else reaction
                    post.copy(myReaction = newReaction)
                }
            } catch (_: Exception) {
                loadPost()
            }
        }
    }

    fun setCommentText(text: String) {
        _commentText.value = text
    }

    fun addCommentAttachment(uri: Uri) {
        _commentAttachments.value = _commentAttachments.value + uri
    }

    fun removeCommentAttachment(uri: Uri) {
        _commentAttachments.value = _commentAttachments.value - uri
    }

    fun setReplyingTo(commentId: String?) {
        _replyingTo.value = commentId
    }

    fun sendComment() {
        val body = _commentText.value.trim()
        if (body.isEmpty()) return

        viewModelScope.launch {
            _isSendingComment.value = true
            _actionError.value = null
            try {
                val contentResolver = application.contentResolver
                repository.createComment(
                    feedId = feedId,
                    postId = postId,
                    body = body,
                    parent = _replyingTo.value,
                    files = _commentAttachments.value,
                    contentResolver = contentResolver
                )
                _commentText.value = ""
                _commentAttachments.value = emptyList()
                _replyingTo.value = null
                loadPost()
            } catch (e: MochiError) {
                _actionError.value = e.userMessage()
            } catch (e: Exception) {
                _actionError.value = e.message ?: "Failed to send comment"
            } finally {
                _isSendingComment.value = false
            }
        }
    }

    fun startEditComment(commentId: String, currentBody: String) {
        _editingCommentId.value = commentId
        _editCommentText.value = currentBody
    }

    fun cancelEditComment() {
        _editingCommentId.value = null
        _editCommentText.value = ""
    }

    fun setEditCommentText(text: String) {
        _editCommentText.value = text
    }

    fun saveEditComment() {
        val commentId = _editingCommentId.value ?: return
        val body = _editCommentText.value.trim()
        if (body.isEmpty()) return

        viewModelScope.launch {
            _actionError.value = null
            try {
                repository.editComment(feedId, postId, commentId, body)
                _editingCommentId.value = null
                _editCommentText.value = ""
                loadPost()
            } catch (e: MochiError) {
                _actionError.value = e.userMessage()
            } catch (e: Exception) {
                _actionError.value = e.message ?: "Failed to edit comment"
            }
        }
    }

    fun deleteComment(commentId: String) {
        viewModelScope.launch {
            _actionError.value = null
            try {
                repository.deleteComment(feedId, postId, commentId)
                loadPost()
            } catch (e: MochiError) {
                _actionError.value = e.userMessage()
            } catch (e: Exception) {
                _actionError.value = e.message ?: "Failed to delete comment"
            }
        }
    }

    fun reactToComment(commentId: String, reaction: String) {
        viewModelScope.launch {
            try {
                repository.reactToComment(feedId, postId, commentId, reaction)
                loadPost()
            } catch (_: Exception) {
                // Silent failure for reactions
            }
        }
    }

    fun addTag(label: String, qid: String? = null) {
        viewModelScope.launch {
            _actionError.value = null
            try {
                repository.addTag(feedId, postId, label, qid)
                loadTags()
                loadPost()
            } catch (e: MochiError) {
                _actionError.value = e.userMessage()
            } catch (e: Exception) {
                _actionError.value = e.message ?: "Failed to add tag"
            }
        }
    }

    fun removeTag(id: String) {
        viewModelScope.launch {
            _actionError.value = null
            try {
                repository.removeTag(feedId, postId, id)
                loadTags()
                loadPost()
            } catch (e: MochiError) {
                _actionError.value = e.userMessage()
            } catch (e: Exception) {
                _actionError.value = e.message ?: "Failed to remove tag"
            }
        }
    }

    fun deletePost(onSuccess: () -> Unit) {
        viewModelScope.launch {
            _actionError.value = null
            try {
                repository.deletePost(feedId, postId)
                onSuccess()
            } catch (e: MochiError) {
                _actionError.value = e.userMessage()
            } catch (e: Exception) {
                _actionError.value = e.message ?: "Failed to delete post"
            }
        }
    }

    fun clearActionError() {
        _actionError.value = null
    }

    private fun loadTags() {
        viewModelScope.launch {
            try {
                _tags.value = repository.getPostTags(feedId, postId)
            } catch (_: Exception) {
                // Tags are non-critical
            }
        }
    }

    private fun subscribeToWebSocket() {
        if (feedId.isEmpty()) return
        val serverUrl = sessionManager.getServerUrlBlocking()
        subscriptionId = webSocket.subscribe(serverUrl, feedId) { event ->
            if (event.post == postId) {
                when (event.type) {
                    "comment_created", "comment_deleted", "comment_edited",
                    "reaction", "post_updated" -> {
                        viewModelScope.launch { refreshSilently() }
                    }
                }
            }
        }
    }

    private suspend fun refreshSilently() {
        try {
            val result = repository.getPost(feedId, postId)
            _post.value = result.post
            _permissions.value = result.permissions
        } catch (_: Exception) {
            // Silent refresh
        }
    }

    override fun onCleared() {
        super.onCleared()
        subscriptionId?.let { webSocket.unsubscribe(it) }
    }
}
