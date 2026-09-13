# Patient care journey refinements

Implemented 13 September 2026, preserving the approved editorial palette, logo and photographs.

- Booking now separates Who, Where, When, Payment and Review. A compact summary stays visible, backwards navigation keeps choices, each new step receives keyboard focus, and changing details resets the final acknowledgement. Connection loss preserves the open draft and prevents confirmation until reconnection.
- Dashboard leads with the next relevant action. A booked visit opens its preparation details; pending requests use review wording. Clinician identity is resolved from the same roster as the visit instead of being typed into the dashboard.
- Nurse and doctor profile cards read names, registration references and individual verification dates/statuses from existing fixture records. A profile makes its sample status explicit. No identity photograph, languages, experience or live verification claim has been invented.
- Upcoming visit details combine the actual appointment, preparation, clinician profile, available contact-options destination and rescheduling/cancellation. A doctor may decide that a home visit is appropriate; it is separate from the nurse booking.
- Service categories expose their selected state. Search results have a count and a single action to recover from an empty result and clear filters.
- Passport timeline supports entry type and time-period filters, newest-first dated entries, explicit completed/missing/pending review statuses, and an honest empty medicine-history state. Older readings no longer claim to have been reviewed merely because the latest visit has a doctor review.
- Loading/error wording explains the next action without claiming an automatic care-team notification. Detail expansions use a finite 180ms entrance only when reduced motion is off. Clinical numbers, verification statuses and prices remain steady.

## Verification

TypeScript check passed. New care-experience browser cases passed at desktop and phone widths; the affected booking, care, interpreting and simulated-supplier cases were checked alongside them. Browser screenshots were visually inspected at 1440px, 390px and 320px and showed no horizontal overflow. Root integration verification supplies the final complete-suite result.

Screenshots show the web patient application, not the native app. Example clinician records and appointments remain fictional. Open booking drafts are kept in component memory; refreshing or closing the booking discards them, consistent with the preview's no patient-data persistence policy.
