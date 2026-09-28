import SwiftUI
import UIKit

/* The MyThuso icon family on the tab bar.
 *
 * The patient's primary destinations wear the family on the web's tab bar (Overview, Book a nurse,
 * My visits, Health Passport), and the handoff's rule is that a primary destination never wears a
 * generic icon while a utility does. A SwiftUI tab item takes an Image, not a view, so the generated
 * Path builders in MyThusoIconsData are stroked once into a template image here — the same geometry,
 * the same round caps and joins, at the tab bar's own size — and UIKit tints it with the bar's
 * selected and unselected colours. Black is the mask, not a colour: a template image has none. The
 * signal dot is filled rather than pulsing, because a tab bar item never means "live". */
enum MyThusoTabIcon {
    static func image(_ icon: MyThusoIconsData.Icon, size: CGFloat = 25) -> UIImage {
        let scale = size / MyThusoIconsData.size
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
        return renderer.image { context in
            let cg = context.cgContext
            cg.setLineCap(.round)
            cg.setLineJoin(.round)
            cg.setStrokeColor(UIColor.black.cgColor)
            cg.setFillColor(UIColor.black.cgColor)
            for element in icon.elements {
                cg.setLineWidth(element.strokeWidth * scale)
                cg.addPath(element.path.applying(CGAffineTransform(scaleX: scale, y: scale)).cgPath)
                cg.strokePath()
            }
            let r = MyThusoIconsData.Signal.radius * scale
            let c = MyThusoIconsData.Signal.center
            cg.fillEllipse(in: CGRect(x: c.x * scale - r, y: c.y * scale - r, width: r * 2, height: r * 2))
        }.withRenderingMode(.alwaysTemplate)
    }
}
