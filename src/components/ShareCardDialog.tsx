import { useEffect, useState } from "react";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { Download } from "lucide-react";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { ShareIosIcon } from "./icons";
import {
  downloadCardImage,
  renderShareCard,
  shareCardFilename,
  shareCardImage
} from "../lib/shareCard";

/**
 * The app icon, for the footer of the share card.
 *
 * The shipped file rather than the pin redrawn on the canvas: the mark already
 * has one definition and a second copy of the geometry would drift from it
 * silently. Loaded once and remembered, because a night can be shared twice.
 *
 * A share is worth more than its logo, so a mark that will not load resolves to
 * nothing and the card is drawn without it. That has to include a load that
 * never finishes, not just one that fails: the whole card waits on this, and a
 * request left hanging by a flaky connection would otherwise leave the preview
 * spinning forever with no error to show for it. Hence the timeout, the same
 * guard and for the same reason as the one in `lib/svgImage.ts`.
 */
const MARK_TIMEOUT_MS = 4000;

let markPromise: Promise<HTMLImageElement | undefined> | undefined;
function loadMark(): Promise<HTMLImageElement | undefined> {
  markPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    setTimeout(() => resolve(undefined), MARK_TIMEOUT_MS);
    img.src = "/icons/icon-192.png";
  });
  return markPromise;
}
import type { ShareCardData } from "../lib/shareCard";

interface ShareCardDialogProps {
  open: boolean;
  card: ShareCardData | null;
  onClose: () => void;
  /**
   * Share a link instead of the picture, with the picture as the preview.
   *
   * For a screen whose share is worth opening rather than looking at. A layout
   * is the case: the three numbers are only half of it, and a reader who gets
   * the link can turn the ball, move the sliders and send one back, which a PNG
   * can never do. The card is still rendered and still shown, because a link
   * into a chat is a line of text nobody can see, and the preview is what says
   * what they are about to send.
   *
   * Setting this also puts a download control on the card, because the picture
   * otherwise has no way off the device at all: when the button sends a link,
   * nothing else here saves the PNG.
   */
  link?: { url: string; title: string } | null;
}

/**
 * Preview, then share.
 *
 * The preview is the point: this posts a picture to a feed under the user's
 * name, and nobody should send one they have not seen. It also makes the
 * "Save image" fallback honest on the browsers with no share sheet, because
 * the thing being saved is on screen.
 */
export function ShareCardDialog({ open, card, onClose, link = null }: ShareCardDialogProps) {
  const { dismiss, backdropStyle, rootStyle, panelStyle, exiting } = useSheetDismiss(onClose, "center");
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, open);

  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !card) return;
    let url: string | null = null;
    let live = true;

    setError("");
    setNote("");
    setPreview(null);
    setBlob(null);

    loadMark()
      .then((mark) => renderShareCard({ ...card, mark }))
      .then((made) => {
        if (!live) return;
        url = URL.createObjectURL(made);
        setBlob(made);
        setPreview(url);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : "The image could not be created.");
      });

    return () => {
      live = false;
      // Revoked on the way out, or every reopen leaks a blob URL.
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, card]);

  if (!open || !card) return null;

  async function handleShare() {
    if (!card) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      if (link) {
        // The share sheet where there is one, the clipboard where there is
        // not. A link nobody can paste is not a share, so the fallback says
        // out loud that it landed somewhere.
        if (typeof navigator.share === "function") {
          await navigator.share({ title: link.title, url: link.url });
        } else {
          await navigator.clipboard.writeText(link.url);
          setNote("Link copied");
        }
      } else if (blob) {
        await shareCardImage(blob, shareCardFilename(card.title));
      }
    } catch (err) {
      // A dismissed share sheet rejects, and cancelling is not a failure.
      if (!(err instanceof Error) || err.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Sharing failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    if (!blob || !card) return;
    setError("");
    downloadCardImage(blob, shareCardFilename(card.title));
    setNote("Image saved");
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share image"
      style={{ ...backdropStyle, ...rootStyle }}
      onClick={() => dismiss()}
    >
      <div
        ref={overlayRef}
        className={`flex max-h-full w-full max-w-sm flex-col rounded-xl bg-surface p-4 shadow-xl ${
          exiting ? "" : "animate-pop-in"
        }`}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The picture's own way out, on the picture, at the corner a phone
            puts a save control on. It rides the preview rather than the screen
            behind it because this is where the image exists: the card is built
            when the dialog opens, and a control outside would have to build a
            second copy of it to save. Only on a link share, where the button
            below sends a URL and nothing else here would save the PNG. */}
        {link && (
          <div className="mb-2 flex justify-end">
            <IconButton
              variant="round"
              label="Save image"
              disabled={!blob}
              onClick={handleDownload}
            >
              <Download size={18} aria-hidden="true" />
            </IconButton>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {preview ? (
            <img
              src={preview}
              alt={`${card.title}, ${card.hero ? `${card.hero.value} ${card.hero.label}` : "stats"}`}
              className="w-full rounded-lg"
            />
          ) : (
            <div
              className="w-full animate-pulse rounded-lg bg-surface-muted"
              style={{ aspectRatio: "1080 / 1350" }}
            />
          )}
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-danger-600">{error}</p>}
        {note && (
          <p role="status" className="mt-3 text-sm font-semibold text-ink-secondary">
            {note}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dismiss()}>
            Close
          </Button>
          {/* A link share does not wait on the picture: the preview is a
              courtesy, and a browser that will not rasterize the ball must not
              take the share down with it. */}
          <Button onClick={handleShare} disabled={(!link && !blob) || busy}>
            <ShareIosIcon size={16} aria-hidden="true" />
            {busy ? "Sharing…" : link ? "Share link" : "Share"}
          </Button>
        </div>
      </div>
    </div>
  );
}
