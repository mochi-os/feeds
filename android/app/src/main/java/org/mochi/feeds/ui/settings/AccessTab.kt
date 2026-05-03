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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import org.mochi.android.model.AccessRule
import org.mochi.feeds.R
import org.mochi.android.R as MochiR

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccessTab(
    viewModel: FeedSettingsViewModel
) {
    val accessRules by viewModel.accessRules.collectAsState()
    val isLoading by viewModel.isLoadingAccess.collectAsState()

    var showAddDialog by remember { mutableStateOf(false) }

    Scaffold(
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) {
                Icon(Icons.Default.Add, contentDescription = stringResource(MochiR.string.access_add_rule))
            }
        }
    ) { innerPadding ->
        when {
            isLoading && accessRules.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            accessRules.isEmpty() -> {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = stringResource(MochiR.string.access_no_rules),
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
                    items(accessRules, key = { it.id }) { rule ->
                        AccessRuleCard(
                            rule = rule,
                            onRevoke = { viewModel.revokeAccess(rule.subject) }
                        )
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddAccessDialog(
            viewModel = viewModel,
            onDismiss = { showAddDialog = false },
            onAdd = { subject, operation ->
                viewModel.setAccess(subject, operation)
                showAddDialog = false
            }
        )
    }
}

@Composable
private fun AccessRuleCard(
    rule: AccessRule,
    onRevoke: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Person,
                contentDescription = null,
                modifier = Modifier.size(24.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = rule.name ?: rule.subject,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = rule.operation,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            if (!rule.isOwner) {
                IconButton(
                    onClick = onRevoke,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = stringResource(MochiR.string.access_revoke),
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddAccessDialog(
    viewModel: FeedSettingsViewModel,
    onDismiss: () -> Unit,
    onAdd: (String, String) -> Unit
) {
    var selectedTab by remember { mutableStateOf(0) }
    var userQuery by remember { mutableStateOf("") }
    var selectedSubject by remember { mutableStateOf("") }
    var selectedName by remember { mutableStateOf("") }
    var level by remember { mutableStateOf("view") }
    var levelExpanded by remember { mutableStateOf(false) }
    val searchResults by viewModel.userSearchResults.collectAsState()
    val groups by viewModel.groups.collectAsState()

    // Load groups when groups tab is selected
    androidx.compose.runtime.LaunchedEffect(selectedTab) {
        if (selectedTab == 1 && groups.isEmpty()) {
            viewModel.loadGroups()
        }
    }

    val levels = listOf("view", "react", "comment", "none")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(MochiR.string.access_add_rule_title)) },
        text = {
            Column {
                androidx.compose.material3.TabRow(selectedTabIndex = selectedTab) {
                    androidx.compose.material3.Tab(
                        selected = selectedTab == 0,
                        onClick = {
                            selectedTab = 0
                            selectedSubject = ""
                            selectedName = ""
                        },
                        text = { Text(stringResource(R.string.feeds_access_users)) }
                    )
                    androidx.compose.material3.Tab(
                        selected = selectedTab == 1,
                        onClick = {
                            selectedTab = 1
                            selectedSubject = ""
                            selectedName = ""
                        },
                        text = { Text(stringResource(R.string.feeds_access_groups)) }
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                if (selectedTab == 0) {
                    OutlinedTextField(
                        value = if (selectedName.isNotEmpty()) selectedName else userQuery,
                        onValueChange = {
                            userQuery = it
                            selectedSubject = ""
                            selectedName = ""
                            if (it.length >= 2) {
                                viewModel.searchUsers(it)
                            }
                        },
                        label = { Text(stringResource(R.string.feeds_user)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )

                    if (searchResults.isNotEmpty() && selectedSubject.isEmpty()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column {
                                searchResults.take(5).forEach { user ->
                                    TextButton(
                                        onClick = {
                                            selectedSubject = user.fingerprint ?: user.id.toString()
                                            selectedName = user.name
                                        },
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text(
                                            text = user.name,
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                    }
                                }
                            }
                        }
                    }
                } else {
                    if (groups.isEmpty()) {
                        Text(
                            text = stringResource(R.string.feeds_access_no_groups),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    } else {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Column {
                                groups.forEach { group ->
                                    TextButton(
                                        onClick = {
                                            // Groups are subjects prefixed with "@"
                                            selectedSubject = "@${group.id}"
                                            selectedName = group.name
                                        },
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            androidx.compose.material3.RadioButton(
                                                selected = selectedSubject == "@${group.id}",
                                                onClick = null
                                            )
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(group.name)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                ExposedDropdownMenuBox(
                    expanded = levelExpanded,
                    onExpandedChange = { levelExpanded = it }
                ) {
                    OutlinedTextField(
                        value = accessLevelLabel(level),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.feeds_access_permission)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = levelExpanded) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    )
                    ExposedDropdownMenu(
                        expanded = levelExpanded,
                        onDismissRequest = { levelExpanded = false }
                    ) {
                        levels.forEach { lvl ->
                            DropdownMenuItem(
                                text = { Text(accessLevelLabel(lvl)) },
                                onClick = {
                                    level = lvl
                                    levelExpanded = false
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onAdd(selectedSubject, level) },
                enabled = selectedSubject.isNotEmpty()
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
private fun accessLevelLabel(level: String): String = when (level) {
    "view" -> stringResource(MochiR.string.access_level_view)
    "react" -> stringResource(MochiR.string.access_level_react)
    "comment" -> stringResource(MochiR.string.access_level_comment)
    "none" -> stringResource(MochiR.string.access_level_none)
    "manage" -> stringResource(MochiR.string.access_level_manage)
    else -> level.replaceFirstChar { it.uppercase() }
}
