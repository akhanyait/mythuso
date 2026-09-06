package za.co.mythuso.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

val Teal = Color(0xFF087F78)
val Forest = Color(0xFF244E43)
val Sage = Color(0xFFE6F1E9)
val Canvas = Color(0xFFF5F8F7)
@Composable fun ThusoTheme(content: @Composable () -> Unit) { MaterialTheme(colorScheme = lightColorScheme(primary = Teal, secondary = Forest, background = Canvas, surface = Color.White, onBackground = Color(0xFF172E35)), content = content) }
@Composable fun CareCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) { Card(modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(13.dp), content = content) } }
@Composable fun Heading(eyebrow: String, title: String, subtitle: String) { Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { Text(eyebrow.uppercase(), style = MaterialTheme.typography.labelSmall, color = Teal); Text(title, style = MaterialTheme.typography.headlineLarge); Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
@Composable fun DemoBadge() { Text("●  Design preview · Fictional data", style = MaterialTheme.typography.labelSmall, color = Teal) }
