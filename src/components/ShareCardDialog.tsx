import { t } from "@lingui/core/macro";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "./ui/Button";
import { FormSheet } from "./ui/FormSheet";
import { IconButton } from "./ui/IconButton";
import { ShareIosIcon } from "./icons";
import {
  downloadCardImage,
  renderShareCard,
  shareCardFilename,
  shareCardImage
} from "../lib/shareCard";
import { shareLinkFromApp } from "../lib/nativeShare";
import { isNativeApp } from "../lib/platform";

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

  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !card) return;
    let url: string | null = null;
    let live = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening clears the last card before the new one renders, which is async
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
        setError(err instanceof Error ? err.message : t`The image could not be created.`);
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
        if (isNativeApp()) {
          // The store apps' own sheet: Android's web view has no Web Share.
          await shareLinkFromApp(link.title, link.url);
        } else if (typeof navigator.share === "function") {
          await navigator.share({ title: link.title, url: link.url });
        } else {
          await navigator.clipboard.writeText(link.url);
          setNote(t`Link copied`);
        }
      } else if (blob) {
        await shareCardImage(blob, shareCardFilename(card.title));
      }
    } catch (err) {
      // A dismissed share sheet rejects, and cancelling is not a failure.
      if ((err as { name?: unknown } | null)?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : t`Sharing failed.`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!blob || !card) return;
    setError("");
    try {
      await downloadCardImage(blob, shareCardFilename(card.title));
      // In the store apps the save goes through the share sheet, which says
      // for itself where the picture went.
      if (!isNativeApp()) setNote(t`Image saved`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Saving failed.`);
    }
  }

  // A sheet from the bottom edge, as the rest of the app's are (DESIGN-LANGUAGE §1). It
  // was a card popped up in the middle of the screen, which read as a web
  // page's modal rather than the phone's share preview.
  return (
    <FormSheet
      title={t`Share image`}
      onClose={onClose}
      // The picture's own way off the device, in the bar's trailing slot,
      // where a phone puts the save on a preview. Only on a link share, where
      // the button below sends a URL and nothing else here saves the PNG.
      trailing={
        link ? (
          <IconButton variant="round" label={t`Save image`} disabled={!blob} onClick={handleDownload}>
            <Download size={18} aria-hidden="true" />
          </IconButton>
        ) : undefined
      }
    >
      {preview ? (
        <img
          src={preview}
          alt={
            card.hero
              ? t`${{ title: card.title }}, ${{ value: card.hero.value }} ${{ label: card.hero.label }}`
              : t`${{ title: card.title }}, stats`
          }
          // Held to the screen's height, so the share button under it is in
          // reach without a scroll on a short phone.
          className="mx-auto max-h-[55vh] w-auto max-w-full rounded-lg"
        />
      ) : (
        <div
          className="mx-auto max-h-[55vh] w-full max-w-[44vh] animate-pulse rounded-lg bg-surface-muted"
          style={{ aspectRatio: "1080 / 1350" }}
        />
      )}

      {error && <p className="mt-3 text-sm font-semibold text-danger-600">{error}</p>}
      {note && (
        <p role="status" className="mt-3 text-sm font-semibold text-ink-secondary">
          {note}
        </p>
      )}

      {/* A link share does not wait on the picture: the preview is a
          courtesy, and a browser that will not rasterize the ball must not
          take the share down with it. */}
      <Button className="mt-4 w-full" onClick={handleShare} disabled={(!link && !blob) || busy}>
        <ShareIosIcon size={16} aria-hidden="true" />
        {busy ? t`Sharing…` : link ? t`Share link` : t`Share`}
      </Button>
    </FormSheet>
  );
}
