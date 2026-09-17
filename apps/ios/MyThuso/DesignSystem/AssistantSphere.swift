import SwiftUI

/* GilbertOne Pulse: the sphere GilbertOne is drawn as, and the reason it is a sphere.

   Section 15E of the ThusoIQ master document chose a non-human sphere so that GilbertOne is never drawn
   as a clinician: it has no face, no mouth and no aperture, and it is lit rather than listening. That
   is still the rule. What changed on 14 September 2026 is that GilbertOne may now listen on a phone —
   push-to-talk, English, on-device — and the founder asked for the sphere to react to a voice the way
   Siri's wave does. So the sphere takes two inputs it did not have, and neither of them is ever the
   only thing that says what is happening: the screen says the state in words beside it.

   `level` is the live loudness of the microphone, 0 to 1. GilbertListener publishes it only while the
   microphone is open and resets it to zero when it closes, and the screen passes zero under Reduce
   Motion, so a sphere that is reacting is a microphone that is open. It swells the body, pushes the
   halo and orbits outwards, and ripples the surface with rings shed outwards — the web's drawing of
   the same thing, which is where it was designed.

   `pulse` is the Pulse state, carried in form as well as tone. Thinking quickens the particles and
   brings the lime in; Escalate brings the roof's orange into the bleed and the orbit as a controlled
   accent; Handover dims the body and holds it still behind the summary.

   HOW IT IS PUT TOGETHER, outside in: an ambient bleed that has no edge at all and dissolves into
   the ground; three concentric halo rings; two tilted orbit rings whose brightness travels round
   their circumference; the body, a radial gradient with a deep core and a bright rim, a travelling
   sheen, a bounce light in the shadow and one specular highlight well off centre; and a field of
   fine particles on a flattened orbital plane, drawn in one Canvas with the ripple.

   NOTHING IS RANDOM. Every particle's radius, size, speed and twinkle comes from its index through
   the golden angle and a couple of modulo terms, so the drawing is the same drawing on every run and
   a screenshot can be trusted.

   AND UNDER REDUCE MOTION IT STOPS, RATHER THAN SLOWING. The timeline is paused, the clock is one
   fixed moment and the level is ignored. Every layer still draws: the whole sphere, still, in the
   state it is in. The same pause covers the sphere being off screen or the app not in front. */

struct AssistantSphere: View {
    var size: CGFloat = 272
    /// Where this state sits on the green ramp: 0 is the palest and widest, 3 the deepest and most
    /// concentrated. It is never the only thing that says which state this is — the screen says it
    /// in words directly underneath.
    var depth: Int = 0
    /// When the screen last handed the sphere something new to show. Nil means it has always been
    /// showing this, so there is nothing to gather about.
    var gatheredAt: Date?
    /// The microphone's loudness, 0 to 1, while Listening and at no other time. Ignored under Reduce Motion.
    var level: Double = 0
    /// The Pulse state being drawn.
    var pulse: Gilbert.Pulse = .idle

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var onScreen = false

    /* The still frame. Two and a bit seconds in, the three caustics are spread across the body
       rather than overlapping, and the travelling arc on the outer orbit ring sits in the upper
       left where the highlight is. It is the frame the layout was composed against. */
    private static let stillMoment: Double = 2.35
    private static let breathPeriod: Double = 6.5
    private static let rise: Double = 0.45
    private static let hold: Double = 1.25
    private static let settled: Double = 2.45

    // The ramp, deepening with the state, in the wordmark's colours since 14 September. Green is a
    // fill here and never a label: brandGreen measures 3.55:1 against brandInk as a large shape and
    // nothing at all as small text, and brandMint 8.09.
    /* The shell colour and the core, in order. The core is deep on every state: a body measured
       pale at the centre and pale at the rim reads as a pearl, which is what the first two passes
       of this drawing were. Light inside a dark body is what makes a sphere look lit — green light
       inside the logo's ink, deepening to the design system's ink on the two states with something
       in them. The shell is green on every state, settled included: a mint shell measured on the
       simulator as a pale pearl again, which is the first two passes of this drawing in a new colour.
       Mint is the key light's alone. */
    private static let mids: [Color] = [ThusoTheme.brandGreen, ThusoTheme.brandGreen,
                                        ThusoTheme.brandGreen, ThusoTheme.brandGreen]
    private static let cores: [Color] = [ThusoTheme.brandInk, ThusoTheme.brandInk,
                                         ThusoTheme.ink, ThusoTheme.ink]

    private var step: Int { min(max(depth, 0), Self.mids.count - 1) }
    private var mid: Color { Self.mids[step] }
    private var core: Color { Self.cores[step] }
    /// A settled state blooms wide; a state with something in it draws in on itself.
    private var spread: CGFloat { 0.54 - CGFloat(step) * 0.035 }
    /* Where the rim shell begins, as a fraction of the radius. This is the state carried as form
       rather than as tone: settled wears a thick soft shell and the lapsing credential a thin hot
       one, so a reader who cannot separate four greens still sees a different shape. */
    private var rimStart: CGFloat { 0.70 + CGFloat(step) * 0.055 }
    /// The bleed's colour: the wordmark's green, and the roof's orange while escalated.
    private var accent: Color { pulse == .escalate ? ThusoTheme.brandOrange : ThusoTheme.brandGreen }
    /// The travelling glint in the orbits: lime while Thinking, orange while escalated.
    private var glint: Color { pulse == .escalate ? ThusoTheme.brandOrange : ThusoTheme.brandLime }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30,
                                paused: reduceMotion || !onScreen || scenePhase != .active)) { context in
            let clock = reduceMotion ? Self.stillMoment : context.date.timeIntervalSinceReferenceDate
            let breath = reduceMotion ? 0 : sin(clock * 2 * .pi / Self.breathPeriod)
            let gather = gathering(at: context.date)
            let heard = reduceMotion ? 0 : min(1, max(0, level))
            ZStack {
                bleed(breath: breath, gather: gather)
                    .scaleEffect(1 + 0.20 * heard)
                halo(breath: breath, gather: gather)
                    .scaleEffect(1 + 0.14 * heard)
                orbits(clock: clock, breath: breath, gather: gather)
                    .scaleEffect(1 + 0.10 * heard)
                sphere(clock: clock, breath: breath, gather: gather)
                    .scaleEffect(1 + 0.09 * heard)
                    .opacity(pulse == .handover ? 0.72 : 1)
                particles(clock: clock, gather: gather, heard: heard)
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
        .studioVisibility { onScreen = $0 }
        .onDisappear { onScreen = false }
    }

    // MARK: - Time

    /* Rise, hold, fall — 0 to 1 and back over two and a half seconds. Smoothstep rather than a
       linear ramp so the sphere leans into the change and eases out of it. */
    private func gathering(at now: Date) -> Double {
        guard !reduceMotion, let started = gatheredAt else { return 0 }
        let elapsed = now.timeIntervalSince(started)
        guard elapsed > 0 else { return 0 }
        if elapsed < Self.rise { return smooth(elapsed / Self.rise) }
        if elapsed < Self.hold { return 1 }
        if elapsed < Self.settled { return 1 - smooth((elapsed - Self.hold) / (Self.settled - Self.hold)) }
        return 0
    }

    private func smooth(_ x: Double) -> Double { x * x * (3 - 2 * x) }

    // MARK: - The bleed

    /// No edge anywhere in this layer. It is the difference between a luminous body and a green
    /// circle, and it costs two gradients.
    private func bleed(breath: Double, gather: Double) -> some View {
        ZStack {
            Circle().fill(RadialGradient(gradient: Gradient(stops: [
                .init(color: accent.opacity((pulse == .escalate ? 0.46 : 0.58) + gather * 0.18), location: 0),
                .init(color: accent.opacity(pulse == .escalate ? 0.18 : 0.26), location: 0.38),
                .init(color: mid.opacity(0.09), location: 0.72),
                .init(color: mid.opacity(0), location: 1)
            ]), center: .center, startRadius: size * 0.26, endRadius: size * spread))
            Circle().fill(RadialGradient(gradient: Gradient(stops: [
                .init(color: ThusoTheme.brandMint.opacity(0.48 + gather * 0.16), location: 0),
                .init(color: ThusoTheme.brandMint.opacity(0.13), location: 0.55),
                .init(color: ThusoTheme.brandMint.opacity(0), location: 1)
            ]), center: .center, startRadius: size * 0.29, endRadius: size * 0.46))
        }
        .scaleEffect(1 + 0.05 * breath + 0.02 * gather)
    }

    // MARK: - Rings

    /// Three concentric hairlines. They tighten and brighten while the sphere is gathering, which
    /// is the whole of the "thinking" gesture — nothing here spins faster to look busy.
    private func halo(breath: Double, gather: Double) -> some View {
        ZStack {
            hairline(diameter: size * 0.74, opacity: 0.16 + gather * 0.22)
            hairline(diameter: size * 0.86, opacity: 0.10 + gather * 0.17)
            hairline(diameter: size * 0.98, opacity: 0.05 + gather * 0.12)
        }
        .scaleEffect(1 - gather * 0.05 + breath * 0.006)
    }

    private func hairline(diameter: CGFloat, opacity: Double) -> some View {
        Circle().stroke(ThusoTheme.brandMint.opacity(opacity), lineWidth: 1)
            .frame(width: diameter, height: diameter)
    }

    /* Two orbits, flattened and tilted against each other so they read as rings around a body
       rather than as ovals on top of one. The brightness travels round the circumference instead
       of the ring itself rotating: a rotating ellipse wobbles, a travelling arc orbits. */
    private func orbits(clock: Double, breath: Double, gather: Double) -> some View {
        ZStack {
            orbit(width: size * 1.00, flatten: 0.34, tilt: -21 + breath * 2.5,
                  angle: clock * 16, opacity: 1.0, weight: 1.6)
            orbit(width: size * 0.84, flatten: 0.23, tilt: 27 - breath * 3.0,
                  angle: -clock * 11, opacity: 0.80 + gather * 0.20, weight: 1.2)
        }
        .scaleEffect(1 - gather * 0.06)
    }

    private func orbit(width: CGFloat, flatten: CGFloat, tilt: Double,
                       angle: Double, opacity: Double, weight: CGFloat) -> some View {
        Ellipse()
            .stroke(AngularGradient(gradient: Gradient(stops: [
                .init(color: ThusoTheme.brandMint.opacity(0), location: 0),
                .init(color: ThusoTheme.brandMint.opacity(opacity), location: 0.15),
                .init(color: glint.opacity(opacity * (pulse == .thinking || pulse == .escalate ? 0.95 : 0.55)), location: 0.32),
                .init(color: ThusoTheme.brandMint.opacity(0), location: 0.58),
                .init(color: ThusoTheme.brandMint.opacity(0), location: 1)
            ]), center: .center, angle: .degrees(angle)), lineWidth: weight)
            .frame(width: width, height: width * flatten)
            .rotationEffect(.degrees(tilt))
    }

    // MARK: - The body

    /* THE BODY, AND THE MISTAKE THIS IS THE THIRD ANSWER TO.
       A deep core with a ring of light concentric around it is a doughnut, not a sphere, and no
       amount of shading rescues it: the shadow ends up as an island floating in the middle of the
       shape, which read on screen as a thumbprint smeared across it. A ball's shadow is attached to
       the limb furthest from the light. So the body is lit from the upper left and falls to the
       deep core at the lower-right edge, and the genre's bright rim is a separate shell laid over
       the top of that — light this body carries at its own edge, all the way round, thick and soft
       on a settled state and thin and hot on a state with something in it. */
    private func sphere(clock: Double, breath: Double, gather: Double) -> some View {
        let diameter = size * 0.63
        let radius = diameter / 2
        return ZStack {
            Circle().fill(RadialGradient(gradient: Gradient(stops: [
                .init(color: ThusoTheme.brandMint, location: 0),
                .init(color: mid, location: 0.36),
                .init(color: core, location: 0.80),
                .init(color: core, location: 1)
            ]), center: lightCentre(clock: clock, gather: gather),
               startRadius: 0, endRadius: radius * 1.55))
            /* The bounce. A shadow side with nothing in it is a dead grey area; a little light finding
               its way back into it is what real spheres do, and it is what keeps the lower right
               reading as shadow rather than as a hole. It is the one place the wordmark's orange roof
               appears, at a sixth of its strength: warmth, not a mark. */
            Circle().fill(RadialGradient(gradient: Gradient(stops: [
                .init(color: ThusoTheme.brandOrange.opacity(0.16), location: 0),
                .init(color: ThusoTheme.brandOrange.opacity(0), location: 1)
            ]), center: bounceCentre(clock: clock), startRadius: 0, endRadius: radius * 0.90))
            Circle().fill(RadialGradient(gradient: Gradient(stops: [
                .init(color: Color.clear, location: 0),
                .init(color: Color.clear, location: rimStart),
                .init(color: ThusoTheme.brandMint.opacity(0.50), location: rimStart + (1 - rimStart) * 0.62),
                .init(color: Color.white.opacity(0.92), location: 1)
            ]), center: .center, startRadius: 0, endRadius: radius))
            sheen(clock: clock, radius: radius)
            specular(radius: radius, breath: breath)
        }
        .frame(width: diameter, height: diameter)
        /* A mask rather than a clip, but only just. A clipped circle reads as a ball with a cut
           edge; a mask that gives up the last one and a half per cent of the radius lets the body
           meet its own glow without the limb going to cotton wool, which is what a generous fade
           did here. */
        .mask(Circle().fill(RadialGradient(gradient: Gradient(stops: [
            .init(color: .black, location: 0),
            .init(color: .black, location: 0.93),
            .init(color: .black.opacity(0.60), location: 0.985),
            .init(color: .clear, location: 1)
        ]), center: .center, startRadius: 0, endRadius: radius)))
        .overlay(
            /* One rim light, and it dies away on the shadow side. A rim that runs the whole way
               round is a drawn outline, which is the one thing a lit sphere never has. */
            Circle().strokeBorder(LinearGradient(gradient: Gradient(stops: [
                .init(color: Color.white.opacity(0.95), location: 0),
                .init(color: ThusoTheme.brandMint.opacity(0.45), location: 0.42),
                .init(color: ThusoTheme.brandGreen.opacity(0.10), location: 0.78),
                .init(color: Color.clear, location: 1)
            ]), startPoint: .topLeading, endPoint: .bottomTrailing), lineWidth: 1.7)
                .blur(radius: 0.5)
                .frame(width: diameter, height: diameter)
        )
        .scaleEffect(1 + 0.018 * breath - 0.022 * gather)
    }

    /* Where the light falls, and it moves. The upper-left pool is the sphere's key light, and
       drifting its centre by a few per cent is what the internal shimmer is made of now. It
       replaced two blurred ellipses: pale masses over a deep core leave a crescent of core
       uncovered between them, and that crescent read as a thumbprint smeared across the middle of
       the sphere — an artefact of the drawing rather than anything in it. Moving the light gives
       the same slow internal change with nothing inside the sphere that has an edge. The pool
       draws in towards the middle while the sphere is gathering.

       Nothing under either of these changes a box: they are gradient centres on layers nothing
       else is measured against. */
    private func lightCentre(clock: Double, gather: Double) -> UnitPoint {
        let pull = gather * 0.06
        return UnitPoint(x: 0.34 + sin(clock * 0.23) * 0.035 + pull,
                         y: 0.28 + cos(clock * 0.19) * 0.030 + pull)
    }

    private func bounceCentre(clock: Double) -> UnitPoint {
        UnitPoint(x: 0.72 + cos(clock * 0.17) * 0.030, y: 0.76 + sin(clock * 0.21) * 0.028)
    }

    /// A slow sweep of light round the body — the shimmer, and it is one gradient rather than a
    /// particle system.
    private func sheen(clock: Double, radius: CGFloat) -> some View {
        Circle().fill(AngularGradient(gradient: Gradient(stops: [
            .init(color: .white.opacity(0), location: 0),
            .init(color: .white.opacity(0.15), location: 0.11),
            .init(color: .white.opacity(0), location: 0.28),
            .init(color: .white.opacity(0), location: 1)
        ]), center: .center, angle: .degrees(clock * 9)))
        .blur(radius: radius * 0.10)
    }

    /// One highlight, well off centre, with a small hard glint inside it. Centred, it hollows the
    /// sphere out into a ring, which is what the first pass at this looked like. The glint is the
    /// wordmark's lime dot, which is the only size lime is ever spent at.
    private func specular(radius: CGFloat, breath: Double) -> some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.62))
                .frame(width: radius * 0.58, height: radius * 0.48)
                .blur(radius: radius * 0.14)
                .offset(x: -radius * 0.32, y: -radius * 0.40)
            Circle().fill(ThusoTheme.brandLime.opacity(0.92))
                .frame(width: radius * 0.17, height: radius * 0.17)
                .blur(radius: radius * 0.035)
                .offset(x: -radius * 0.36, y: -radius * 0.44)
        }
        .scaleEffect(1 + 0.05 * breath)
    }

    // MARK: - Particles

    /* Twenty-six of them, in one Canvas. The golden angle spaces them without a random number
       generator, the vertical squash puts them on an orbital plane rather than in a flat halo, and
       each one's speed, size and twinkle is a different modulo of its own index — which is what
       stops them reading as a clock face. They draw inwards and brighten while the sphere gathers.
       One in five is lime and the rest mint, chosen by index like everything else here, so the field
       is the same field on every run. */
    private func particles(clock: Double, gather: Double, heard: Double) -> some View {
        let quick = pulse == .thinking ? 2.4 : 1.0
        let limeEvery = pulse == .thinking ? 2 : 5
        return Canvas { context, box in
            let centre = CGPoint(x: box.width / 2, y: box.height / 2)
            let extent = Double(size)
            for index in 0..<26 {
                let seed = Double(index)
                let drift = (0.05 + fmod(seed, 5) * 0.011) * quick
                let angle = seed * 2.39996 + clock * drift * (1 + gather * 1.7)
                let orbit = (0.335 + fmod(seed * 0.37, 1) * 0.19) * (1 - gather * 0.10) * (1 + heard * 0.08)
                let wobble = sin(clock * (0.6 + heard * 5) + seed) * extent * (0.012 + heard * 0.03)
                let reach = extent * orbit + wobble
                let point = CGPoint(x: centre.x + CGFloat(cos(angle) * reach),
                                    y: centre.y + CGFloat(sin(angle) * reach * 0.62))
                let twinkle = 0.30 + 0.42 * (0.5 + 0.5 * sin(clock * (1.1 + fmod(seed, 3) * 0.4) + seed * 1.7))
                let dot = CGFloat(extent * (0.006 + fmod(seed * 0.11, 1) * 0.008) * (1 + heard * 0.5))
                let spot = CGRect(x: point.x - dot / 2, y: point.y - dot / 2, width: dot, height: dot)
                context.fill(Path(ellipseIn: spot),
                             with: .color((index % limeEvery == 0 ? ThusoTheme.brandLime : ThusoTheme.brandMint)
                                            .opacity(min(1, twinkle * (0.55 + gather * 0.35) * (1 + heard * 0.6)))))
            }
            /* The ripple: the surface wavering at three frequencies that share no factor, so it never
               settles into a pattern while somebody speaks, and three rings shed outwards. Drawn only
               while there is a level, which is only while the microphone is open. */
            guard heard > 0.01 else { return }
            let body = extent * 0.315 * (1 + heard * 0.09)
            var surface = Path()
            for step in 0...120 {
                let theta = Double(step) / 120 * 2 * .pi
                let ripple = 0.035 * sin(5 * theta + clock * 7) + 0.025 * sin(3 * theta - clock * 4.3) + 0.015 * sin(9 * theta + clock * 11)
                let r = body * (1.015 + heard * ripple)
                let spot = CGPoint(x: centre.x + CGFloat(cos(theta) * r), y: centre.y + CGFloat(sin(theta) * r))
                if step == 0 { surface.move(to: spot) } else { surface.addLine(to: spot) }
            }
            surface.closeSubpath()
            let line = max(1, extent * 0.004)
            context.stroke(surface, with: .color(ThusoTheme.brandMint.opacity(min(1, heard * 0.9))), lineWidth: line)
            for ring in 0..<3 {
                let phase = fmod(clock * 0.8 + Double(ring) / 3, 1)
                let radius = body * (1.06 + phase * 0.5)
                let circle = Path(ellipseIn: CGRect(x: centre.x - radius, y: centre.y - radius, width: radius * 2, height: radius * 2))
                context.stroke(circle, with: .color(ThusoTheme.brandMint.opacity(heard * (1 - phase) * 0.6)), lineWidth: line)
            }
        }
    }
}
