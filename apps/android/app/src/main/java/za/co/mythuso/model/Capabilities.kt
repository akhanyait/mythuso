package za.co.mythuso.model

/* What MyThuso can actually do, and what it only draws.
 *
 * The capabilities and the sentence each one shows while it is not connected are generated
 * into CapabilitiesData.kt from packages/catalog/capabilities.json. This is the lookup beside it,
 * and it is the same shape as apps/ios/MyThuso/Models/Capabilities.swift and
 * apps/web/src/lib/capabilities.ts: a screen names the capability it depends on and renders the
 * sentence it is given, and it never writes its own.
 *
 * That is not tidiness. Sixty hand-typed variations of "this is a preview" cannot be switched off
 * together, and the one somebody types at eleven at night is always the softer one. One place knows,
 * so when an integration lands one boolean changes in the contract and the notice disappears from
 * every platform at once.
 *
 * An id the contract does not carry returns null rather than throwing, for the reason the iOS file
 * gives: a missing banner must never be why somebody's phone drops the app they opened to book a
 * nurse. The loudness lives in the build instead.
 */
object Capabilities {
    fun of(id: String): Capability? = capabilities.firstOrNull { it.id == id }

    /** The sentence to show, or nothing at all because the thing is real now. */
    fun notice(id: String): String? = of(id)?.takeUnless { it.connected }?.notice

    fun isConnected(id: String): Boolean = of(id)?.connected ?: false

    /** What stands between a capability and being real, in the contract's own words. */
    fun blocking(id: String): List<String> = of(id)?.blockedBy.orEmpty()
}
