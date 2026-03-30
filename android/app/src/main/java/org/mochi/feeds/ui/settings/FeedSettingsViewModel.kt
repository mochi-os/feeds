package org.mochi.feeds.ui.settings

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
import org.mochi.android.model.AccessRule
import org.mochi.android.model.User
import org.mochi.feeds.model.Feed
import org.mochi.feeds.model.Source
import org.mochi.feeds.repository.FeedsRepository
import org.mochi.feeds.repository.NotificationSettings
import javax.inject.Inject

@HiltViewModel
class FeedSettingsViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: FeedsRepository,
    private val sessionManager: SessionManager
) : ViewModel() {

    val feedId: String = savedStateHandle.get<String>("feedId") ?: ""

    // General tab
    private val _feedInfo = MutableStateFlow<Feed?>(null)
    val feedInfo: StateFlow<Feed?> = _feedInfo.asStateFlow()

    private val _feedName = MutableStateFlow("")
    val feedName: StateFlow<String> = _feedName.asStateFlow()

    private val _rssToken = MutableStateFlow<String?>(null)
    val rssToken: StateFlow<String?> = _rssToken.asStateFlow()

    // Sources tab
    private val _sources = MutableStateFlow<List<Source>>(emptyList())
    val sources: StateFlow<List<Source>> = _sources.asStateFlow()

    private val _isLoadingSources = MutableStateFlow(false)
    val isLoadingSources: StateFlow<Boolean> = _isLoadingSources.asStateFlow()

    // Access tab
    private val _accessRules = MutableStateFlow<List<AccessRule>>(emptyList())
    val accessRules: StateFlow<List<AccessRule>> = _accessRules.asStateFlow()

    private val _isLoadingAccess = MutableStateFlow(false)
    val isLoadingAccess: StateFlow<Boolean> = _isLoadingAccess.asStateFlow()

    // AI tab
    private val _aiMode = MutableStateFlow("none")
    val aiMode: StateFlow<String> = _aiMode.asStateFlow()

    private val _aiPrompt = MutableStateFlow("")
    val aiPrompt: StateFlow<String> = _aiPrompt.asStateFlow()

    // Notifications tab
    private val _notificationSettings = MutableStateFlow(NotificationSettings(false, "each"))
    val notificationSettings: StateFlow<NotificationSettings> = _notificationSettings.asStateFlow()

    // Common
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _actionMessage = MutableStateFlow<String?>(null)
    val actionMessage: StateFlow<String?> = _actionMessage.asStateFlow()

    // User search for access control
    private val _userSearchResults = MutableStateFlow<List<User>>(emptyList())
    val userSearchResults: StateFlow<List<User>> = _userSearchResults.asStateFlow()

    init {
        loadFeedInfo()
    }

    fun loadFeedInfo() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val info = repository.getFeedInfo(feedId)
                _feedInfo.value = info.feed
                _feedName.value = info.feed.name
                _aiMode.value = info.feed.aiMode ?: "none"
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load feed info"
            } finally {
                _isLoading.value = false
            }
        }
    }

    // --- General ---

    fun setFeedName(name: String) {
        _feedName.value = name
    }

    fun saveFeedName() {
        val name = _feedName.value.trim()
        if (name.isEmpty()) return
        viewModelScope.launch {
            try {
                repository.renameFeed(feedId, name)
                _actionMessage.value = "Feed renamed"
                _feedInfo.value = _feedInfo.value?.copy(name = name)
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to rename feed"
            }
        }
    }

    fun deleteFeed(onSuccess: () -> Unit) {
        viewModelScope.launch {
            try {
                repository.deleteFeed(feedId)
                onSuccess()
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to delete feed"
            }
        }
    }

    fun generateRssToken() {
        viewModelScope.launch {
            try {
                val token = repository.getRssToken(feedId, "read")
                val serverUrl = sessionManager.getServerUrlBlocking().trimEnd('/')
                _rssToken.value = "$serverUrl/feeds/$feedId/-/rss?token=$token"
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to generate RSS token"
            }
        }
    }

    // --- Sources ---

    fun loadSources() {
        viewModelScope.launch {
            _isLoadingSources.value = true
            try {
                _sources.value = repository.getSources(feedId)
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load sources"
            } finally {
                _isLoadingSources.value = false
            }
        }
    }

    fun addSource(url: String, type: String) {
        viewModelScope.launch {
            try {
                repository.addSource(feedId, url, type)
                _actionMessage.value = "Source added"
                loadSources()
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to add source"
            }
        }
    }

    fun editSource(id: String, name: String?, credibility: Double?, transform: String?) {
        viewModelScope.launch {
            try {
                repository.editSource(feedId, id, name, credibility, transform)
                _actionMessage.value = "Source updated"
                loadSources()
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to edit source"
            }
        }
    }

    fun removeSource(id: String, deletePosts: Boolean) {
        viewModelScope.launch {
            try {
                repository.removeSource(feedId, id, deletePosts)
                _actionMessage.value = "Source removed"
                loadSources()
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to remove source"
            }
        }
    }

    fun pollSource(id: String) {
        viewModelScope.launch {
            try {
                repository.pollSource(feedId, id)
                _actionMessage.value = "Polling source..."
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to poll source"
            }
        }
    }

    // --- Access ---

    fun loadAccessRules() {
        viewModelScope.launch {
            _isLoadingAccess.value = true
            try {
                _accessRules.value = repository.getAccessRules(feedId)
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to load access rules"
            } finally {
                _isLoadingAccess.value = false
            }
        }
    }

    fun setAccess(subject: String, operation: String) {
        viewModelScope.launch {
            try {
                repository.setAccess(feedId, subject, operation)
                _actionMessage.value = "Access updated"
                loadAccessRules()
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to set access"
            }
        }
    }

    fun revokeAccess(id: Int) {
        viewModelScope.launch {
            try {
                repository.revokeAccess(feedId, id)
                _actionMessage.value = "Access revoked"
                loadAccessRules()
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to revoke access"
            }
        }
    }

    fun searchUsers(query: String) {
        viewModelScope.launch {
            try {
                _userSearchResults.value = repository.searchUsers(query)
            } catch (_: Exception) {
                _userSearchResults.value = emptyList()
            }
        }
    }

    // --- AI ---

    fun setAiMode(mode: String) {
        _aiMode.value = mode
        viewModelScope.launch {
            try {
                repository.setAiSettings(feedId, mode)
                _actionMessage.value = "AI mode updated"
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to update AI mode"
            }
        }
    }

    fun loadAiPrompt() {
        viewModelScope.launch {
            try {
                _aiPrompt.value = repository.getAiPrompts(feedId)
            } catch (_: Exception) {
                // Non-critical
            }
        }
    }

    fun setAiPromptText(text: String) {
        _aiPrompt.value = text
    }

    fun saveAiPrompt() {
        viewModelScope.launch {
            try {
                repository.setAiPrompts(feedId, _aiPrompt.value)
                _actionMessage.value = "Prompt saved"
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to save prompt"
            }
        }
    }

    // --- Notifications ---

    fun loadNotificationSettings() {
        viewModelScope.launch {
            try {
                _notificationSettings.value = repository.getNotificationSettings(feedId)
            } catch (_: Exception) {
                // Non-critical
            }
        }
    }

    fun setNotificationEnabled(enabled: Boolean) {
        val current = _notificationSettings.value
        _notificationSettings.value = current.copy(enabled = enabled)
        viewModelScope.launch {
            try {
                repository.setNotificationSettings(feedId, enabled, current.mode)
            } catch (e: MochiError) {
                _error.value = e.userMessage()
                _notificationSettings.value = current
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to update notifications"
                _notificationSettings.value = current
            }
        }
    }

    fun setNotificationMode(mode: String) {
        val current = _notificationSettings.value
        _notificationSettings.value = current.copy(mode = mode)
        viewModelScope.launch {
            try {
                repository.setNotificationSettings(feedId, current.enabled, mode)
            } catch (e: MochiError) {
                _error.value = e.userMessage()
                _notificationSettings.value = current
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to update notification mode"
                _notificationSettings.value = current
            }
        }
    }

    fun resetNotifications() {
        viewModelScope.launch {
            try {
                repository.resetNotifications(feedId)
                _actionMessage.value = "Notifications reset"
                loadNotificationSettings()
            } catch (e: MochiError) {
                _error.value = e.userMessage()
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to reset notifications"
            }
        }
    }

    fun clearError() {
        _error.value = null
    }

    fun clearActionMessage() {
        _actionMessage.value = null
    }
}
