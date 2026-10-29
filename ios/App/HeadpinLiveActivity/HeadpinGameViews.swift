import SwiftUI

/// One frame of the card: its marks over the running total, as the scorecard in
/// the app draws it. Every string arrives ready to draw; nothing is worked out
/// here.
struct FrameCellView: View {
    let number: Int
    let frame: HeadpinGameAttributes.ContentState.Frame
    let isCurrent: Bool
    let palette: HeadpinPalette
    /// The frame's number above it, for the few frames the island shows.
    var showsNumber = false
    var markSize: CGFloat = 12

    var body: some View {
        VStack(spacing: 0) {
            if showsNumber {
                Text("\(number)")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(palette.secondary)
                    .frame(height: 13)
            }
            HStack(spacing: 0) {
                ForEach(frame.marks.indices, id: \.self) { index in
                    if index > 0 {
                        Rectangle().fill(palette.edge).frame(width: 0.5)
                    }
                    Text(frame.marks[index])
                        .font(.system(size: markSize, weight: .semibold).monospacedDigit())
                        .foregroundColor(palette.ink)
                        .frame(maxWidth: .infinity)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                }
            }
            .frame(height: markSize + 6)
            Rectangle().fill(palette.edge).frame(height: 0.5)
            Text(frame.score)
                .font(.system(size: markSize, weight: .bold).monospacedDigit())
                .foregroundColor(palette.ink)
                .frame(maxWidth: .infinity)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .frame(height: markSize + 6)
        }
        .background(
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .fill(isCurrent ? palette.accentSoft : Color.clear)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 5, style: .continuous)
                .stroke(isCurrent ? palette.accent : palette.edge, lineWidth: isCurrent ? 1.5 : 0.5)
        )
    }
}

/// The ten frames in a row, the one being bowled marked.
struct FrameStripView: View {
    let state: HeadpinGameAttributes.ContentState
    let palette: HeadpinPalette

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(state.frames.enumerated()), id: \.offset) { item in
                FrameCellView(
                    number: item.offset + 1,
                    frame: item.element,
                    isCurrent: !state.done && item.offset + 1 == state.frame,
                    palette: palette,
                    markSize: 11
                )
                .frame(maxWidth: .infinity)
            }
        }
    }
}

/// The Lock Screen banner: the session and the game, the running total, and the
/// card.
struct LockScreenGameView: View {
    let state: HeadpinGameAttributes.ContentState
    private let palette = HeadpinPalette.lockScreen

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 8) {
                HeadpinMark(size: 28)
                VStack(alignment: .leading, spacing: 0) {
                    Text(state.label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(palette.ink)
                        .lineLimit(1)
                    if !state.location.isEmpty {
                        Text(state.location)
                            .font(.system(size: 12))
                            .foregroundColor(palette.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                Text("Game \(state.game)")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(palette.accent)
            }
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(state.total)")
                    .font(.system(size: 38, weight: .bold, design: .rounded).monospacedDigit())
                    .foregroundColor(palette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(state.done ? "Final score" : "Frame \(state.frame)")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(palette.ink)
                    if let max = state.max {
                        Text("Max \(max)")
                            .font(.system(size: 12).monospacedDigit())
                            .foregroundColor(palette.secondary)
                    }
                }
            }
            FrameStripView(state: state, palette: palette)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
    }
}

/// The island's expanded bottom: the last few frames, up to the one being bowled.
struct RecentFramesView: View {
    let state: HeadpinGameAttributes.ContentState
    private let palette = HeadpinPalette.island

    var body: some View {
        let upTo = min(state.frames.count, state.done ? 10 : max(1, state.frame))
        let from = max(0, upTo - 4)
        HStack(spacing: 4) {
            ForEach(Array(state.frames.enumerated()).filter { $0.offset >= from && $0.offset < upTo }, id: \.offset) { item in
                FrameCellView(
                    number: item.offset + 1,
                    frame: item.element,
                    isCurrent: !state.done && item.offset + 1 == state.frame,
                    palette: palette,
                    showsNumber: true,
                    markSize: 13
                )
                .frame(maxWidth: .infinity)
            }
        }
    }
}
