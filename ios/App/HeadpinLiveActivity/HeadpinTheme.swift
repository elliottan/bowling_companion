import SwiftUI
import UIKit

/// The app's own colors and its mark, for the Live Activity (ADR-221).
///
/// The values are the page's tokens (`--color-*` in `src/index.css`, the default
/// felt palette), written out because a widget cannot read a stylesheet. The
/// Lock Screen follows the phone's light or dark setting; the Dynamic Island is
/// always dark, whatever the phone's setting, so it has a palette of its own.
struct HeadpinPalette {
    let ink: Color
    let secondary: Color
    let edge: Color
    let accent: Color
    let accentSoft: Color

    /// Light and dark by the phone's own setting.
    static let lockScreen = HeadpinPalette(
        ink: adaptive(light: (2, 6, 23), dark: (241, 245, 249)),
        secondary: adaptive(light: (100, 116, 139), dark: (148, 163, 184)),
        edge: adaptive(light: (226, 232, 240), dark: (71, 85, 105)),
        accent: adaptive(light: (27, 81, 72), dark: (94, 214, 193)),
        accentSoft: adaptive(light: (240, 247, 245), dark: (22, 44, 40))
    )

    /// On the island's black.
    static let island = HeadpinPalette(
        ink: Color.white,
        secondary: Color.white.opacity(0.62),
        edge: Color.white.opacity(0.28),
        accent: Color(red: 94 / 255, green: 214 / 255, blue: 193 / 255),
        accentSoft: Color(red: 94 / 255, green: 214 / 255, blue: 193 / 255).opacity(0.2)
    )

    /// The card behind the Lock Screen banner: `--color-surface`.
    static let lockScreenBackground = adaptive(light: (255, 255, 255), dark: (30, 41, 59))

    private static func adaptive(light: (Double, Double, Double), dark: (Double, Double, Double)) -> Color {
        Color(UIColor { traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: rgb.0 / 255, green: rgb.1 / 255, blue: rgb.2 / 255, alpha: 1)
        })
    }
}

/// The app's pin, the one in `src/components/ui/ProMark.tsx` and the app icon,
/// drawn on its own 100 by 155 grid and fitted to whatever rect it is given.
struct PinShape: Shape {
    func path(in rect: CGRect) -> Path {
        // The pin spans x 24 to 76 and y 5 to 151 on that grid.
        let scale = min(rect.width / 52, rect.height / 146)
        let originX = rect.midX - 50 * scale
        let originY = rect.midY - 78 * scale
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: originX + x * scale, y: originY + y * scale)
        }
        var path = Path()
        path.move(to: point(50, 5))
        path.addCurve(to: point(63, 20), control1: point(57, 5), control2: point(63, 11))
        path.addCurve(to: point(60, 52), control1: point(63, 30), control2: point(60, 40))
        path.addCurve(to: point(67, 80), control1: point(60, 64), control2: point(63, 70))
        path.addCurve(to: point(76, 114), control1: point(72, 91), control2: point(76, 100))
        path.addCurve(to: point(65, 149), control1: point(76, 130), control2: point(71, 143))
        path.addLine(to: point(65, 151))
        path.addLine(to: point(35, 151))
        path.addLine(to: point(35, 149))
        path.addCurve(to: point(24, 114), control1: point(29, 143), control2: point(24, 130))
        path.addCurve(to: point(33, 80), control1: point(24, 100), control2: point(28, 91))
        path.addCurve(to: point(40, 52), control1: point(37, 70), control2: point(40, 64))
        path.addCurve(to: point(37, 20), control1: point(40, 40), control2: point(37, 30))
        path.addCurve(to: point(50, 5), control1: point(37, 11), control2: point(43, 5))
        path.closeSubpath()
        return path
    }
}

/// The app's mark: the cream pin on the felt, the same in light and dark as the
/// app icon is.
struct HeadpinMark: View {
    let size: CGFloat

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                .fill(Color(red: 27 / 255, green: 81 / 255, blue: 72 / 255))
            PinShape()
                .fill(Color(red: 255 / 255, green: 248 / 255, blue: 237 / 255))
                .frame(width: size * 0.5, height: size * 0.66)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
