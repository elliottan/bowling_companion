import { useEffect, useState } from "react";
import { getTextSize, setTextSize } from "../../services/bowlingRepository";
import {
  applyTextSize,
  readTextSize,
  rememberTextSize,
  type TextSizeId
} from "../../lib/textScale";

/**
 * The Text size setting. Starts from localStorage, so the first render is
 * already right, then reconciles with the settings table: a backup restored on
 * a new phone brings a size localStorage never saw.
 */
export function useTextSize(): [TextSizeId, (next: TextSizeId) => void] {
  const [id, setId] = useState<TextSizeId>(readTextSize);

  useEffect(() => {
    let live = true;
    void getTextSize()
      .then((stored) => {
        if (!live || !stored || stored === readTextSize()) return;
        rememberTextSize(stored);
        applyTextSize(stored);
        setId(stored);
      })
      .catch(() => {
        // The table is unreadable: the stored copy in localStorage stands.
      });
    return () => {
      live = false;
    };
  }, []);

  function update(next: TextSizeId) {
    setId(next);
    rememberTextSize(next);
    applyTextSize(next);
    void setTextSize(next).catch(() => {
      // Not saved to the table; localStorage has it for this device.
    });
  }

  return [id, update];
}

