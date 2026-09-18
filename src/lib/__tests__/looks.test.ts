import { describe, expect, it } from "vitest";
import {
  LOOK_STAGE,
  PIPELINE_COLUMNS,
  daysBetween,
  followUpDate,
  isLookOpen,
  isLookStatus,
  isPipelineColumn,
  lookState,
  lookStatusFromStage,
  lookTitle,
  readLookStatus,
  stageForStatus,
} from "../looks";

describe("isLookOpen", () => {
  it("closes only on the three closing stages", () => {
    expect(isLookOpen(LOOK_STAGE.becameLoan)).toBe(false);
    expect(isLookOpen(LOOK_STAGE.wentNowhere)).toBe(false);
    expect(isLookOpen("closed_no_handoff")).toBe(false);
  });

  it("treats the older pipeline stages as still open, not filed away", () => {
    for (const stage of [
      "initial_inquiry",
      "sources_uses_sent",
      "needs_list_sent",
      "documents_pending",
      "ready_for_preflight",
    ]) {
      expect(isLookOpen(stage)).toBe(true);
    }
  });
});

describe("lookState", () => {
  it("is scheduled while the follow-up date is still ahead", () => {
    expect(lookState(LOOK_STAGE.open, -3)).toBe("scheduled");
    expect(lookState(LOOK_STAGE.open, -1)).toBe("scheduled");
  });

  it("comes due the day it lands", () => {
    expect(lookState(LOOK_STAGE.open, 0)).toBe("due");
  });

  it("stays merely due through the first week", () => {
    expect(lookState(LOOK_STAGE.open, 1)).toBe("due");
    expect(lookState(LOOK_STAGE.open, 7)).toBe("due");
  });

  it("turns overdue on the eighth day", () => {
    expect(lookState(LOOK_STAGE.open, 8)).toBe("overdue");
  });

  it("reports the outcome once it is closed, however late it was", () => {
    expect(lookState(LOOK_STAGE.becameLoan, 40)).toBe("became_loan");
    expect(lookState(LOOK_STAGE.wentNowhere, 40)).toBe("went_nowhere");
  });
});

describe("followUpDate", () => {
  it("lands the configured number of days out", () => {
    expect(followUpDate(new Date(2026, 7, 19), 3)).toBe("2026-08-22");
  });

  it("crosses month and year boundaries", () => {
    expect(followUpDate(new Date(2026, 7, 30), 3)).toBe("2026-09-02");
    expect(followUpDate(new Date(2026, 11, 30), 3)).toBe("2027-01-02");
  });

  it("treats zero and negative intervals as today", () => {
    expect(followUpDate(new Date(2026, 7, 19), 0)).toBe("2026-08-19");
    expect(followUpDate(new Date(2026, 7, 19), -5)).toBe("2026-08-19");
  });

  it("a look logged today reads as scheduled, and is due on the interval", () => {
    const today = new Date(2026, 7, 19);
    const due = followUpDate(today, 3);
    const dueDate = new Date(`${due}T00:00:00`);
    expect(lookState(LOOK_STAGE.open, daysBetween(dueDate, today))).toBe("scheduled");
    expect(lookState(LOOK_STAGE.open, daysBetween(dueDate, new Date(2026, 7, 22)))).toBe("due");
  });
});

describe("daysBetween", () => {
  it("ignores the time of day", () => {
    const due = new Date(2026, 7, 10, 0, 0);
    expect(daysBetween(due, new Date(2026, 7, 10, 23, 59))).toBe(0);
    expect(daysBetween(due, new Date(2026, 7, 11, 0, 1))).toBe(1);
  });

  it("goes negative before the date", () => {
    expect(daysBetween(new Date(2026, 7, 20), new Date(2026, 7, 18))).toBe(-2);
  });

  it("is unaffected by a daylight-saving shift", () => {
    // US DST ends Nov 1 2026; a naive hour-based diff would report 29 or 31.
    expect(daysBetween(new Date(2026, 9, 30), new Date(2026, 10, 30))).toBe(31);
  });
});

describe("lookTitle", () => {
  it("prefers the borrower name", () => {
    expect(lookTitle({ borrowerName: "Cedar Ridge Dental", notes: "asked about 504" })).toBe(
      "Cedar Ridge Dental",
    );
  });

  it("falls back to what was asked when there is no borrower yet", () => {
    expect(lookTitle({ borrowerName: null, notes: "Asked whether a dental practice qualifies" })).toBe(
      "Asked whether a dental practice qualifies",
    );
  });

  it("trims a long question down to something list-sized", () => {
    const title = lookTitle({
      notes: "Wondered if a borrower buying a building with a tenant in half of it can still use 504",
    });
    expect(title).toBe("Wondered if a borrower buying a building with a…");
  });

  it("uses only the first line", () => {
    expect(lookTitle({ notes: "Cedar City strip mall\nWill send numbers Friday" })).toBe(
      "Cedar City strip mall",
    );
  });

  it("says so plainly when there is nothing to go on", () => {
    expect(lookTitle({})).toBe("Unnamed look");
    expect(lookTitle({ borrowerName: "  ", notes: "  " })).toBe("Unnamed look");
  });
});

describe("pipeline columns", () => {
  it("has three columns, left to right the way a look travels", () => {
    expect(PIPELINE_COLUMNS.map((c) => c.status)).toEqual([
      "new",
      "followed_up",
      "became_loan",
    ]);
  });

  it("keeps looks that went nowhere off the board", () => {
    expect(isPipelineColumn("went_nowhere")).toBe(false);
    expect(isLookStatus("went_nowhere")).toBe(true);
  });

  it("reads anything unrecognised as a new look rather than losing it", () => {
    expect(readLookStatus(null)).toBe("new");
    expect(readLookStatus("sideways")).toBe("new");
    expect(readLookStatus("became_loan")).toBe("became_loan");
  });

  it("places a look from the old stage vocabulary alone", () => {
    expect(lookStatusFromStage("initial_inquiry", 0)).toBe("new");
    expect(lookStatusFromStage("initial_inquiry", 2)).toBe("followed_up");
    // A stage from the longer deal list is still open, and still chased.
    expect(lookStatusFromStage("documents_pending", 1)).toBe("followed_up");
    expect(lookStatusFromStage("handed_off", 3)).toBe("became_loan");
    expect(lookStatusFromStage("dormant", 1)).toBe("went_nowhere");
    expect(lookStatusFromStage("closed_no_handoff", 0)).toBe("went_nowhere");
  });

  it("carries the follow-up clock with the card", () => {
    // Moving to a closed column has to close the stage too, or a look that
    // became a loan keeps asking to be chased.
    expect(stageForStatus("became_loan")).toBe(LOOK_STAGE.becameLoan);
    expect(stageForStatus("went_nowhere")).toBe(LOOK_STAGE.wentNowhere);
    expect(stageForStatus("new")).toBe(LOOK_STAGE.open);
    expect(stageForStatus("followed_up")).toBe(LOOK_STAGE.open);
    expect(isLookOpen(stageForStatus("followed_up"))).toBe(true);
  });
});
