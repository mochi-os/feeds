package org.mochi.feeds.repository

import android.content.ContentResolver
import android.net.Uri
import com.google.gson.Gson
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.mochi.android.api.toMochiError
import org.mochi.android.api.unwrap
import org.mochi.android.model.AccessRule
import org.mochi.android.model.Comment
import org.mochi.android.model.PlaceData
import org.mochi.android.model.User
import org.mochi.feeds.api.FeedsApi
import org.mochi.feeds.api.InterestSuggestion
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
    val hasMore: Boolean,
    val nextCursor: Long = 0,
    val permissions: Permissions = Permissions()
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

    // In-memory cache: feedId -> (posts, hasMore, timestamp)
    private val postCache = mutableMapOf<String, CachedPosts>()
    private val feedInfoCache = mutableMapOf<String, CachedFeedInfo>()
    private val cacheMaxAge = 60_000L // 1 minute

    private data class CachedPosts(
        val result: PostListResult,
        val sort: String?,
        val tag: String?,
        val unreadOnly: Boolean,
        val timestamp: Long = System.currentTimeMillis()
    )

    private data class CachedFeedInfo(
        val result: FeedInfoResult,
        val timestamp: Long = System.currentTimeMillis()
    )

    fun getCachedPosts(feedId: String, sort: String?, tag: String?, unreadOnly: Boolean): PostListResult? {
        val cached = postCache[feedId] ?: return null
        if (System.currentTimeMillis() - cached.timestamp > cacheMaxAge) return null
        if (cached.sort != sort || cached.tag != tag || cached.unreadOnly != unreadOnly) return null
        return cached.result
    }

    fun getCachedFeedInfo(feedId: String): FeedInfoResult? {
        val cached = feedInfoCache[feedId] ?: return null
        if (System.currentTimeMillis() - cached.timestamp > cacheMaxAge) return null
        return cached.result
    }

    fun invalidateCache(feedId: String) {
        postCache.remove(feedId)
        feedInfoCache.remove(feedId)
    }

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
            val result = FeedInfoResult(feed = response.feed, permissions = response.permissions)
            feedInfoCache[feedId] = CachedFeedInfo(result)
            result
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getPosts(
        feedId: String,
        before: String? = null,
        offset: Long? = null,
        limit: Int = 20,
        sort: String? = null,
        tag: String? = null,
        unreadOnly: Boolean = false
    ): PostListResult {
        val isFirstPage = before == null && offset == null
        // Only cache first-page requests
        if (isFirstPage) {
            getCachedPosts(feedId, sort, tag, unreadOnly)?.let { return it }
        }
        return try {
            val response = api.getPosts(
                feedId = feedId,
                before = before,
                offset = offset,
                limit = limit,
                sort = sort,
                tag = tag,
                unread = if (unreadOnly) "1" else null
            ).unwrap()
            val result = PostListResult(
                posts = response.posts,
                hasMore = response.hasMore,
                nextCursor = response.nextCursor,
                permissions = response.permissions
            )
            if (isFirstPage) {
                postCache[feedId] = CachedPosts(result, sort, tag, unreadOnly)
            }
            result
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
    ) {
        try {
            val multipartBody = buildPostBody(feedId, body, checkin, travellingOrigin, travellingDestination)
            files.forEachIndexed { index, (name, bytes) ->
                val mediaType = fileTypes.getOrElse(index) { "application/octet-stream" }
                multipartBody.addFormDataPart("files", name, bytes.toRequestBody(mediaType.toMediaTypeOrNull()))
            }
            api.createPost(feedId, multipartBody.build()).unwrap()
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
    ) {
        try {
            val multipartBody = buildPostBody(feedId, body, checkin, travellingOrigin, travellingDestination)
            for (uri in uris) {
                val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                val fileName = getFileName(contentResolver, uri)
                val bytes = contentResolver.openInputStream(uri)?.readBytes()
                    ?: throw IllegalStateException("Cannot read file")
                multipartBody.addFormDataPart("files", fileName, bytes.toRequestBody(mimeType.toMediaTypeOrNull()))
            }
            api.createPost(feedId, multipartBody.build()).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    private fun buildPostBody(
        feedId: String,
        body: String,
        checkin: PlaceData?,
        travellingOrigin: PlaceData?,
        travellingDestination: PlaceData?
    ): MultipartBody.Builder {
        val builder = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("feed", feedId)
            .addFormDataPart("body", body)

        val data = mutableMapOf<String, Any>()
        if (checkin != null) {
            data["checkin"] = mapOf("name" to checkin.name, "lat" to checkin.lat, "lon" to checkin.lon)
        }
        if (travellingOrigin != null || travellingDestination != null) {
            val travelling = mutableMapOf<String, Any>()
            travellingOrigin?.let { travelling["origin"] = mapOf("name" to it.name, "lat" to it.lat, "lon" to it.lon) }
            travellingDestination?.let { travelling["destination"] = mapOf("name" to it.name, "lat" to it.lat, "lon" to it.lon) }
            data["travelling"] = travelling
        }
        if (data.isNotEmpty()) {
            builder.addFormDataPart("data", Gson().toJson(data))
        }

        return builder
    }

    suspend fun editPost(
        feedId: String,
        postId: String,
        body: String,
        order: List<String>,
        newFiles: List<Uri>,
        contentResolver: ContentResolver,
        checkin: PlaceData? = null,
        travellingOrigin: PlaceData? = null,
        travellingDestination: PlaceData? = null
    ) {
        try {
            val builder = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("feed", feedId)
                .addFormDataPart("post", postId)
                .addFormDataPart("body", body)

            val data = mutableMapOf<String, Any>()
            if (checkin != null) {
                data["checkin"] = mapOf("name" to checkin.name, "lat" to checkin.lat, "lon" to checkin.lon)
            }
            if (travellingOrigin != null || travellingDestination != null) {
                val travelling = mutableMapOf<String, Any>()
                travellingOrigin?.let { travelling["origin"] = mapOf("name" to it.name, "lat" to it.lat, "lon" to it.lon) }
                travellingDestination?.let { travelling["destination"] = mapOf("name" to it.name, "lat" to it.lat, "lon" to it.lon) }
                data["travelling"] = travelling
            }
            if (data.isNotEmpty()) {
                builder.addFormDataPart("data", Gson().toJson(data))
            }

            for (item in order) {
                builder.addFormDataPart("order", item)
            }

            for (uri in newFiles) {
                val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                val fileName = getFileName(contentResolver, uri)
                val bytes = contentResolver.openInputStream(uri)?.readBytes()
                    ?: throw IllegalStateException("Cannot read file")
                builder.addFormDataPart("files", fileName, bytes.toRequestBody(mimeType.toMediaTypeOrNull()))
            }
            api.editPost(feedId, postId, builder.build()).unwrap()
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
            PostDetailResult(post = response.posts.first(), permissions = response.permissions)
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
            val builder = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("feed", feedId)
                .addFormDataPart("post", postId)
                .addFormDataPart("body", body)
            if (parent != null) {
                builder.addFormDataPart("parent", parent)
            }
            for (uri in files) {
                val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                val fileName = getFileName(contentResolver, uri)
                val bytes = contentResolver.openInputStream(uri)?.readBytes()
                    ?: throw IllegalStateException("Cannot read file")
                builder.addFormDataPart("files", fileName, bytes.toRequestBody(mimeType.toMediaTypeOrNull()))
            }
            api.createComment(feedId, postId, builder.build()).unwrap().comment
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

    suspend fun setAccess(feedId: String, subject: String, level: String) {
        try {
            api.setAccess(feedId, subject, level).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun revokeAccess(feedId: String, subject: String) {
        try {
            api.revokeAccess(feedId, subject).unwrap()
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

    suspend fun adjustInterest(feedId: String, qid: String?, label: String?, direction: String) {
        try {
            api.adjustInterest(feedId, qid, label, direction).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun getSuggestedInterests(feedId: String): List<InterestSuggestion> {
        return try {
            api.getSuggestedInterests(feedId).unwrap().suggestions
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

    suspend fun getAiPrompts(feedId: String): Pair<Map<String, String>, Map<String, String>> {
        return try {
            val response = api.getAiPrompts(feedId).unwrap()
            response.defaults to response.prompts
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun setAiPrompt(feedId: String, type: String, prompt: String) {
        try {
            api.setAiPrompt(feedId, type, prompt).unwrap()
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

    suspend fun addMember(feedId: String, member: String) {
        try {
            api.addMember(feedId, member).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun removeMember(feedId: String, member: String) {
        try {
            api.removeMember(feedId, member).unwrap()
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun searchMembers(feedId: String, query: String): List<Member> {
        return try {
            api.searchMembers(feedId, query).unwrap().members
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    // --- Banner ---

    suspend fun getBanner(feedId: String): String {
        return try {
            api.getBanner(feedId).unwrap().banner
        } catch (e: Exception) {
            throw e.toMochiError()
        }
    }

    suspend fun setBanner(feedId: String, banner: String) {
        try {
            api.setBanner(feedId, banner).unwrap()
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
