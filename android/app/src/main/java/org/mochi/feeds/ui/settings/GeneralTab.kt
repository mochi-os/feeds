package org.mochi.feeds.ui.settings

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.mochi.feeds.R
import org.mochi.android.R as MochiR

@Composable
fun GeneralTab(
    viewModel: FeedSettingsViewModel,
    onFeedDeleted: () -> Unit
) {
    val feedName by viewModel.feedName.collectAsState()
    val rssToken by viewModel.rssToken.collectAsState()
    val rssMode by viewModel.rssMode.collectAsState()
    val banner by viewModel.banner.collectAsState()
    var showDeleteDialog by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val focusManager = LocalFocusManager.current

    LaunchedEffect(Unit) {
        viewModel.loadBanner()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        // Feed name
        Text(
            text = stringResource(R.string.feeds_feed_name),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = feedName,
            onValueChange = { viewModel.setFeedName(it) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedButton(
            onClick = {
                viewModel.saveFeedName()
                focusManager.clearFocus()
            }
        ) {
            Text(stringResource(R.string.feeds_save_name))
        }

        Spacer(modifier = Modifier.height(24.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(24.dp))

        // Banner
        Text(
            text = stringResource(R.string.feeds_banner),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.feeds_banner_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedTextField(
            value = banner,
            onValueChange = { viewModel.setBannerText(it) },
            modifier = Modifier.fillMaxWidth(),
            minLines = 3,
            maxLines = 8
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = {
                viewModel.saveBanner()
                focusManager.clearFocus()
            }) {
                Text(stringResource(R.string.feeds_save_banner))
            }
            if (banner.isNotEmpty()) {
                TextButton(onClick = { viewModel.clearBanner() }) {
                    Text(stringResource(R.string.feeds_clear))
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(24.dp))

        // RSS export
        Text(
            text = stringResource(R.string.feeds_rss_export),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.feeds_rss_description),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = rssMode == "posts",
                onClick = { viewModel.setRssMode("posts") },
                label = { Text(stringResource(R.string.feeds_rss_posts_only)) }
            )
            FilterChip(
                selected = rssMode == "all",
                onClick = { viewModel.setRssMode("all") },
                label = { Text(stringResource(R.string.feeds_rss_posts_and_comments)) }
            )
        }
        Spacer(modifier = Modifier.height(8.dp))

        if (rssToken != null) {
            OutlinedTextField(
                value = rssToken!!,
                onValueChange = {},
                readOnly = true,
                modifier = Modifier.fillMaxWidth(),
                maxLines = 3
            )
            Spacer(modifier = Modifier.height(8.dp))
            val clipboardLabel = stringResource(R.string.feeds_clipboard_label_rss)
            OutlinedButton(
                onClick = {
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText(clipboardLabel, rssToken))
                }
            ) {
                Text(stringResource(R.string.feeds_copy_url))
            }
        } else {
            OutlinedButton(onClick = { viewModel.generateRssToken() }) {
                Text(stringResource(R.string.feeds_generate_rss_url))
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(24.dp))

        // Delete feed
        Text(
            text = stringResource(R.string.feeds_danger_zone),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(8.dp))
        Button(
            onClick = { showDeleteDialog = true },
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error
            )
        ) {
            Text(stringResource(R.string.feeds_delete_feed))
        }
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.feeds_delete_feed)) },
            text = { Text(stringResource(R.string.feeds_delete_feed_confirm)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        viewModel.deleteFeed { onFeedDeleted() }
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
}
