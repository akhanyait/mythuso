# Corrections to the history

Git history is evidence. Where a commit message does not describe its own contents, the fix is
either to rewrite it or to say so — and rewriting a branch other people already have is a worse
problem than the one it solves. So the corrections live here.

Nothing below changes any code. Each entry names a commit, what its message claims, and what it
actually contains.

## Two commits from 7 September that describe work other than their own

Two Claude sessions were working in this repository at the same time on 7 September, in one shared
checkout, on `ui/clinical-privacy-and-dispatch-flows`. One was running a design pass; the other was
integrating three subagent branches and iterating on a new iOS test target. `git add -A` on a shared
working tree stages whatever is lying in it, including another session's work in flight.

**`1bf616a` — "Give the last eleven colours a name, and take the tint rotation out"**

Also contains, and does not mention: the whole of `apps/ios/MyThusoUITests` — `AccessibilityAudit.swift`,
`BookingJourneyTests.swift` and `DynamicTypeTests.swift`, 739 lines — the `MyThuso.xcscheme`, 23 lines
of `project.pbxproj` and 107 lines of `docs/ACCESSIBILITY.md`. That is the iOS UI test target and its
first three tests, which are the subject of `1f913b5`.

**`313a2d3` — "Make the map's marks say what the key says, and delete nine bubbles nobody sees"**

Also contains, and does not mention: accessibility fixes to `Theme.swift`, `HomeView.swift` and
`BookingView.swift` — decorative images and monograms hidden from assistive technology, and section
links given the 44-point minimum the audit in `1f913b5` measures.

Neither session noticed until the second one read the log after committing. The history is coherent —
the tree at every point builds and passes — but two of its messages are not descriptions of their own
diffs, and anybody reading them to find when the iOS test target arrived would be misled.

**What changed as a result:** both sessions now stage explicit paths rather than `-A`, and read
`git status` before committing. That is the whole of the fix; the rest is this note.
