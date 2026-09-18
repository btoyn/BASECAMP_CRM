"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Mail, Plus, RotateCcw, Search, Trash2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { matchScore } from "@/lib/fuzzy";
import type { LoanState } from "@/lib/loan-cadence";
import { cn, relativeDays } from "@/lib/utils";
import { closeLoan, createLoan, deleteLoan, reopenLoan } from "./actions";
import { UpdateDraft } from "./update-draft";

export interface LoanRow {
  id: string;
  borrower: string;
  lenderId: string | null;
  lenderName: string | null;
  institution: string | null;
  active: boolean;
  closingOutcome: "sent_to_closing" | "did_not_happen" | null;
  lastUpdateAt: string | null;
  daysLate: number;
  state: LoanState;
}

export interface LoanLender {
  id: string;
  name: string;
  institution: string | null;
}

const STATE_STYLE: Record<LoanState, { dot: string; label: string; tone: string }> = {
  updated: { dot: "bg-teal", label: "Up to date", tone: "text-teal" },
  due: { dot: "bg-gold", label: "Due now", tone: "text-[#8a6215]" },
  overdue: { dot: "bg-danger", label: "Overdue", tone: "text-danger" },
  closed: { dot: "bg-[#c9cfdd]", label: "Not tracking", tone: "text-muted" },
};

const OUTCOME_LABEL: Record<"sent_to_closing" | "did_not_happen", string> = {
  sent_to_closing: "Sent to closing",
  did_not_happen: "Didn't happen",
};

export function LoanList({ rows, lenders }: { rows: LoanRow[]; lenders: LoanLender[] }) {
  const [adding, setAdding] = useState(false);

  const active = rows.filter((r) => r.active);
  const closed = rows.filter((r) => !r.active);
  const needing = active.filter((r) => r.state !== "updated").length;
  const reachedClosing = closed.filter((r) => r.closingOutcome === "sent_to_closing").length;
  const died = closed.filter((r) => r.closingOutcome === "did_not_happen").length;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px]">
              {active.length === 0 ? (
                <span className="text-muted">Nothing being tracked yet.</span>
              ) : (
                <>
                  <span className="font-semibold">
                    {active.length - needing} of {active.length}
                  </span>{" "}
                  <span className="text-muted">up to date this week</span>
                </>
              )}
            </p>
            {!adding && (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add a loan
              </Button>
            )}
          </div>

          {adding && <AddLoan lenders={lenders} onDone={() => setAdding(false)} />}

          {active.length === 0 && !adding ? (
            <EmptyState
              title="No loans being tracked"
              description="Add one and it starts asking for a weekly update. Logging that update also counts as a touch with the lender who sent it over."
              className="py-8"
            />
          ) : (
            <ul className="divide-y divide-hairline">
              {active.map((loan) => (
                <LoanItem key={loan.id} loan={loan} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {closed.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-1 text-[13px] font-semibold text-muted">
              No longer tracking ({closed.length})
              {reachedClosing > 0 && ` · ${reachedClosing} reached closing`}
              {died > 0 && ` · ${died} died`}
            </p>
            {died > 0 && (
              <p className="mb-3 text-[12.5px] text-muted">
                A deal that died still counts as a referral on the lender who sent it — the
                weekly asking stops, the credit doesn&apos;t.
              </p>
            )}
            <ul className="divide-y divide-hairline">
              {closed.map((loan) => (
                <LoanItem key={loan.id} loan={loan} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AddLoan({ lenders, onDone }: { lenders: LoanLender[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [borrower, setBorrower] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<LoanLender | null>(null);
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return lenders
      .map((l) => ({ l, score: matchScore(query, { name: l.name, institution: l.institution }) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((r) => r.l);
  }, [query, lenders]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createLoan({ borrowerName: borrower, lenderId: picked?.id ?? "" });
      if (result.error) {
        setError(result.error);
        return;
      }
      setBorrower("");
      setPicked(null);
      setQuery("");
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="mb-4 space-y-3 rounded-xl border border-border bg-background p-4">
      <div>
        <Label htmlFor="loan-borrower">Borrower</Label>
        <Input
          id="loan-borrower"
          value={borrower}
          autoFocus
          onChange={(e) => setBorrower(e.target.value)}
          placeholder="e.g. Cedar Ridge Dental"
        />
      </div>

      <div>
        <Label htmlFor="loan-lender">Who sent it over?</Label>
        {picked ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-primary/40 bg-primary-soft/50 px-3 py-2">
            <span className="flex-1 text-[14px] font-medium">{picked.name}</span>
            <button
              type="button"
              onClick={() => setPicked(null)}
              aria-label="Pick a different lender"
              className="rounded-lg p-1 text-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                id="loan-lender"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search lenders…"
                className="pl-9"
              />
            </div>
            {results.length > 0 && (
              <ul className="mt-1 overflow-hidden rounded-[10px] border border-border">
                {results.map((l) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(l)}
                      className="flex w-full items-baseline gap-2 px-3 py-2 text-left transition-colors hover:bg-primary-soft/60"
                    >
                      <span className="text-[14px] font-medium">{l.name}</span>
                      {l.institution && (
                        <span className="text-[12.5px] text-muted">{l.institution}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {error && <p className="text-[13.5px] text-danger">{error}</p>}

      <div className="flex gap-2">
        <Button size="touch" onClick={submit} disabled={pending || !borrower.trim() || !picked}>
          {pending ? "Adding…" : "Add loan"}
        </Button>
        <Button size="touch" variant="quiet" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LoanItem({ loan }: { loan: LoanRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"draft" | "handoff" | null>(null);
  const [construction, setConstruction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const style = STATE_STYLE[loan.state];

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setPanel(null);
      router.refresh();
    });
  }

  return (
    <li className="py-3.5 first:pt-0">
      <div className="flex flex-wrap items-start gap-3">
        <span
          aria-hidden="true"
          className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", style.dot)}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold">{loan.borrower}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {loan.lenderId ? (
              <Link href={`/lenders/${loan.lenderId}`} className="hover:text-foreground hover:underline">
                {loan.lenderName}
              </Link>
            ) : (
              "No lender linked"
            )}
            {loan.institution && ` · ${loan.institution}`}
          </p>
          <p className={cn("mt-1 text-[12.5px] font-medium", style.tone)}>
            {loan.closingOutcome ? OUTCOME_LABEL[loan.closingOutcome] : style.label}
            {loan.state === "overdue" && ` · ${loan.daysLate} days late`}
            {loan.lastUpdateAt
              ? ` · last update ${relativeDays(loan.lastUpdateAt)}`
              : loan.active && " · never updated"}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {loan.active ? (
            <>
              <Button
                size="sm"
                onClick={() => setPanel((p) => (p === "draft" ? null : "draft"))}
                disabled={pending}
              >
                <Mail className="h-3.5 w-3.5" /> Draft update
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPanel((p) => (p === "handoff" ? null : "handoff"))}
                disabled={pending}
                title="SBA approved — send the handoff email and stop the weekly updates"
              >
                <Check className="h-3.5 w-3.5" /> Sent to closing
              </Button>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => run(() => closeLoan(loan.id, "did_not_happen"))}
                disabled={pending}
                title="Stops the weekly updates and sends nothing. The referral still counts."
              >
                <XCircle className="h-3.5 w-3.5" /> Deal died
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => run(() => reopenLoan(loan.id))}
                disabled={pending}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Track again
              </Button>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => run(() => deleteLoan(loan.id))}
                disabled={pending}
                title="Move to Trash"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {panel === "draft" && (
        <UpdateDraft loanId={loan.id} mode="weekly" onDone={() => setPanel(null)} />
      )}

      {panel === "handoff" && (
        <>
          <label className="mt-3 flex items-center gap-2 text-[13px] font-medium">
            <input
              type="checkbox"
              checked={construction}
              onChange={(e) => setConstruction(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Construction involved
          </label>
          <UpdateDraft
            loanId={loan.id}
            mode="handoff"
            construction={construction}
            onDone={() => setPanel(null)}
          />
        </>
      )}

      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
    </li>
  );
}
