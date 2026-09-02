import { useEffect, useState } from "react";
import { useOverlay } from "../lib/useOverlay";
import { useSheetDismiss } from "../lib/useSheetDismiss";
import { Button } from "./ui/Button";
import { renderShareCard, shareCardFilename, shareCardImage } from "../lib/shareCard";

/**
 * The app icon, for the footer of the share card.
 *
 * The shipped file rather than the pin redrawn on the canvas: the mark already
 * has one definition and a second copy of the geometry would drift from it
 * silently. Loaded once and remembered, because a night can be shared twice.
 *
 * A share is worth more than its logo, so a mark that will not load resolves to
 * nothing and the card is drawn without it.
 */
let markPromise: Promise<HTMLImageElement | undefined> | undefined;
function loadMark(): Promise<HTMLImageElement | undefined> {
  markPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = "/icons/icon-192.png";
  });
  return markPromise;
}
import type { ShareCardData } from "../lib/shareCard";

interface ShareCardDialogProps {
  open: boolean;
  card: ShareCardData | null;
  onClose: () => void;
}

/**
 * Preview, then share.
 *
 * The preview is the point: this posts a picture to a feed under the user's
 * name, and nobody should send one they have not seen. It also makes the
 * "Save image" fallback honest on the browsers with no share sheet, because
 * the thing being saved is on screen.
 */
export function ShareCardDialog({ open, card, onClose }: ShareCardDialogProps) {
  const { dismiss, backdropStyle, rootStyle, panelStyle, exiting } = useSheetDismiss(onClose, "center");
  const overlayRef = useOverlay<HTMLDivElement>(dismiss, open);

  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !card) return;
    let url: string | null = null;
    let live = true;

    setError("");
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
    if (!blob || !card) return;
    setBusy(true);
    setError("");
    try {
      await shareCardImage(blob, shareCardFilename(card.title));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sharing failed.");
    } finally {
      setBusy(false);
    }
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

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dismiss()}>
            Close
          </Button>
          <Button onClick={handleShare} disabled={!blob || busy}>
            {busy ? "Sharing..." : "Share"}
          </Button>
        </div>
      </div>
    </div>
  );
}
