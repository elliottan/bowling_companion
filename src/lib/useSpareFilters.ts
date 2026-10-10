import { useCallback, useMemo } from "react";
import { useRememberedState } from "./viewMemory";
import type { PinNumber } from "../types/bowling";
import type { SpareFilter } from "./spareLines";

/**
 * The leave filters the Spare lines screen and the Stats tab's All leaves sheet
 * share (ADR-128).
 *
 * One set, kept for the app run (`viewMemory`), so narrowing to the baby splits
 * on one side is still narrowed on the other. Held as arrays rather than Sets
 * so a write is a new value every time and every reader re-renders.
 */
export interface SpareFilters {
  /** The shape and status chips that are on. */
  filters: ReadonlySet<SpareFilter>;
  toggle: (filter: SpareFilter) => void;
  /** Pins picked on the deck: a leave must have all of them standing. */
  pins: ReadonlySet<PinNumber>;
  setPins: (pins: PinNumber[]) => void;
  /** Only leaves of exactly the picked pins, no more. */
  exact: boolean;
  setExact: (exact: boolean) => void;
  /** Whether anything is narrowing the list. */
  active: boolean;
  clear: () => void;
}

const NO_FILTERS: SpareFilter[] = [];
const NO_PINS: PinNumber[] = [];

export function useSpareFilters(): SpareFilters {
  const [filterList, setFilterList] = useRememberedState<SpareFilter[]>("spares:filters", NO_FILTERS);
  const [pinList, setPinList] = useRememberedState<PinNumber[]>("spares:pins", NO_PINS);
  const [exact, setExact] = useRememberedState("spares:exact", false);

  const filters = useMemo(() => new Set(filterList), [filterList]);
  const pins = useMemo(() => new Set(pinList), [pinList]);

  const toggle = useCallback(
    (f: SpareFilter) =>
      setFilterList((curr) => (curr.includes(f) ? curr.filter((x) => x !== f) : [...curr, f])),
    [setFilterList]
  );
  const setPins = useCallback((next: PinNumber[]) => setPinList([...next]), [setPinList]);
  const clear = useCallback(() => {
    setFilterList(NO_FILTERS);
    setPinList(NO_PINS);
  }, [setFilterList, setPinList]);

  return {
    filters,
    toggle,
    pins,
    setPins,
    exact,
    setExact,
    active: filterList.length > 0 || pinList.length > 0,
    clear
  };
}
