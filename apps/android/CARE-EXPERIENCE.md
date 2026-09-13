# Native care experience

The approved Care Studio direction now supports the complete patient journey in Compose:

- The next visit leads Home, followed by care search, actual Passport readings and wellbeing.
- Booking uses a native bottom sheet with separate person, location, timing, payment and review steps. A compact service/price summary remains visible. Closing preserves the draft for this app session; confirming removes the draft and creates only the existing demo booking.
- Service discovery combines name/description search and care categories, with an explicit reset after an empty result. A new search from Home starts across all categories.
- Upcoming visit details read the actual stored visit, with preparation, profile and management routes. Phone calls/messages are explicitly unavailable in this preview. Doctor home visits remain clinician decisions, not an added booking capability.
- Clinician cards and profiles read names, roles, references, scope, area and current check states from VettingStore. Missing languages, experience and identity photos are not invented.
- Passport Records becomes a newest-first timeline with Visits, Documents and Reviews filters, using PassportData dates, review state and original detail routes.
- Native selection haptics use the platform's touch feedback. Shared animation timing governs existing decorative moon/entrance artwork and skeleton loading. Remove animations stops the decorative/skeleton loops; clinical values and prices stay still.
- Loading, offline, error and empty states explain the next action without promising a connected backend. Drafts and current choices remain session-only.

The care-team header reuses `apps/web/public/editorial/nursing-care.png` as `app/src/main/res/drawable-nodpi/care_team_editorial.png`. It is labeled illustrative photography and is never attached to an individual clinician's credentials.

Regression coverage: CareExperienceTests verifies draft recovery without creating a visit, combined search/reset, source-backed profile status and Passport document routing. BookingJourneyTests retains independent date/duration arithmetic assertions with the new separate location step. FontScaleTests exercises the booking review, Home and Passport at standard and largest supported font sizes.
