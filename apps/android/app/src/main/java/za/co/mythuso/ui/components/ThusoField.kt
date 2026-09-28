package za.co.mythuso.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import za.co.mythuso.ui.ThusoRadius
import za.co.mythuso.ui.ThusoSpacing
import za.co.mythuso.ui.TouchTarget
import za.co.mythuso.ui.theme

/* A label, its control, and the hint or the error beneath it (apps/web/src/ui/Field.tsx). The
   asterisk says required in words to TalkBack, because a glyph is not a word. An error replaces the
   hint rather than sitting beside it — two sentences under one field is one more than a person reads
   — and the control is told it is invalid, so the state a screen reader announces and the state a
   reader sees cannot disagree. */
@Composable fun ThusoField(
    label: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    error: String? = null,
    required: Boolean = false,
    content: @Composable () -> Unit
) {
    val message = error ?: hint
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = theme.foreground)
            if (required) Text(
                "*", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = theme.dangerInk,
                modifier = Modifier.padding(start = ThusoSpacing.space4).semantics { contentDescription = "required" }
            )
        }
        content()
        if (message != null) Text(
            message, style = MaterialTheme.typography.bodySmall,
            color = if (error != null) theme.dangerInk else theme.mutedForeground,
            modifier = Modifier.semantics { if (error != null) this.error(error) }
        )
    }
}

/* The resting edge is the muted ink rather than the handoff's --color-input: a text field's boundary is
   how a reader finds it, SC 1.4.11 holds it to 3:1, and the handoff's input colour measures 1.3:1 on a
   card (knownFailures names the muted ink as the fix, on light and on dark). Focus turns the edge to the
   ring. Invalid is the danger ink, and the words under the field say what is wrong. */
@Composable fun thusoFieldColours(invalid: Boolean = false) = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = theme.surface, unfocusedContainerColor = theme.surface, disabledContainerColor = theme.surface,
    focusedTextColor = theme.foreground, unfocusedTextColor = theme.foreground, disabledTextColor = theme.mutedForeground,
    cursorColor = theme.foreground,
    focusedBorderColor = if (invalid) theme.dangerInk else theme.ring,
    unfocusedBorderColor = if (invalid) theme.dangerInk else theme.mutedForeground,
    disabledBorderColor = theme.border,
    errorBorderColor = theme.dangerInk, errorTextColor = theme.foreground, errorCursorColor = theme.foreground,
    focusedLabelColor = theme.foreground, unfocusedLabelColor = theme.mutedForeground, errorLabelColor = theme.dangerInk,
    focusedPlaceholderColor = theme.mutedForeground, unfocusedPlaceholderColor = theme.mutedForeground,
    focusedLeadingIconColor = theme.mutedForeground, unfocusedLeadingIconColor = theme.mutedForeground,
    focusedTrailingIconColor = theme.mutedForeground, unfocusedTrailingIconColor = theme.mutedForeground,
    focusedSupportingTextColor = theme.mutedForeground, unfocusedSupportingTextColor = theme.mutedForeground, errorSupportingTextColor = theme.dangerInk
)

/** A single line (or a few) of clinical or account data, on the identity's field. Its visible label is
    ThusoField's, or a label of the caller's — a placeholder is not a label. */
@Composable fun ThusoTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    label: String? = null,
    invalid: Boolean = false,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    leadingIcon: ImageVector? = null,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    textStyle: androidx.compose.ui.text.TextStyle = MaterialTheme.typography.bodyMedium,
    supportingText: (@Composable () -> Unit)? = null
) {
    OutlinedTextField(
        value = value, onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth().heightIn(min = TouchTarget),
        placeholder = placeholder?.let { { Text(it, style = textStyle) } },
        label = label?.let { { Text(it) } },
        leadingIcon = leadingIcon?.let { { Icon(it, null, Modifier.size(18.dp)) } },
        isError = invalid, enabled = enabled, singleLine = singleLine, minLines = minLines, maxLines = maxLines,
        keyboardOptions = keyboardOptions, keyboardActions = keyboardActions,
        textStyle = textStyle, shape = RoundedCornerShape(ThusoRadius.control),
        colors = thusoFieldColours(invalid), supportingText = supportingText
    )
}

/* A dropdown over Material's own exposed menu, so the keyboard, the dismiss and the announced state are
   the platform's, with the handoff's chevron drawn on the field. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ThusoDropdown(
    value: String,
    options: List<String>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    invalid: Boolean = false,
    enabled: Boolean = true
) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { if (enabled) open = it }, modifier = modifier) {
        OutlinedTextField(
            value = value, onValueChange = {}, readOnly = true, enabled = enabled, isError = invalid,
            label = label?.let { { Text(it) } },
            trailingIcon = { Icon(Icons.Outlined.ExpandMore, null, Modifier.size(18.dp)) },
            shape = RoundedCornerShape(ThusoRadius.control), colors = thusoFieldColours(invalid),
            textStyle = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.fillMaxWidth().heightIn(min = TouchTarget).menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled)
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = theme.surface) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(option, style = MaterialTheme.typography.bodyMedium, color = theme.foreground) },
                    onClick = { onSelect(option); open = false },
                    trailingIcon = if (option == value) ({ Icon(Icons.Outlined.Check, null, tint = theme.foreground) }) else null,
                    contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding
                )
            }
        }
    }
}

/* An independent yes-or-no (apps/web/src/ui/Checkbox.tsx). The box is the handoff's sixteen dp; the
   row around it is the target and is 48 tall, and it owns the toggle semantics so a screen reader hears
   one control with one label. Checked differs from unchecked by the drawn tick, never by the fill alone. */
@Composable fun ThusoCheckbox(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    detail: String? = null
) {
    Row(
        modifier.fillMaxWidth().heightIn(min = TouchTarget)
            .toggleable(value = checked, enabled = enabled, role = Role.Checkbox, onValueChange = onCheckedChange)
            .semantics { stateDescription = if (checked) "Ticked" else "Not ticked" }
            .padding(vertical = ThusoSpacing.space12),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            Modifier.padding(top = 2.dp).size(16.dp)
                .background(if (checked) theme.primary else theme.surface, RoundedCornerShape(ThusoRadius.sm))
                .border(1.dp, if (checked) theme.primary else theme.mutedForeground, RoundedCornerShape(ThusoRadius.sm)),
            Alignment.Center
        ) {
            if (checked) Icon(Icons.Outlined.Check, null, tint = theme.primaryForeground, modifier = Modifier.size(12.dp))
        }
        Column(verticalArrangement = Arrangement.spacedBy(ThusoSpacing.space4)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, color = if (enabled) theme.foreground else theme.mutedForeground)
            if (detail != null) Text(detail, style = MaterialTheme.typography.bodySmall, color = theme.mutedForeground)
        }
    }
}
