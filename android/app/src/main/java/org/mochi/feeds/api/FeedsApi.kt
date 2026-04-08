package org.mochi.feeds.api

import com.google.gson.annotations.SerializedName
import okhttp3.RequestBody
import org.mochi.android.api.ApiResponse
import org.mochi.android.model.AccessRule
import org.mochi.android.model.Comment
import org.mochi.android.model.User
import org.mochi.feeds.model.Feed
import org.mochi.feeds.model.Group
import org.mochi.feeds.model.Member
import org.mochi.feeds.model.Permissions
import org.mochi.feeds.model.Post
import org.mochi.feeds.model.Source
import org.mochi.feeds.model.Tag
import retrofit2.Response
import retrofit2.http.Field
import retrofit2.http.FormUrlEncoded
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

// Response wrapper types

data class FeedListResponse(
    val feeds: List<Feed> = emptyList()
)

data class FeedCreateResponse(
    val feed: Feed
)

data class FeedInfoResponse(
    val feed: Feed,
    val permissions: Permissions = Permissions()
)

data class PostListResponse(
    val posts: List<Post> = emptyList(),
    val hasMore: Boolean = false,
    val nextCursor: Long = 0,
    val permissions: Permissions = Permissions(),
    val owner: Boolean = false
)

data class PostDetailResponse(
    val posts: List<Post> = emptyList(),
    val permissions: Permissions = Permissions()
)

data class PostCreateResponse(
    val id: String = ""
)

data class SuccessResponse(
    val success: Boolean = false
)

data class DirectorySearchResponse(
    val feeds: List<Feed> = emptyList()
)

data class RecommendationsResponse(
    val feeds: List<Feed> = emptyList()
)

data class ProbeResponse(
    val feed: Feed? = null,
    val type: String = ""
)

data class RssTokenResponse(
    val token: String = ""
)

data class BannerResponse(
    val banner: String = ""
)

data class NotificationsCheckResponse(
    val exists: Boolean = false
)

data class SourceListResponse(
    val sources: List<Source> = emptyList()
)

data class SourceAddResponse(
    val source: Source
)

data class TagListResponse(
    val tags: List<Tag> = emptyList()
)

data class AccessListResponse(
    val rules: List<AccessRule> = emptyList()
)

data class NotificationSettingsResponse(
    val enabled: Boolean = false,
    val mode: String = ""
)

data class AiPromptsResponse(
    val defaults: Map<String, String> = emptyMap(),
    val prompts: Map<String, String> = emptyMap()
)

data class CommentCreateResponse(
    val comment: Comment
)

data class NewPostResponse(
    val feeds: List<Feed> = emptyList()
)

data class MemberListResponse(
    val members: List<Member> = emptyList()
)

data class MemberSearchResponse(
    val members: List<Member> = emptyList()
)

data class UserSearchResponse(
    val users: List<User> = emptyList()
)

data class GroupListResponse(
    val groups: List<Group> = emptyList()
)

data class InterestSuggestion(
    val qid: String = "",
    val label: String = "",
    val count: Int = 0
)

data class InterestSuggestResponse(
    val suggestions: List<InterestSuggestion> = emptyList()
)

interface FeedsApi {

    // --- Class-level endpoints (no entity) ---

    @GET("-/info")
    suspend fun getInfo(): Response<ApiResponse<FeedListResponse>>

    @FormUrlEncoded
    @POST("-/create")
    suspend fun createFeed(
        @Field("name") name: String,
        @Field("privacy") privacy: String,
        @Field("memories") memories: Boolean
    ): Response<ApiResponse<FeedCreateResponse>>

    @GET("-/directory/search")
    suspend fun searchDirectory(
        @Query("q") query: String
    ): Response<ApiResponse<DirectorySearchResponse>>

    @GET("-/recommendations")
    suspend fun getRecommendations(): Response<ApiResponse<RecommendationsResponse>>

    @GET("-/probe")
    suspend fun probeUrl(
        @Query("url") url: String
    ): Response<ApiResponse<ProbeResponse>>

    @FormUrlEncoded
    @POST("-/subscribe")
    suspend fun subscribe(
        @Field("feed") feed: String,
        @Field("server") server: String?
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("-/unsubscribe")
    suspend fun unsubscribe(
        @Field("feed") feed: String,
        @Field("server") server: String?
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("-/rss/token")
    suspend fun getRssToken(
        @Field("feed") feed: String,
        @Field("mode") mode: String
    ): Response<ApiResponse<RssTokenResponse>>

    @GET("-/notifications/check")
    suspend fun checkNotifications(): Response<ApiResponse<NotificationsCheckResponse>>

    @FormUrlEncoded
    @POST("-/users/search")
    suspend fun searchUsers(
        @Field("query") query: String
    ): Response<ApiResponse<UserSearchResponse>>

    @GET("-/groups")
    suspend fun getGroups(): Response<ApiResponse<GroupListResponse>>

    // --- Entity-level endpoints ---

    @GET("{feedId}/-/info")
    suspend fun getFeedInfo(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<FeedInfoResponse>>

    @GET("{feedId}/-/posts")
    suspend fun getPosts(
        @Path("feedId") feedId: String,
        @Query("before") before: String? = null,
        @Query("offset") offset: Long? = null,
        @Query("limit") limit: Int = 20,
        @Query("sort") sort: String? = null,
        @Query("tag") tag: String? = null,
        @Query("unread") unread: String? = null
    ): Response<ApiResponse<PostListResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/delete")
    suspend fun deleteFeed(
        @Path("feedId") feedId: String,
        @Field("confirm") confirm: Boolean = true
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/rename")
    suspend fun renameFeed(
        @Path("feedId") feedId: String,
        @Field("name") name: String
    ): Response<ApiResponse<SuccessResponse>>

    @POST("{feedId}/-/read-all")
    suspend fun markAllRead(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/posts/read")
    suspend fun markPostsRead(
        @Path("feedId") feedId: String,
        @Field("posts") posts: String
    ): Response<ApiResponse<SuccessResponse>>

    @POST("{feedId}/-/post/create")
    suspend fun createPost(
        @Path("feedId") feedId: String,
        @retrofit2.http.Body body: RequestBody
    ): Response<ApiResponse<PostCreateResponse>>

    @GET("{feedId}/-/post/new")
    suspend fun getNewPostFeeds(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<NewPostResponse>>

    @POST("{feedId}/-/{postId}/edit")
    suspend fun editPost(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String,
        @retrofit2.http.Body body: RequestBody
    ): Response<ApiResponse<SuccessResponse>>

    @POST("{feedId}/-/{postId}/delete")
    suspend fun deletePost(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/{postId}/react")
    suspend fun reactToPost(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String,
        @Field("reaction") reaction: String
    ): Response<ApiResponse<SuccessResponse>>

    @GET("{feedId}/-/{postId}")
    suspend fun getPost(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String
    ): Response<ApiResponse<PostDetailResponse>>

    @POST("{feedId}/-/{postId}/comment/create")
    suspend fun createComment(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String,
        @retrofit2.http.Body body: RequestBody
    ): Response<ApiResponse<CommentCreateResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/{postId}/{commentId}/edit")
    suspend fun editComment(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String,
        @Path("commentId") commentId: String,
        @Field("body") body: String
    ): Response<ApiResponse<SuccessResponse>>

    @POST("{feedId}/-/{postId}/{commentId}/delete")
    suspend fun deleteComment(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String,
        @Path("commentId") commentId: String
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/{postId}/comment/react")
    suspend fun reactToComment(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String,
        @Field("comment") comment: String,
        @Field("reaction") reaction: String
    ): Response<ApiResponse<SuccessResponse>>

    // --- Access control ---

    @GET("{feedId}/-/access")
    suspend fun getAccessRules(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<AccessListResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/access/set")
    suspend fun setAccess(
        @Path("feedId") feedId: String,
        @Field("subject") subject: String,
        @Field("level") level: String
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/access/revoke")
    suspend fun revokeAccess(
        @Path("feedId") feedId: String,
        @Field("subject") subject: String
    ): Response<ApiResponse<SuccessResponse>>

    // --- Sources ---

    @GET("{feedId}/-/sources")
    suspend fun getSources(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<SourceListResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/sources/add")
    suspend fun addSource(
        @Path("feedId") feedId: String,
        @Field("url") url: String,
        @Field("type") type: String
    ): Response<ApiResponse<SourceAddResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/sources/edit")
    suspend fun editSource(
        @Path("feedId") feedId: String,
        @Field("id") id: String,
        @Field("name") name: String?,
        @Field("credibility") credibility: Double?,
        @Field("transform") transform: String?
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/sources/remove")
    suspend fun removeSource(
        @Path("feedId") feedId: String,
        @Field("id") id: String,
        @Field("delete_posts") deletePosts: Boolean?
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/sources/poll")
    suspend fun pollSource(
        @Path("feedId") feedId: String,
        @Field("id") id: String
    ): Response<ApiResponse<SuccessResponse>>

    // --- Tags ---

    @GET("{feedId}/-/tags")
    suspend fun getTags(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<TagListResponse>>

    @GET("{feedId}/-/{postId}/tags")
    suspend fun getPostTags(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String
    ): Response<ApiResponse<TagListResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/{postId}/tags/add")
    suspend fun addTag(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String,
        @Field("label") label: String,
        @Field("qid") qid: String?
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/{postId}/tags/remove")
    suspend fun removeTag(
        @Path("feedId") feedId: String,
        @Path("postId") postId: String,
        @Field("id") id: String
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/tags/interest")
    suspend fun adjustInterest(
        @Path("feedId") feedId: String,
        @Field("qid") qid: String?,
        @Field("label") label: String?,
        @Field("direction") direction: String
    ): Response<ApiResponse<SuccessResponse>>

    @GET("{feedId}/-/interests/suggest")
    suspend fun getSuggestedInterests(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<InterestSuggestResponse>>

    // --- AI ---

    @FormUrlEncoded
    @POST("{feedId}/-/ai/settings")
    suspend fun setAiSettings(
        @Path("feedId") feedId: String,
        @Field("mode") mode: String
    ): Response<ApiResponse<SuccessResponse>>

    @GET("{feedId}/-/ai/prompts/get")
    suspend fun getAiPrompts(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<AiPromptsResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/ai/prompts/set")
    suspend fun setAiPrompt(
        @Path("feedId") feedId: String,
        @Field("type") type: String,
        @Field("prompt") prompt: String
    ): Response<ApiResponse<SuccessResponse>>

    // --- Notifications ---

    @GET("{feedId}/-/notifications/get")
    suspend fun getNotificationSettings(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<NotificationSettingsResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/notifications/set")
    suspend fun setNotificationSettings(
        @Path("feedId") feedId: String,
        @Field("enabled") enabled: Boolean,
        @Field("mode") mode: String
    ): Response<ApiResponse<SuccessResponse>>

    @POST("{feedId}/-/notifications/reset")
    suspend fun resetNotifications(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<SuccessResponse>>

    @POST("{feedId}/-/notifications/clear")
    suspend fun clearNotifications(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<SuccessResponse>>

    // --- Members ---

    @GET("{feedId}/-/members")
    suspend fun getMembers(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<MemberListResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/members/add")
    suspend fun addMember(
        @Path("feedId") feedId: String,
        @Field("member") member: String
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/members/remove")
    suspend fun removeMember(
        @Path("feedId") feedId: String,
        @Field("member") member: String
    ): Response<ApiResponse<SuccessResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/members/search")
    suspend fun searchMembers(
        @Path("feedId") feedId: String,
        @Field("q") query: String
    ): Response<ApiResponse<MemberSearchResponse>>

    // --- Banner ---

    @GET("{feedId}/-/banner/get")
    suspend fun getBanner(
        @Path("feedId") feedId: String
    ): Response<ApiResponse<BannerResponse>>

    @FormUrlEncoded
    @POST("{feedId}/-/banner/set")
    suspend fun setBanner(
        @Path("feedId") feedId: String,
        @Field("banner") banner: String
    ): Response<ApiResponse<SuccessResponse>>
}
