package org.mochi.feeds.repository

import android.content.ContentResolver
import android.net.Uri
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.mochi.android.api.toMochiError
import org.mochi.android.api.unwrap
import org.mochi.android.model.AccessRule
import org.mochi.android.model.Comment
import org.mochi.android.model.PlaceData
import org.mochi.android.model.User
import org.mochi.feeds.api.FeedsApi
import org.mochi.feeds.model.Feed
import org.mochi.feeds.model.Group
import org.mochi.feeds.model.Member
import org.mochi.feeds.model.Permissions
import org.mochi.feeds.model.Post
import org.mochi.feeds.model.Source
import org.mochi.feeds.model.Tag
import javax.inject.Inject
import javax.inject.Singleton

data class FeedInfoResult(
    val feed: Feed,
    val permissions: Permissions
)

data class PostListResult(
    val posts: List<Post>,
    val more: Boolean,
    val read: Int
)

data class PostDetailResult(
    val post: Post,
    val permissions: Permissions
)

data class ProbeResult(
    val feed: Feed?,
    val type: String
)

data class NotificationSettings(
    val enabled: Boolean,
    val mode: String
)

@Singleton
class FeedsRepository @Inject constructor(
    private val api: FeedsApi
) {

    // --- Class-level operations ---

    suspend fun listFeeds(): List<Feed> {
        return try {
            api.getInfo().unwrap().feeds
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun createFeed(name: String, privacy: String, memories: Boolean): Feed {
        return try {
            api.createFeed(name, privacy, memories).unwrap().feed
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun searchDirectory(query: String): List<Feed> {
        return try {
            api.searchDirectory(query).unwrap().feeds
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getRecommendations(): List<Feed> {
        return try {
            api.getRecommendations().unwrap().feeds
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun probeUrl(url: String): ProbeResult {
        return try {
            val response = api.probeUrl(url).unwrap()
            ProbeResult(feed = response.feed, type = response.type)
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun subscribeFeed(feed: String, server: String? = null) {
        try {
            api.subscribe(feed, server).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun unsubscribeFeed(feed: String, server: String? = null) {
        try {
            api.unsubscribe(feed, server).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getRssToken(feed: String, mode: String): String {
        return try {
            api.getRssToken(feed, mode).unwrap().token
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun checkNotifications(): Boolean {
        return try {
            api.checkNotifications().unwrap().exists
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun searchUsers(query: String): List<User> {
        return try {
            api.searchUsers(query).unwrap().users
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getGroups(): List<Group> {
        return try {
            api.getGroups().unwrap().groups
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    // --- Entity-level operations ---

    suspend fun getFeedInfo(feedId: String): FeedInfoResult {
        return try {
            val response = api.getFeedInfo(feedId).unwrap()
            FeedInfoResult(feed = response.feed, permissions = response.permissions)
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getPosts(
        feedId: String,
        before: String? = null,
        limit: Int = 20,
        sort: String? = null,
        tag: String? = null,
        unreadOnly: Boolean = false
    ): PostListResult {
        return try {
            val response = api.getPosts(
                feedId = feedId,
                before = before,
                limit = limit,
                sort = sort,
                tag = tag,
                unread = if (unreadOnly) "1" else null
            ).unwrap()
            PostListResult(posts = response.posts, more = response.more, read = response.read)
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun deleteFeed(feedId: String) {
        try {
            api.deleteFeed(feedId).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun renameFeed(feedId: String, name: String) {
        try {
            api.renameFeed(feedId, name).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun markAllRead(feedId: String) {
        try {
            api.markAllRead(feedId).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun markPostsRead(feedId: String, postIds: List<String>) {
        if (postIds.isEmpty()) return
        try {
            api.markPostsRead(feedId, postIds.joinToString(",")).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun createPost(
        feedId: String,
        body: String,
        files: List<Pair<String, ByteArray>>,
        fileTypes: List<String>,
        checkin: PlaceData? = null,
        travellingOrigin: PlaceData? = null,
        travellingDestination: PlaceData? = null
    ): Post {
        return try {
            val bodyPart = body.toRequestBody("text/plain".toMediaTypeOrNull())
            val fileParts = files.mapIndexed { index, (name, bytes) ->
                val mediaType = fileTypes.getOrElse(index) { "application/octet-stream" }
                val requestBody = bytes.toRequestBody(mediaType.toMediaTypeOrNull())
                MultipartBody.Part.createFormData("file[]", name, requestBody)
            }
            val checkinPart = checkin?.let {
                com.google.gson.Gson().toJson(it).toRequestBody("text/plain".toMediaTypeOrNull())
            }
            val originPart = travellingOrigin?.let {
                com.google.gson.Gson().toJson(it).toRequestBody("text/plain".toMediaTypeOrNull())
            }
            val destPart = travellingDestination?.let {
                com.google.gson.Gson().toJson(it).toRequestBody("text/plain".toMediaTypeOrNull())
            }
            api.createPost(feedId, bodyPart, fileParts, checkinPart, originPart, destPart).unwrap().post
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun createPostFromUris(
        feedId: String,
        body: String,
        uris: List<Uri>,
        contentResolver: ContentResolver,
        checkin: PlaceData? = null,
        travellingOrigin: PlaceData? = null,
        travellingDestination: PlaceData? = null
    ): Post {
        return try {
            val bodyPart = body.toRequestBody("text/plain".toMediaTypeOrNull())
            val fileParts = uris.map { uri ->
                val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                val fileName = getFileName(contentResolver, uri)
                val bytes = contentResolver.openInputStream(uri)?.readBytes()
                    ?: throw IllegalStateException("Cannot read file")
                val requestBody = bytes.toRequestBody(mimeType.toMediaTypeOrNull())
                MultipartBody.Part.createFormData("file[]", fileName, requestBody)
            }
            val checkinPart = checkin?.let {
                com.google.gson.Gson().toJson(it).toRequestBody("text/plain".toMediaTypeOrNull())
            }
            val originPart = travellingOrigin?.let {
                com.google.gson.Gson().toJson(it).toRequestBody("text/plain".toMediaTypeOrNull())
            }
            val destPart = travellingDestination?.let {
                com.google.gson.Gson().toJson(it).toRequestBody("text/plain".toMediaTypeOrNull())
            }
            api.createPost(feedId, bodyPart, fileParts, checkinPart, originPart, destPart).unwrap().post
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun editPost(
        feedId: String,
        postId: String,
        body: String,
        newFiles: List<Uri>,
        contentResolver: ContentResolver,
        removeFileIds: List<String>
    ) {
        try {
            val bodyPart = body.toRequestBody("text/plain".toMediaTypeOrNull())
            val fileParts = newFiles.map { uri ->
                val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                val fileName = getFileName(contentResolver, uri)
                val bytes = contentResolver.openInputStream(uri)?.readBytes()
                    ?: throw IllegalStateException("Cannot read file")
                val requestBody = bytes.toRequestBody(mimeType.toMediaTypeOrNull())
                MultipartBody.Part.createFormData("file[]", fileName, requestBody)
            }
            val removePart = if (removeFileIds.isNotEmpty()) {
                removeFileIds.joinToString(",").toRequestBody("text/plain".toMediaTypeOrNull())
            } else null
            api.editPost(feedId, postId, bodyPart, fileParts, removePart).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun deletePost(feedId: String, postId: String) {
        try {
            api.deletePost(feedId, postId).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun reactToPost(feedId: String, postId: String, reaction: String) {
        try {
            api.reactToPost(feedId, postId, reaction).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getPost(feedId: String, postId: String): PostDetailResult {
        return try {
            val response = api.getPost(feedId, postId).unwrap()
            PostDetailResult(post = response.post, permissions = response.permissions)
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getNewPostFeeds(feedId: String): List<Feed> {
        return try {
            api.getNewPostFeeds(feedId).unwrap().feeds
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    // --- Comments ---

    suspend fun createComment(
        feedId: String,
        postId: String,
        body: String,
        parent: String? = null,
        files: List<Uri>,
        contentResolver: ContentResolver
    ): Comment {
        return try {
            val bodyPart = body.toRequestBody("text/plain".toMediaTypeOrNull())
            val parentPart = parent?.toRequestBody("text/plain".toMediaTypeOrNull())
            val fileParts = files.map { uri ->
                val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                val fileName = getFileName(contentResolver, uri)
                val bytes = contentResolver.openInputStream(uri)?.readBytes()
                    ?: throw IllegalStateException("Cannot read file")
                val requestBody = bytes.toRequestBody(mimeType.toMediaTypeOrNull())
                MultipartBody.Part.createFormData("file[]", fileName, requestBody)
            }
            api.createComment(feedId, postId, bodyPart, parentPart, fileParts).unwrap().comment
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun editComment(feedId: String, postId: String, commentId: String, body: String) {
        try {
            api.editComment(feedId, postId, commentId, body).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun deleteComment(feedId: String, postId: String, commentId: String) {
        try {
            api.deleteComment(feedId, postId, commentId).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun reactToComment(feedId: String, postId: String, commentId: String, reaction: String) {
        try {
            api.reactToComment(feedId, postId, commentId, reaction).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    // --- Access control ---

    suspend fun getAccessRules(feedId: String): List<AccessRule> {
        return try {
            api.getAccessRules(feedId).unwrap().rules
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun setAccess(feedId: String, subject: String, operation: String) {
        try {
            api.setAccess(feedId, subject, operation).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun revokeAccess(feedId: String, id: Int) {
        try {
            api.revokeAccess(feedId, id).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    // --- Sources ---

    suspend fun getSources(feedId: String): List<Source> {
        return try {
            api.getSources(feedId).unwrap().sources
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun addSource(feedId: String, url: String, type: String): Source {
        return try {
            api.addSource(feedId, url, type).unwrap().source
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun editSource(
        feedId: String,
        id: String,
        name: String? = null,
        credibility: Double? = null,
        transform: String? = null
    ) {
        try {
            api.editSource(feedId, id, name, credibility, transform).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun removeSource(feedId: String, id: String, deletePosts: Boolean = false) {
        try {
            api.removeSource(feedId, id, deletePosts).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun pollSource(feedId: String, id: String) {
        try {
            api.pollSource(feedId, id).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    // --- Tags ---

    suspend fun getTags(feedId: String): List<Tag> {
        return try {
            api.getTags(feedId).unwrap().tags
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getPostTags(feedId: String, postId: String): List<Tag> {
        return try {
            api.getPostTags(feedId, postId).unwrap().tags
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun addTag(feedId: String, postId: String, label: String, qid: String? = null) {
        try {
            api.addTag(feedId, postId, label, qid).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun removeTag(feedId: String, postId: String, id: String) {
        try {
            api.removeTag(feedId, postId, id).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun adjustInterest(feedId: String, tag: String, direction: String) {
        try {
            api.adjustInterest(feedId, tag, direction).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getSuggestedInterests(feedId: String): List<Tag> {
        return try {
            api.getSuggestedInterests(feedId).unwrap().interests
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    // --- AI ---

    suspend fun setAiSettings(feedId: String, mode: String) {
        try {
            api.setAiSettings(feedId, mode).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getAiPrompts(feedId: String): String {
        return try {
            api.getAiPrompts(feedId).unwrap().prompt
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun setAiPrompts(feedId: String, prompt: String) {
        try {
            api.setAiPrompts(feedId, prompt).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    // --- Notifications ---

    suspend fun getNotificationSettings(feedId: String): NotificationSettings {
        return try {
            val response = api.getNotificationSettings(feedId).unwrap()
            NotificationSettings(enabled = response.enabled, mode = response.mode)
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun setNotificationSettings(feedId: String, enabled: Boolean, mode: String) {
        try {
            api.setNotificationSettings(feedId, enabled, mode).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun resetNotifications(feedId: String) {
        try {
            api.resetNotifications(feedId).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun clearNotifications(feedId: String) {
        try {
            api.clearNotifications(feedId).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    // --- Members ---

    suspend fun getMembers(feedId: String): List<Member> {
        return try {
            api.getMembers(feedId).unwrap().members
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun addMember(feedId: String, user: String) {
        try {
            api.addMember(feedId, user).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun removeMember(feedId: String, user: String) {
        try {
            api.removeMember(feedId, user).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    // --- Helpers ---

    private fun getFileName(contentResolver: ContentResolver, uri: Uri): String {
        var name = "file"
        val cursor = contentResolver.query(uri, null, null, null, null)
        cursor?.use {
            if (it.moveToFirst()) {
                val nameIndex = it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0) {
                    name = it.getString(nameIndex)
                }
            }
        }
        return name
    }
}
