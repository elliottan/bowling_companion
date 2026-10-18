/**
 * Handing a file or a link to the phone, in the store apps (ADR-156).
 *
 * The web app saves a file by clicking a download link and shares through
 * `navigator.share`. Inside the store apps neither can be relied on: Android's
 * web view has no Web Share at all and drops a download on the floor, so a
 * backup "saved" there went nowhere. So the apps hand every file to the
 * platform's own share sheet instead, which is where a bowler saves to Files,
 * Drive or iCloud, sends it to themselves, or AirDrops it to a new phone.
 *
 * The plugins are imported on first use, so the web app's bundle never loads
 * them.
 */

export type NativeShareOutcome = "shared" | "cancelled";

/** Both platforms reject with "Share canceled" when the sheet is closed. */
function isCancel(err: unknown): boolean {
  return /cancel/i.test(err instanceof Error ? err.message : String(err));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("The file could not be read"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Write the file to the app's cache and open the share sheet on it. Text is
 * written as UTF-8 and anything else as bytes. The cache is the platform's to
 * clear, so nothing builds up.
 */
export async function shareFileFromApp(filename: string, data: Blob | string): Promise<NativeShareOutcome> {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share")
  ]);
  const written =
    typeof data === "string"
      ? await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, encoding: Encoding.UTF8 })
      : await Filesystem.writeFile({ path: filename, data: await blobToBase64(data), directory: Directory.Cache });
  try {
    await Share.share({ files: [written.uri] });
    return "shared";
  } catch (err) {
    if (isCancel(err)) return "cancelled";
    throw err;
  }
}

/** A link, through the same sheet. */
export async function shareLinkFromApp(title: string, url: string): Promise<NativeShareOutcome> {
  const { Share } = await import("@capacitor/share");
  try {
    await Share.share({ title, url });
    return "shared";
  } catch (err) {
    if (isCancel(err)) return "cancelled";
    throw err;
  }
}
