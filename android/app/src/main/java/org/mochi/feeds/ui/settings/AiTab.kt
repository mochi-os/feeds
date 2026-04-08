package org.mochi.feeds.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun AiTab(
    viewModel: FeedSettingsViewModel
) {
    val aiMode by viewModel.aiMode.collectAsState()
    val aiPrompts by viewModel.aiPrompts.collectAsState()
    val aiDefaults by viewModel.aiDefaults.collectAsState()

    val modes = listOf(
        "none" to "None",
        "titles" to "Titles",
        "summarize" to "Summarize",
        "custom" to "Custom"
    )

    val promptTypes = listOf(
        "new" to "Tag new posts",
        "batch" to "Batch processing",
        "rank" to "Ranking / scoring",
        "credibility" to "Credibility assessment"
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        Text(
            text = "AI processing mode",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(8.dp))

        modes.forEach { (value, label) ->
            AiModeOption(
                label = label,
                description = when (value) {
                    "none" -> "No AI processing"
                    "titles" -> "AI generates titles for posts"
                    "summarize" -> "AI generates summaries for posts"
                    "custom" -> "Use a custom prompt"
                    else -> ""
                },
                selected = aiMode == value,
                onClick = { viewModel.setAiMode(value) }
            )
        }

        Spacer(modifier = Modifier.height(24.dp))
        HorizontalDivider()
        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Custom prompts",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = "Override the default AI prompts for each task. Leave empty to use defaults.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))

        promptTypes.forEach { (type, label) ->
            PromptEditor(
                label = label,
                value = aiPrompts[type] ?: "",
                defaultValue = aiDefaults[type] ?: "",
                onValueChange = { viewModel.setAiPromptText(type, it) },
                onSave = { viewModel.saveAiPrompt(type) },
                onReset = { viewModel.resetAiPrompt(type) }
            )
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun PromptEditor(
    label: String,
    value: String,
    defaultValue: String,
    onValueChange: (String) -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit
) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(4.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .height(120.dp),
            maxLines = 8
        )
        Spacer(modifier = Modifier.height(4.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onSave) {
                Text("Save")
            }
            if (value != defaultValue) {
                TextButton(onClick = onReset) {
                    Text("Reset to default")
                }
            }
        }
    }
}

@Composable
private fun AiModeOption(
    label: String,
    description: String,
    selected: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = selected,
            onClick = onClick
        )
        Column(modifier = Modifier.padding(start = 8.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
