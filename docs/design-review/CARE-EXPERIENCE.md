# Ten care-experience refinements

Implemented with separate web, SwiftUI and Jetpack Compose agents, with shared art direction and integration review. Mobile screens remain native; the responsive website is a separate application. The current MyThuso logo and approved botanical palette are retained.

| Refinement | Result |
| --- | --- |
| 1. Focused booking | Five decisions: who, where, when, payment and review. A compact service, patient and price summary stays with the journey. Back navigation retains choices. |
| 2. Clinician profiles | Nurse and doctor profiles use linked identity and verification records, including incomplete checks. Registration references and available practice details are visible. No languages, experience, ratings or credentials are invented. |
| 3. Upcoming care | The dashboard prioritises the next visit, with appointment details and preparation. Contact availability is explained where no connected contact service exists. |
| 4. Dashboard hierarchy | Next actions and appointments precede supporting readings, service discovery and wellbeing content. Measurements retain their dates, units and original sources. |
| 5. Health Passport | Dated timeline entries can be filtered. Recorded readings, completed reviews and documents awaiting review remain distinct. Empty filters provide a way back to all entries. |
| 6. Service discovery | Search and catalogue-derived categories narrow services. Reset controls recover from empty results. The public website shows launch services only. |
| 7. Native interaction | SwiftUI and Compose retain native navigation, booking sheets, selection feedback and haptics. No WebViews or embedded web controls are introduced. |
| 8. Recovery states | Loading, empty, offline and retry messages explain the current state. Booking choices survive step navigation; both native apps also resume dismissed drafts within the session. Web offline confirmation is disabled while choices remain available in the open booking. |
| 9. Photography | Approved warm, naturally lit editorial images carry through care sections. Wide compositions retain faces and full framing. Generated illustrative portraits are never attached to named clinician credentials. |
| 10. Motion | Ambient artwork follows motion preferences. Web artwork pauses offscreen and in hidden tabs, and the global pause control stops it. Native artwork follows platform motion preferences. Safety content, prices and clinical values stay steady. |

The reviewing doctor's source record has incomplete checks. The interface exposes those states instead of presenting the doctor as fully cleared. A doctor may decide a home visit is appropriate; this does not add an operational doctor-dispatch service to the preview.

## Review

- [Public service finder, desktop](service-discovery-1440.png)
- [Public service finder, phone](service-discovery-390.png)
- [Nursing editorial section, desktop](nurse-story-1440.png)
- [Nursing editorial section, phone](nurse-story-390.png)
- [Patient dashboard, desktop](care-dashboard-1440.png) · [Phone](care-dashboard-390.png)
- [Booking review, desktop](care-booking-1440.png) · [Phone](care-booking-390.png)
- [Native iPhone home](care-ios-home.png) · [Native iPhone booking](care-ios-booking.png)
- [Native Android home](care-android-home.png) · [Native Android booking](care-android-booking.png) · [Native Android service discovery](care-android-services.png)

## Validation

- Web TypeScript and production build passed. Repository boundary checks passed, including native WebView prohibition and the minimum-text-size ratchet. The existing bundle-size advisory remains.
- The full browser run exercised 474 cases: 456 passed, 14 live-service checks were skipped, and four cases needed follow-up. All four passed after updating two clinician-card selectors and rerunning the affected files. A subsequent reveal check caught a late-layout issue, now fixed by observing layout changes and releasing content already scrolled past. The final 54 landing/motion checks all passed; all 460 non-skipped cases have a passing result across the integrated run and follow-ups.
- Responsive visual review checked service filtering, photography and horizontal overflow at 1440, 1024, 768, 390 and 320px. Hero, safety and motion regressions were included in the browser checks.
- iOS final simulator build passed. Five focused UI checks passed across the final implementation: service filtering and draft recovery, clinician verification, Passport filtering, booking accessibility and Home accessibility. Accessibility audits covered normal and maximum Dynamic Type. The final native app is open on iPhone 17 Pro Max.
- Android final debug build and lint passed. Eight focused checks passed, covering draft recovery, category reset, clinician verification, Passport document routing, booking arithmetic and large-text booking, Home and Passport. An emulator input-dispatch ANR during concurrent builds was resolved by running the final audits serially; no product assertion was suppressed.

The simulator checks caught and resolved an undersized preparation link and new text below the app's minimum size. Browser test selectors were updated for the new clinician cards while retaining their original registration assertions.

This is a local implementation, using the existing labelled fictional-data preview. No production deployment, physical-device testing or newly connected clinical services are claimed.
