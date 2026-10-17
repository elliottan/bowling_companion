import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProAccessContext, useProAccess } from "./useProAccess";

describe("useProAccess", () => {
  it("answers the web's way when nothing provides it", () => {
    const { result } = renderHook(() => useProAccess());
    expect(result.current).toEqual({ locked: false });
  });

  it("reads what a provider says", () => {
    const locked = { locked: true as const, appStoreUrl: "https://apps.apple.com/app/id1" };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ProAccessContext.Provider value={locked}>{children}</ProAccessContext.Provider>
    );
    const { result } = renderHook(() => useProAccess(), { wrapper });
    expect(result.current).toBe(locked);
  });
});
