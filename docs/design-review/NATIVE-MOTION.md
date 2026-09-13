# Native editorial motion

The wellbeing moon floats by three points, gently breathes and tilts its ring. SwiftUI uses a visibility-aware TimelineView and pauses its clock when the scene is inactive; Compose uses a native infinite transition while the artwork is in the viewport.

The home reading cards reveal their mini-bars with a short stagger. Clinical charts reveal their lines once when they enter view. Values, reference ranges, dates and table controls remain immediately readable and retain their data sources. These are entrance animations, not live or changing readings.

iOS Reduce Motion and Android Remove animations present completed, still artwork. Android observes animator-scale changes while the app is open. iOS 18 and later use scroll visibility; iOS 17 starts the finite entrance on appearance.

Validation:

- iOS simulator build and Android debug build/lint passed.
- Native home accessibility checks passed at normal and maximum tested text sizes on both platforms.
- iPhone UI verification compared two actual wellbeing-card screenshots, confirmed that the artwork changed while its button frame stayed fixed, and opened the journal successfully.
- Android frame comparison found changes confined to the moon. With Remove animations enabled, successive card screenshots were pixel-identical. The emulator setting was restored afterward.
- Repository checks passed, including the prohibition on native WebViews.

The updated iOS app is available in the iPhone 17 Pro Max simulator. All animation is native SwiftUI or Compose.
