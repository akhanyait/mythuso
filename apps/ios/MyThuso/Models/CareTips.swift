import SwiftUI

/* A care tip, and the two sentences the screen fills in.
 *
 * The tips themselves are CareTipsData.swift, generated from packages/catalog/care-tips.json; this
 * file holds only their shape and the template filling, so nothing here can hold a word of advice.
 * The fill and the ink are the design tokens the contract names, resolved by the generator, so a
 * card's text is always on a pair tokens.json#contrast measures. */

struct CareTip: Identifiable, Hashable {
    let id: String
    let category: String
    let tag: String
    let title: String
    let body: String
    let fill: Color
    let ink: Color
    /// The one dark card — when to call — takes its chip and its drawing in lime rather than white.
    let dark: Bool
}

enum CareTips {
    static var all: [CareTip] { CareTipsData.tips }

    private static func fill(_ template: String, _ values: [String: String]) -> String {
        values.reduce(template) { text, pair in text.replacingOccurrences(of: "{\(pair.key)}", with: pair.value) }
    }
    static func counter(_ index: Int) -> String {
        fill(CareTipsData.Screen.counter, ["n": "\(index + 1)", "total": "\(all.count)"])
    }
    static func jumpLabel(_ index: Int) -> String {
        fill(CareTipsData.Screen.jumpLabel, ["n": "\(index + 1)", "title": all[index].title])
    }
    /// The next two, and only while there are two left: the stack thins as it is read.
    static func behind(_ index: Int) -> [CareTip] {
        Array(all.dropFirst(index + 1).prefix(2))
    }
}
