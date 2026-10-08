import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BallFormDialog } from "./BallFormDialog";
import { db } from "../db/bowlingDb";
import { addBall, getBalls } from "../services/ballRepository";
import { setLayoutSystem } from "../services/bowlingRepository";
import type { BallLayoutSpec } from "../types/bowling";
import type { CatalogBall } from "../types/catalog";

vi.mock("../services/ballCatalogRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ballCatalogRepository")>();
  // The real sync fetches a JSON file; the rows it would write are seeded.
  return { ...actual, syncCatalog: vi.fn(async () => {}) };
});

const SPEC: BallLayoutSpec = {
  drillingAngle: 50,
  pinToPap: 4.5,
  valAngle: 40,
  symmetric: false,
  pinToCore: 6.75
};

const save = () => fireEvent.click(screen.getByRole("button", { name: /^(Add|Save)$/ }));

/** The ball this form just wrote. */
const saved = async (name: string) => (await getBalls()).find((b) => b.name === name);

describe("BallFormDialog layout", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("saves a ball with no layout, because a layout is optional", async () => {
    render(<BallFormDialog ball={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Plastic" } });
    save();

    await waitFor(async () => expect(await saved("Plastic")).toBeTruthy());
    expect((await saved("Plastic"))?.layout_spec).toBeUndefined();
  });

  it("stores the numbers a slider moved, not the text that was typed", async () => {
    render(<BallFormDialog ball={null} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Phaze II" } });
    fireEvent.click(screen.getByRole("button", { name: /Add a layout/ }));
    fireEvent.change(screen.getByRole("slider", { name: "Drilling angle" }), {
      target: { value: "60" }
    });
    save();

    await waitFor(async () => expect((await saved("Phaze II"))?.layout_spec).toBeTruthy());
    const spec = (await saved("Phaze II"))?.layout_spec;
    expect(spec?.drillingAngle).toBe(60);
    expect(spec?.pinToPap).toBe(4.5);
    expect(spec?.symmetric).toBe(false);
    // Nothing chose a notation, so the ball keeps following the preference.
    expect(spec?.system).toBeUndefined();
  });

  it("edits a layout in VLS and stores the dual angle it means", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const ball = await saved("Phaze II");

    render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Storm VLS/ }));
    fireEvent.change(await screen.findByRole("slider", { name: "Pin buffer" }), {
      target: { value: "1" }
    });
    save();

    await waitFor(async () => expect((await saved("Phaze II"))?.layout_spec?.system).toBe("vls"));
    const spec = (await saved("Phaze II"))?.layout_spec;
    // A VLS edit is an edit to the one layout underneath both notations: a
    // shorter pin buffer is a smaller VAL angle, and the angle is what gets
    // stored.
    expect(spec?.valAngle).toBeLessThan(SPEC.valAngle);
    expect(spec?.pinToPap).toBe(4.5);
  });

  it("opens the sliders in the notation the bowler reads", async () => {
    await setLayoutSystem("vls");
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const ball = await saved("Phaze II");

    render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByRole("slider", { name: "Pin buffer" })).toBeTruthy();
  });

  it("does not ask for a pin-to-PSA distance, which the core fixes at 6 3/4\"", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const ball = await saved("Phaze II");

    render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(await screen.findByRole("slider", { name: "Pin to PAP" })).toBeTruthy();
    expect(screen.queryByRole("slider", { name: "Pin to PSA" })).toBeNull();
  });

  it("moves the core marker with the core type, so the ball still exists", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC });
    const ball = await saved("Phaze II");

    render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Symmetric" }));
    save();

    await waitFor(async () =>
      expect((await saved("Phaze II"))?.layout_spec?.symmetric).toBe(true)
    );
    expect((await saved("Phaze II"))?.layout_spec?.pinToCore).toBe(3);
  });

  it("removes a layout without touching the rest of the ball", async () => {
    await addBall({ name: "Phaze II", is_spare_ball: false, layout_spec: SPEC, notes: "keep me" });
    const ball = await saved("Phaze II");

    render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove layout/ }));
    save();

    await waitFor(async () =>
      expect((await saved("Phaze II"))?.layout_spec).toBeUndefined()
    );
    expect((await saved("Phaze II"))?.notes).toBe("keep me");
  });

  it("keeps the text typed on a ball from before, until numbers replace it", async () => {
    await addBall({ name: "Old ball", is_spare_ball: false, layout: "45 x 4-1/2 x 35" });
    const ball = await saved("Old ball");

    const first = render(<BallFormDialog ball={ball!} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/carries the layout you typed before/)).toBeTruthy();
    save();
    await waitFor(async () => expect((await saved("Old ball"))?.layout).toBe("45 x 4-1/2 x 35"));
    first.unmount();

    render(<BallFormDialog ball={(await saved("Old ball"))!} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Add a layout/ }));
    save();

    await waitFor(async () => expect((await saved("Old ball"))?.layout_spec).toBeTruthy());
    expect((await saved("Old ball"))?.layout).toBeUndefined();
  });
});

describe("BallFormDialog catalog link", () => {
  const catalogBall = (id: string, name: string) =>
    ({
      id,
      brand: "Roto Grip",
      name,
      coverstockCategory: "Solid",
      coreType: "Asymmetric",
      rg: 2.47,
      diff: 0.05,
      mbDiff: 0.02,
      releaseYear: 2026,
      imageThumb: null,
      imageFull: null,
      productUrl: null,
      weights: [],
      colorways: []
    }) as unknown as CatalogBall;

  beforeEach(async () => {
    await db.delete();
    await db.open();
    await db.ball_catalog.bulkPut([catalogBall("gem", "Gem"), catalogBall("hustle", "Hustle")]);
  });

  async function openLinkedBall() {
    const id = await addBall({ name: "My Gem", is_spare_ball: false, weight: 15, catalog_ref_id: "gem" });
    const ball = (await getBalls()).find((b) => b.id === id)!;
    render(<BallFormDialog ball={ball} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText("Linked to catalog");
  }

  it("has no Change or Unlink buttons: the linked ball is the way into the catalog", async () => {
    await openLinkedBall();
    expect(screen.queryByRole("button", { name: /Unlink/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Change")).not.toBeInTheDocument();
  });

  it("shows the linked ball selected and first in the catalog, and lets go of it on a second tap", async () => {
    await openLinkedBall();
    fireEvent.click(screen.getByRole("button", { name: /Linked to catalog/ }));

    const rows = await screen.findAllByRole("button", { pressed: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Gem");
    // First in the list, ahead of the other ball.
    const all = screen.getAllByRole("button", { name: /Roto Grip|Gem|Hustle/ });
    expect(all.findIndex((b) => b === rows[0])).toBeLessThan(
      all.findIndex((b) => b.textContent?.includes("Hustle"))
    );

    fireEvent.click(rows[0]);
    // Back on the form, no longer linked, and nothing else about the ball moved.
    expect(await screen.findByText("Link to catalog")).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toHaveValue("My Gem");
    save();
    await waitFor(async () => expect(await saved("My Gem")).toBeTruthy());
    expect((await saved("My Gem"))?.catalog_ref_id).toBeUndefined();
  });

  it("swaps the link to another ball when that one is tapped", async () => {
    await openLinkedBall();
    fireEvent.click(screen.getByRole("button", { name: /Linked to catalog/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Hustle/ }));
    expect(await screen.findByText("Hustle", { exact: false })).toBeInTheDocument();
    save();
    await waitFor(async () => expect((await saved("My Gem"))?.catalog_ref_id).toBe("hustle"));
  });
});
