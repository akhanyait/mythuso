import SwiftUI

/* The sphere the assistant screen is built around, and the reason it is a sphere.

   packages/catalog/capabilities.json carries `voice` with connected: false, and its neverSoften
   note forbids drawing a microphone affordance of any kind — not an enabled one, not a disabled
   one, not a decorative one. That rule removes the entire visual vocabulary a person expects an
   assistant to be made of: the capsule, the bar meter, the pulsing ring around a glyph. What is
   left has to suggest presence without suggesting hearing, and a sphere is the one form that does.
   It has no mouth and no aperture. It is lit rather than listening.

   So this file draws a volumetric orb and nothing else. There is no gesture on it, no tap target
   inside it, no symbol anywhere in it, and it is accessibilityHidden — everything it means is said
   in words beside it, because a reader who is listening to this screen must get the meaning and not
   a description of a green shape.

   HOW IT IS PUT TOGETHER, outside in: an ambient bleed that has no edge at all and dissolves into
   the ground; three concentric halo rings; two tilted orbit rings whose brightness travels round
   their circumference; the body, which is a radial gradient with a deep core and a bright rim, with
   three slow caustics drifting inside it, one travelling sheen, a terminator shadow at the
   bottom-right that is what makes it read as a ball rather than a disc, and a single specular
   highlight well off centre — centred, it hollows the shape into a ring; and finally a field of
   fine particles on a flattened orbital plane, drawn in one Canvas rather than as twenty-six views.

   NOTHING IS RANDOM. Every particle's radius, size, speed and twinkle comes from its index through
   the golden angle and a couple of modulo terms, so the drawing is the same drawing on every run
   and a screenshot test can be trusted. A random field would look the same and would make every
   comparison a coin toss.

   THE TWO THINGS IT DOES OVER TIME. At rest it breathes: one 6.5-second sine drives a scale and a
   luminance swell across the bleed, the body and the highlight, and the orbit rings drift against
   it. When the screen hands it a new state it gathers — the rings tighten inwards, the halo
   brightens, the caustics move at nearly three times their resting speed — holds for about a
   second, and settles. That envelope is computed from the clock rather than from withAnimation,
   because a gradient's colour stops and a Canvas's contents are not animatable data: SwiftUI would
   step them rather than interpolate them, and half of the drawing would arrive late.

   AND UNDER REDUCE MOTION IT STOPS, RATHER THAN SLOWING. The timeline is paused and the clock is
   replaced by one fixed moment, chosen because the caustics are balanced there rather than stacked.
   Every layer still draws. What a person gets is the whole sphere, still — never a blank circle and
   never a half-built one, which is what happens when an animated drawing is switched off by
   removing the thing that was animating it. The same pause covers the two cheaper cases: the
   sphere is off screen, or the app is not in front. A 30fps redraw behind a screen nobody is
   looking at is the cost this product can least justify on a phone somebody keeps to book a nurse. */

struct AssistantSphere: View {
    var size: CGFloat = 272
    /// Where this state sits on the sage ramp: 0 is the palest and widest, 3 the deepest and most
    /// concentrated. It is never the only thing that says which state this is — the screen says it
    /// in words directly underneath.
    var depth: Int = 0
    /// When the screen last handed the sphere something new to show. Nil means it has always been
    /// showing this, so there is nothing to gather about.
    var gatheredAt: Date?

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

    // The ramp, deepening with the state. Sage is a fill here and never a label: the darkest of
    // these measures 5.26:1 against the ground as a large shape and nothing at all as small text.
    /* The shell colour and the core, in order. The core is deep on every state: a body measured
       pale at the centre and pale at the rim reads as a pearl, which is what the first two passes
       of this drawing were. Light inside a dark body is what makes a sphere look lit. */
    private static let mids: [Color] = [ThusoTheme.softSage, ThusoTheme.paleSage,
                                        ThusoTheme.paleSage, ThusoTheme.paleSage]
    private static let cores: [Color] = [ThusoTheme.studioInk, ThusoTheme.studioInk,
                                         ThusoTheme.studioInkDeep, ThusoTheme.studioInkDeep]

    private var step: Int { min(max(depth, 0), Self.mids.count - 1) }
    private var mid: Color { Self.mids[step] }
    private var core: Color { Self.cores[step] }
    /// A settled state blooms wide; a state with something in it draws in on itself.
    private var spread: CGFloat { 0.54 - CGFloat(step) * 0.035 }
    /* Where the rim shell begins, as a fraction of the radius. This is the state carried as form
       rather than as tone: settled wears a thick soft shell and the lapsing credential a thin hot
       one, so a reader who cannot separate four greens still sees a different shape. */
    private var rimStart: CGFloat { 0.70 + CGFloat(step) * 0.055 }

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30,
                                paused: reduceMotion || !onScreen || scenePhase != .active)) { context in
            let clock = reduceMotion ? Self.stillMoment : context.date.timeIntervalSinceReferenceDate
            let breath = reduceMotion ? 0 : sin(clock * 2 * .pi / Self.breathPeriod)
            let gather = gathering(at: context.date)
            ZStack {
                bleed(breath: breath, gather: gather)
                halo(breath: breath, gather: gather)
                orbits(clock: clock, breath: breath, gather: gather)
                sphere(clock: clock, breath: breath, gather: gather)
                particles(clock: clock, gather: gather)
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
                .init(color: ThusoTheme.paleSage.opacity(0.58 + gather * 0.18), location: 0),
                .init(color: ThusoTheme.paleSage.opacity(0.26), location: 0.38),
                .init(color: mid.opacity(0.09), location: 0.72),
                .init(color: mid.opacity(0), location: 1)
            ]), center: .center, startRadius: size * 0.26, endRadius: size * spread))
            Circle().fill(RadialGradient(gradient: Gradient(stops: [
                .init(color: ThusoTheme.glow.opacity(0.48 + gather * 0.16), location: 0),
                .init(color: ThusoTheme.glow.opacity(0.13), location: 0.55),
                .init(color: ThusoTheme.glow.opacity(0), location: 1)
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
        Circle().stroke(ThusoTheme.paleSage.opacity(opacity), lineWidth: 1)
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
                .init(color: ThusoTheme.paleSage.opacity(0), location: 0),
                .init(color: ThusoTheme.paleSage.opacity(opacity), location: 0.15),
                .init(color: ThusoTheme.glow.opacity(opacity * 0.55), location: 0.32),
                .init(color: ThusoTheme.paleSage.opacity(0), location: 0.58),
                .init(color: ThusoTheme.paleSage.opacity(0), location: 1)
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
                .init(color: ThusoTheme.paleSage, location: 0),
                .init(color: mid, location: 0.36),
                .init(color: core, location: 0.80),
                .init(color: core, location: 1)
            ]), center: lightCentre(clock: clock, gather: gather),
               startRadius: 0, endRadius: radius * 1.55))
            /* The bounce. A shadow side with nothing in it is a dead grey area; a little of the
               body's own light finding its way back into it is what real spheres do, and it is what
               keeps the lower right reading as shadow rather than as a hole. */
            Circle().fill(RadialGradient(gradient: Gradient(stops: [
                .init(color: ThusoTheme.glow.opacity(0.20), location: 0),
                .init(color: ThusoTheme.glow.opacity(0), location: 1)
            ]), center: bounceCentre(clock: clock), startRadius: 0, endRadius: radius * 0.90))
            Circle().fill(RadialGradient(gradient: Gradient(stops: [
                .init(color: Color.clear, location: 0),
                .init(color: Color.clear, location: rimStart),
                .init(color: ThusoTheme.paleSage.opacity(0.50), location: rimStart + (1 - rimStart) * 0.62),
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
                .init(color: ThusoTheme.paleSage.opacity(0.45), location: 0.42),
                .init(color: ThusoTheme.glow.opacity(0.10), location: 0.78),
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
    /// sphere out into a ring, which is what the first pass at this looked like.
    private func specular(radius: CGFloat, breath: Double) -> some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.62))
                .frame(width: radius * 0.58, height: radius * 0.48)
                .blur(radius: radius * 0.14)
                .offset(x: -radius * 0.32, y: -radius * 0.40)
            Circle().fill(Color.white.opacity(0.92))
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
       stops them reading as a clock face. They draw inwards and brighten while the sphere gathers. */
    private func particles(clock: Double, gather: Double) -> some View {
        Canvas { context, box in
            let centre = CGPoint(x: box.width / 2, y: box.height / 2)
            let extent = Double(size)
            for index in 0..<26 {
                let seed = Double(index)
                let drift = 0.05 + fmod(seed, 5) * 0.011
                let angle = seed * 2.39996 + clock * drift * (1 + gather * 1.7)
                let orbit = (0.335 + fmod(seed * 0.37, 1) * 0.19) * (1 - gather * 0.10)
                let wobble = sin(clock * 0.6 + seed) * extent * 0.012
                let reach = extent * orbit + wobble
                let point = CGPoint(x: centre.x + CGFloat(cos(angle) * reach),
                                    y: centre.y + CGFloat(sin(angle) * reach * 0.62))
                let twinkle = 0.30 + 0.42 * (0.5 + 0.5 * sin(clock * (1.1 + fmod(seed, 3) * 0.4) + seed * 1.7))
                let dot = CGFloat(extent * (0.006 + fmod(seed * 0.11, 1) * 0.008))
                let spot = CGRect(x: point.x - dot / 2, y: point.y - dot / 2, width: dot, height: dot)
                context.fill(Path(ellipseIn: spot),
                             with: .color(ThusoTheme.paleSage.opacity(twinkle * (0.55 + gather * 0.35))))
            }
        }
    }
}
