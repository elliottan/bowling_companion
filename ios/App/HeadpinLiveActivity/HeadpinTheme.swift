import SwiftUI
import UIKit

/// The app's own colors and its mark, for the Live Activity (ADR-221).
///
/// The values are the page's tokens (`--color-*` in `src/index.css`), written out
/// because a widget cannot read a stylesheet. The page sends the palette the app
/// is showing and the bowler's theme choice with every update, so the Lock
/// Screen is in the bowler's accent, light or dark as the app is. A theme of
/// "system" follows the phone. The Dynamic Island is always dark, whatever the
/// phone's setting, so it takes the palette's dark accent.
struct HeadpinPalette {
    let ink: Color
    let secondary: Color
    let edge: Color
    let accent: Color
    let accentSoft: Color
    /// Behind the mark: `--color-accent-fill`.
    let accentFill: Color
    /// The card behind the Lock Screen banner: `--color-surface`.
    let background: Color

    static func lockScreen(palette: String, dark: Bool) -> HeadpinPalette {
        let tokens = HeadpinAccents.tokens(for: palette, dark: dark)
        return HeadpinPalette(
            ink: rgb(dark ? (241, 245, 249) : (2, 6, 23)),
            secondary: rgb(dark ? (148, 163, 184) : (100, 116, 139)),
            edge: rgb(dark ? (71, 85, 105) : (226, 232, 240)),
            accent: rgb(tokens.accent),
            accentSoft: rgb(tokens.soft),
            accentFill: rgb(tokens.fill),
            background: rgb(dark ? (30, 41, 59) : (255, 255, 255))
        )
    }

    /// On the island's black.
    static func island(palette: String) -> HeadpinPalette {
        let tokens = HeadpinAccents.tokens(for: palette, dark: true)
        let accent = rgb(tokens.accent)
        return HeadpinPalette(
            ink: Color.white,
            secondary: Color.white.opacity(0.62),
            edge: Color.white.opacity(0.28),
            accent: accent,
            accentSoft: accent.opacity(0.2),
            accentFill: rgb(tokens.fill),
            background: Color.black
        )
    }

    /// Whether to draw dark: the app's own choice, else the phone's.
    static func isDark(theme: String, phone: ColorScheme) -> Bool {
        if theme == "dark" { return true }
        if theme == "light" { return false }
        return phone == .dark
    }

    private static func rgb(_ value: (Double, Double, Double)) -> Color {
        Color(red: value.0 / 255, green: value.1 / 255, blue: value.2 / 255)
    }
}

/// One palette's accent tokens in one theme.
struct AccentTokens {
    /// `--color-accent`
    let accent: (Double, Double, Double)
    /// `--color-accent-soft`
    let soft: (Double, Double, Double)
    /// `--color-accent-fill`
    let fill: (Double, Double, Double)
}

/// Every palette's accent (ADR-164), copied from `src/index.css`.
/// `src/test/liveActivityProject.test.ts` reads both and fails on any
/// difference, so a palette changed in the page cannot drift here.
enum HeadpinAccents {
    static let light: [String: AccentTokens] = [
        "felt": AccentTokens(accent: (27, 81, 72), soft: (240, 247, 245), fill: (27, 81, 72)),
        "ocean": AccentTokens(accent: (29, 78, 216), soft: (239, 246, 255), fill: (29, 78, 216)),
        "sunset": AccentTokens(accent: (194, 65, 12), soft: (255, 247, 237), fill: (194, 65, 12)),
        "grape": AccentTokens(accent: (109, 40, 217), soft: (245, 243, 255), fill: (109, 40, 217)),
        "rose": AccentTokens(accent: (190, 18, 60), soft: (255, 241, 242), fill: (190, 18, 60))
    ]

    static let dark: [String: AccentTokens] = [
        "felt": AccentTokens(accent: (94, 214, 193), soft: (22, 44, 40), fill: (45, 138, 120)),
        "ocean": AccentTokens(accent: (147, 197, 253), soft: (22, 36, 70), fill: (59, 130, 246)),
        "sunset": AccentTokens(accent: (253, 186, 116), soft: (54, 30, 14), fill: (249, 115, 22)),
        "grape": AccentTokens(accent: (196, 181, 253), soft: (36, 26, 66), fill: (139, 92, 246)),
        "rose": AccentTokens(accent: (253, 164, 175), soft: (58, 20, 30), fill: (244, 63, 94))
    ]

    /// An unknown palette, from a newer page, reads as Felt.
    static func tokens(for palette: String, dark: Bool) -> AccentTokens {
        let table = dark ? self.dark : light
        return table[palette] ?? table["felt"]!
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

/// The app's mark: the cream pin on the bowler's accent.
struct HeadpinMark: View {
    let size: CGFloat
    let fill: Color

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
                .fill(fill)
            PinShape()
                .fill(Color(red: 255 / 255, green: 248 / 255, blue: 237 / 255))
                .frame(width: size * 0.5, height: size * 0.66)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
