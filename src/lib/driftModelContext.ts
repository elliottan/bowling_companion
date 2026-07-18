import { createContext, useContext } from "react";
import { DEFAULT_DRIFT_MODEL, type DriftModel } from "./driftModel";

export const DriftModelContext = createContext<DriftModel>(DEFAULT_DRIFT_MODEL);
export const useDriftModel = (): DriftModel => useContext(DriftModelContext);
