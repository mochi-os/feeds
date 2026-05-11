package org.mochios.feeds.ui.post

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SheetValue
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.launch
import org.mochios.feeds.R
import org.mochios.android.R as MochiR

// Chrome-on-Android UA. Some publishers' bot/embed detection 403s the default
// "wv" WebView user agent; impersonating regular Chrome makes most articles load.
private const val CHROME_USER_AGENT =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/127.0.0.0 Mobile Safari/537.36"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PostSourceScreen(
    sourceUrl: String,
    onNavigateBack: () -> Unit,
    onEditPost: (feedId: String, postId: String) -> Unit,
    viewModel: PostDetailViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val post by viewModel.post.collectAsState()
    val permissions by viewModel.permissions.collectAsState()
    val commentText by viewModel.commentText.collectAsState()
    val commentAttachments by viewModel.commentAttachments.collectAsState()
    val isSendingComment by viewModel.isSendingComment.collectAsState()
    val replyingTo by viewModel.replyingTo.collectAsState()
    val actionError by viewModel.actionError.collectAsState()

    var showDeleteDialog by remember { mutableStateOf(false) }
    var showDeleteCommentDialog by remember { mutableStateOf<String?>(null) }
    var showAddTagDialog by remember { mutableStateOf(false) }
    var showOverflowMenu by remember { mutableStateOf(false) }

    var webView by remember { mutableStateOf<WebView?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    var loadProgress by remember { mutableIntStateOf(0) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var reloadNonce by remember { mutableIntStateOf(0) }

    val snackbarHostState = remember { SnackbarHostState() }
    val sheetState = rememberStandardBottomSheetState(initialValue = SheetValue.PartiallyExpanded)
    val scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = sheetState)
    val coroutineScope = rememberCoroutineScope()

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        uris.forEach { viewModel.addCommentAttachment(it) }
    }

    LaunchedEffect(actionError) {
        actionError?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearActionError()
        }
    }

    BackHandler(enabled = canGoBack || sheetState.currentValue == SheetValue.Expanded) {
        when {
            sheetState.currentValue == SheetValue.Expanded -> {
                coroutineScope.launch { sheetState.partialExpand() }
            }
            canGoBack -> webView?.goBack()
        }
    }

    val urlHost = remember(sourceUrl) {
        try {
            Uri.parse(sourceUrl).host ?: sourceUrl
        } catch (_: Exception) {
            sourceUrl
        }
    }

    BottomSheetScaffold(
        scaffoldState = scaffoldState,
        sheetPeekHeight = 72.dp,
        // Default DragHandle wraps the pill in 22dp of vertical padding (44dp
        // total) which both eats peek space (clipping the comment-count row)
        // and centres the pill low in the visible area. Custom handle: pill
        // pinned to the top with extra bottom padding, lifting it clear of
        // the screen edge while keeping the peek thin.
        sheetDragHandle = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 4.dp, bottom = 16.dp),
                contentAlignment = Alignment.TopCenter
            ) {
                Box(
                    modifier = Modifier
                        .size(width = 32.dp, height = 4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f))
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = urlHost,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(MochiR.string.common_back)
                        )
                    }
                },
                actions = {
                    Box {
                        IconButton(onClick = { showOverflowMenu = true }) {
                            Icon(
                                Icons.Default.MoreVert,
                                contentDescription = stringResource(MochiR.string.common_more_options)
                            )
                        }
                        DropdownMenu(
                            expanded = showOverflowMenu,
                            onDismissRequest = { showOverflowMenu = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.feeds_open_in_browser)) },
                                leadingIcon = {
                                    Icon(Icons.Default.OpenInBrowser, contentDescription = null)
                                },
                                onClick = {
                                    showOverflowMenu = false
                                    try {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(sourceUrl)))
                                    } catch (_: Exception) {
                                        // invalid URL
                                    }
                                }
                            )
                            if (permissions.manage) {
                                DropdownMenuItem(
                                    text = { Text(stringResource(MochiR.string.common_edit)) },
                                    leadingIcon = {
                                        Icon(Icons.Default.Edit, contentDescription = null)
                                    },
                                    onClick = {
                                        showOverflowMenu = false
                                        onEditPost(viewModel.feedId, viewModel.postId)
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text(stringResource(MochiR.string.common_delete)) },
                                    leadingIcon = {
                                        Icon(
                                            Icons.Default.Delete,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.error
                                        )
                                    },
                                    onClick = {
                                        showOverflowMenu = false
                                        showDeleteDialog = true
                                    }
                                )
                            }
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        sheetContent = {
            PostSourceSheet(
                viewModel = viewModel,
                permissions = permissions,
                commentText = commentText,
                onCommentTextChange = { viewModel.setCommentText(it) },
                commentAttachments = commentAttachments,
                onAddAttachment = { filePickerLauncher.launch("*/*") },
                onRemoveAttachment = { viewModel.removeCommentAttachment(it) },
                onSendComment = { viewModel.sendComment() },
                isSendingComment = isSendingComment,
                replyingTo = replyingTo,
                onCancelReply = { viewModel.setReplyingTo(null) },
                onSearchMembers = { viewModel.searchMembers(it) },
                commentCount = post?.let { countComments(it.comments) } ?: 0,
                showAddTagDialog = { showAddTagDialog = true },
                showDeleteCommentDialog = { showDeleteCommentDialog = it },
                onExpand = {
                    coroutineScope.launch { sheetState.expand() }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    WebView(ctx).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.loadWithOverviewMode = true
                        settings.useWideViewPort = true
                        settings.builtInZoomControls = true
                        settings.displayZoomControls = false
                        settings.userAgentString = CHROME_USER_AGENT
                        // Many RSS publishers still serve their CDN images
                        // over HTTP even when the article itself is HTTPS;
                        // compatibility mode lets those assets load instead
                        // of leaving a broken article.
                        settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(
                                view: WebView?,
                                request: WebResourceRequest?
                            ): Boolean = false

                            override fun onPageStarted(
                                view: WebView?,
                                url: String?,
                                favicon: Bitmap?
                            ) {
                                loadError = null
                            }

                            override fun doUpdateVisitedHistory(
                                view: WebView?,
                                url: String?,
                                isReload: Boolean
                            ) {
                                canGoBack = view?.canGoBack() == true
                            }

                            override fun onReceivedError(
                                view: WebView?,
                                request: WebResourceRequest?,
                                error: WebResourceError?
                            ) {
                                // Only report errors for the main frame load —
                                // resource errors (a blocked tracker, missing
                                // image) shouldn't replace the whole page.
                                if (request?.isForMainFrame == true) {
                                    loadError = error?.description?.toString()
                                        ?: "Unable to load page"
                                }
                            }
                        }
                        webChromeClient = object : WebChromeClient() {
                            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                loadProgress = newProgress
                            }
                        }
                        loadUrl(sourceUrl)
                        webView = this
                    }
                },
                update = { view ->
                    // Reload on retry. Keyed off the nonce so we only reload
                    // when the user explicitly asked for it.
                    if (reloadNonce > 0) {
                        view.loadUrl(sourceUrl)
                    }
                }
            )
            if (loadProgress in 1..99 && loadError == null) {
                LinearProgressIndicator(
                    progress = { loadProgress / 100f },
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter)
                )
            }
            loadError?.let { message ->
                LoadErrorOverlay(
                    message = message,
                    onRetry = {
                        loadError = null
                        loadProgress = 0
                        reloadNonce += 1
                    },
                    onOpenExternal = {
                        try {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(sourceUrl)))
                        } catch (_: Exception) {
                            // invalid URL
                        }
                    },
                    onViewPost = {
                        coroutineScope.launch { sheetState.expand() }
                    }
                )
            }
        }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.feeds_delete_post)) },
            text = { Text(stringResource(R.string.feeds_delete_post_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        viewModel.deletePost { onNavigateBack() }
                    }
                ) {
                    Text(stringResource(MochiR.string.common_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(MochiR.string.common_cancel))
                }
            }
        )
    }

    showDeleteCommentDialog?.let { commentId ->
        AlertDialog(
            onDismissRequest = { showDeleteCommentDialog = null },
            title = { Text(stringResource(R.string.feeds_delete_comment)) },
            text = { Text(stringResource(R.string.feeds_delete_comment_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteCommentDialog = null
                        viewModel.deleteComment(commentId)
                    }
                ) {
                    Text(stringResource(MochiR.string.common_delete), color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteCommentDialog = null }) {
                    Text(stringResource(MochiR.string.common_cancel))
                }
            }
        )
    }

    if (showAddTagDialog) {
        AddTagDialog(
            onDismiss = { showAddTagDialog = false },
            onAdd = { label, qid ->
                viewModel.addTag(label, qid)
                showAddTagDialog = false
            }
        )
    }
}

@Composable
private fun LoadErrorOverlay(
    message: String,
    onRetry: () -> Unit,
    onOpenExternal: () -> Unit,
    onViewPost: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.feeds_unable_to_load),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            Row {
                TextButton(onClick = onRetry) {
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(stringResource(MochiR.string.common_retry))
                }
                Spacer(modifier = Modifier.width(8.dp))
                TextButton(onClick = onOpenExternal) {
                    Icon(Icons.Default.OpenInBrowser, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(stringResource(R.string.feeds_open_in_browser))
                }
            }
            TextButton(onClick = onViewPost) {
                Text(stringResource(R.string.feeds_view_post))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PostSourceSheet(
    viewModel: PostDetailViewModel,
    permissions: org.mochios.feeds.model.Permissions,
    commentText: String,
    onCommentTextChange: (String) -> Unit,
    commentAttachments: List<android.net.Uri>,
    onAddAttachment: () -> Unit,
    onRemoveAttachment: (android.net.Uri) -> Unit,
    onSendComment: () -> Unit,
    isSendingComment: Boolean,
    replyingTo: String?,
    onCancelReply: () -> Unit,
    onSearchMembers: suspend (String) -> List<org.mochios.android.ui.components.MentionSuggestion>,
    commentCount: Int,
    showAddTagDialog: () -> Unit,
    showDeleteCommentDialog: (String) -> Unit,
    onExpand: () -> Unit
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(40.dp)
                .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.ChatBubbleOutline,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = pluralStringResource(R.plurals.feeds_comment_count, commentCount, commentCount),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f)
            )
            TextButton(onClick = onExpand) {
                Text(stringResource(R.string.feeds_view_post))
            }
        }

        PostDetailContent(
            viewModel = viewModel,
            showAddTagDialog = showAddTagDialog,
            showDeleteCommentDialog = showDeleteCommentDialog,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(bottom = 8.dp),
            showBody = false
        )

        if (permissions.comment) {
            CommentInputBar(
                text = commentText,
                onTextChange = onCommentTextChange,
                attachments = commentAttachments,
                onAddAttachment = onAddAttachment,
                onRemoveAttachment = onRemoveAttachment,
                onSend = onSendComment,
                isSending = isSendingComment,
                replyingTo = replyingTo,
                onCancelReply = onCancelReply,
                onSearchMembers = onSearchMembers
            )
        }
    }
}

private fun countComments(comments: List<org.mochios.android.model.Comment>): Int {
    var n = 0
    for (c in comments) {
        n += 1 + countComments(c.children)
    }
    return n
}
