package org.mochi.feeds.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.mochi.feeds.R
import org.mochi.feeds.model.Source
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import org.mochi.android.R as MochiR

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SourcesTab(
    viewModel: FeedSettingsViewModel
) {
    val sources by viewModel.sources.collectAsState()
    val isLoading by viewModel.isLoadingSources.collectAsState()

    var showAddDialog by remember { mutableStateOf(false) }
    var showEditDialog by remember { mutableStateOf<Source?>(null) }
    var showRemoveDialog by remember { mutableStateOf<Source?>(null) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.feeds_add_source))
            }
        }
    ) { innerPadding ->
        when {
            isLoading && sources.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            sources.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(R.string.feeds_no_sources),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            else -> {
                LazyColumn(
                    modifier = Modifier.padding(innerPadding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(sources, key = { it.id }) { source ->
                        SourceCard(
                            source = source,
                            onEdit = { showEditDialog = source },
                            onRemove = { showRemoveDialog = source },
                            onPoll = { viewModel.pollSource(source.id) }
                        )
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddSourceDialog(
            onDismiss = { showAddDialog = false },
            onAdd = { url, type ->
                viewModel.addSource(url, type)
                showAddDialog = false
            }
        )
    }

    showEditDialog?.let { source ->
        EditSourceDialog(
            source = source,
            onDismiss = { showEditDialog = null },
            onSave = { name, credibility, transform ->
                viewModel.editSource(source.id, name, credibility, transform)
                showEditDialog = null
            }
        )
    }

    showRemoveDialog?.let { source ->
        RemoveSourceDialog(
            source = source,
            onDismiss = { showRemoveDialog = null },
            onRemove = { deletePosts ->
                viewModel.removeSource(source.id, deletePosts)
                showRemoveDialog = null
            }
        )
    }
}

@Composable
private fun SourceCard(
    source: Source,
    onEdit: () -> Unit,
    onRemove: () -> Unit,
    onPoll: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = source.name.ifEmpty { source.url },
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = source.url,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Text(
                    text = source.type.uppercase(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                if (source.fetched > 0) {
                    val dateFormat = SimpleDateFormat("d MMM, HH:mm", Locale.getDefault())
                    Text(
                        text = stringResource(R.string.feeds_source_last_fetched, dateFormat.format(Date(source.fetched * 1000))),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Text(
                        text = stringResource(R.string.feeds_source_never_fetched),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Row {
                    IconButton(onClick = onPoll, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.feeds_source_poll), modifier = Modifier.size(18.dp))
                    }
                    IconButton(onClick = onEdit, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.Edit, contentDescription = stringResource(MochiR.string.common_edit), modifier = Modifier.size(18.dp))
                    }
                    IconButton(onClick = onRemove, modifier = Modifier.size(32.dp)) {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = stringResource(R.string.feeds_remove),
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.error
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddSourceDialog(
    onDismiss: () -> Unit,
    onAdd: (String, String) -> Unit
) {
    var url by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("rss") }
    var typeExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.feeds_add_source)) },
        text = {
            Column {
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text(stringResource(R.string.feeds_source_url)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(16.dp))

                ExposedDropdownMenuBox(
                    expanded = typeExpanded,
                    onExpandedChange = { typeExpanded = it }
                ) {
                    OutlinedTextField(
                        value = type.uppercase(),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.feeds_source_type)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = typeExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    )
                    ExposedDropdownMenu(
                        expanded = typeExpanded,
                        onDismissRequest = { typeExpanded = false }
                    ) {
                        listOf("rss", "feed").forEach { option ->
                            DropdownMenuItem(
                                text = { Text(option.uppercase()) },
                                onClick = {
                                    type = option
                                    typeExpanded = false
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAdd(url, type) },
                enabled = url.isNotBlank()
            ) {
                Text(stringResource(MochiR.string.common_add))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(MochiR.string.common_cancel))
            }
        }
    )
}

@Composable
private fun EditSourceDialog(
    source: Source,
    onDismiss: () -> Unit,
    onSave: (String?, Double?, String?) -> Unit
) {
    var name by remember { mutableStateOf(source.name) }
    var credibility by remember { mutableFloatStateOf(source.credibility.toFloat()) }
    var transform by remember { mutableStateOf(source.transform) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.feeds_edit_source)) },
        text = {
            Column {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(stringResource(R.string.feeds_name)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = stringResource(R.string.feeds_source_credibility, "%.1f".format(credibility)),
                    style = MaterialTheme.typography.bodySmall
                )
                Slider(
                    value = credibility,
                    onValueChange = { credibility = it },
                    valueRange = 0f..1f,
                    steps = 9
                )

                Spacer(modifier = Modifier.height(8.dp))
                OutlinedTextField(
                    value = transform,
                    onValueChange = { transform = it },
                    label = { Text(stringResource(R.string.feeds_source_transform)) },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    onSave(
                        name.takeIf { it != source.name },
                        credibility.toDouble().takeIf { it != source.credibility },
                        transform.takeIf { it != source.transform }
                    )
                }
            ) {
                Text(stringResource(MochiR.string.common_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(MochiR.string.common_cancel))
            }
        }
    )
}

@Composable
private fun RemoveSourceDialog(
    source: Source,
    onDismiss: () -> Unit,
    onRemove: (Boolean) -> Unit
) {
    var deletePosts by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.feeds_remove_source)) },
        text = {
            Column {
                Text(stringResource(R.string.feeds_remove_source_confirm, source.name.ifEmpty { source.url }))
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = deletePosts,
                        onCheckedChange = { deletePosts = it }
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(stringResource(R.string.feeds_remove_also_delete_posts))
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onRemove(deletePosts) }) {
                Text(stringResource(R.string.feeds_remove), color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(MochiR.string.common_cancel))
            }
        }
    )
}
