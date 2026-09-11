# Care Studio: creative refresh

The patient home now uses a midnight-green editorial panel, oversized mixed sans/serif typography, lime/peach/lavender focus colours, cutout imagery and orbit decorations. The public website and web sign-in adopt the same visual direction. Patient service tiles and health metrics use distinct colours and tactile hover treatments.

## Interaction

- For me → Explore care → existing booking catalogue.
- For family → Meet your circle → existing family screen.
- My records → Open my passport → existing Health Passport.
- Selecting a focus changes the headline, explanation, artwork, accent and destination together.
- Web tabs support Left/Right, Home/End and roving keyboard focus.
- Web has a pointer-following light, animated chapter entrances, rotating stars, floating labels and button/hover feedback.
- SwiftUI has a spring-driven focus indicator, chapter transitions, animated illustration and press feedback.
- Compose has animated focus colour, crossfades, a rotating decorative sparkle and native Material interaction feedback.
- Decorative motion has a pause control. Web and SwiftUI observe reduced-motion preferences; Compose animations follow the system animator duration scale.

## Preview

Web: run `npm run dev`. If the identity API is running, the app correctly requires sign-in. For the fictional design preview, start Vite with `MYTHUSO_API` pointing to an unused local port; this leaves the real API untouched.

Native apps must be rebuilt and installed; refreshing a website does not update a simulator binary. iOS uses the existing MyThuso Xcode scheme. Android uses `:app:assembleDebug`.

All destinations and health data retain their existing behaviour. The design does not introduce clinical recommendations, simulated health measurements or new integrations.
