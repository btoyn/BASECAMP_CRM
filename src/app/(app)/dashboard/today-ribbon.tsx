"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock, FileText, HandCoins, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconCircle, type IconCircleTone } from "@/components/ui/icon-circle";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { captureMeetingNotes } from "./actions";
import { logLoanUpdate } from "../loans/actions";

export interface RibbonData {
  notes: { id: string; title: string; when: string }[];
  promises: { count: number; worstDaysLate: number };
  loansDue: { id: string; borrower: string; detail: string; overdue: boolean }[];
}

/**
 * Today — one operational ribbon rather than three more white cards. Each cell
 * carries an icon, a count, one supporting line and exactly one action.
 */
export function TodayRibbon({ data }: { data: RibbonData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"none" | "notes" | "loans">("none");
  const [error, setError] = useState<string | null>(null);

  const noteCount = data.notes.length;
  const loanCount = data.loansDue.length;
  const promiseCount = data.promises.count;
  const allClear = noteCount === 0 && loanCount === 0 && promiseCount === 0;

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) {
        setError(result.error);
        return;
      }
      setPanel("none");
      router.refresh();
    });
  }

  if (allClear) {
    return (
      <Section>
        <div className="flex items-center gap-3.5 px-5 py-5 sm:px-6">
          <IconCircle icon={CheckCircle2} tone="teal" size="md" />
          <div>
            <p className="text-[14.5px] font-semibold">Nothing needs chasing</p>
            <p className="mt-0.5 text-[13px] text-muted">
              No overdue promises, no loan updates due, no meeting notes waiting.
            </p>
          </div>
        </div>
      </Section>
    );
  }

  const promiseTone: IconCircleTone = data.promises.worstDaysLate > 3 ? "red" : "gold";

  return (
    <Section>
      <div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {/* 1 — meeting notes */}
        <Cell
          icon={FileText}
          tone="plum"
          count={noteCount}
          label={noteCount === 1 ? "meeting note missing" : "meeting notes missing"}
          support={noteCount > 0 ? data.notes[0].when : "All captured"}
          muted={noteCount === 0}
          action={
            noteCount > 0 ? (
              <Button
                size="touch"
                variant="secondary"
                onClick={() => setPanel(panel === "notes" ? "none" : "notes")}
              >
                Capture note
              </Button>
            ) : null
          }
        />

        {/* 2 — promises */}
        <Cell
          icon={HandCoins}
          tone={promiseCount > 0 ? promiseTone : "teal"}
          count={promiseCount}
          label={promiseCount === 1 ? "promise overdue" : "promises overdue"}
          support={
            promiseCount > 0
              ? `Worst is ${data.promises.worstDaysLate} day${data.promises.worstDaysLate === 1 ? "" : "s"} late`
              : "Nothing outstanding"
          }
          muted={promiseCount === 0}
          action={
            promiseCount > 0 ? (
              <Link
                href="/follow-ups"
                className={buttonVariants({ variant: "secondary", size: "touch" })}
              >
                Review promises
              </Link>
            ) : null
          }
        />

        {/* 3 — loan updates */}
        <Cell
          icon={Clock}
          tone={loanCount > 0 ? "gold" : "teal"}
          count={loanCount}
          label={loanCount === 1 ? "loan update due" : "loan updates due"}
          support={
            loanCount > 0
              ? data.loansDue.some((l) => l.overdue)
                ? "Some are past a week"
                : "Due this week"
              : "Every loan current"
          }
          muted={loanCount === 0}
          action={
            loanCount > 0 ? (
              <Button
                size="touch"
                variant="secondary"
                onClick={() => setPanel(panel === "loans" ? "none" : "loans")}
              >
                Draft updates
              </Button>
            ) : null
          }
        />
      </div>

      {panel === "notes" && (
        <div className="border-t border-border/70 bg-plum-soft/40 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13.5px] font-semibold">
              {data.notes[0].title}
              <span className="ml-2 font-normal text-muted">{data.notes[0].when}</span>
            </p>
            <CloseButton onClick={() => setPanel("none")} />
          </div>
          <form
            className="mt-3 space-y-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              const raw = String(new FormData(e.currentTarget).get("raw") ?? "");
              run(() => captureMeetingNotes(data.notes[0].id, raw));
            }}
          >
            <Textarea
              name="raw"
              rows={3}
              autoFocus
              placeholder="What came up? Anything they promised, anything you owe them, anything personal worth remembering."
            />
            <div className="flex gap-2">
              <Button type="submit" size="touch" disabled={pending}>
                {pending ? "Saving…" : "Save note"}
              </Button>
              {noteCount > 1 && (
                <p className="self-center text-[12.5px] text-muted">
                  {noteCount - 1} more after this
                </p>
              )}
            </div>
          </form>
        </div>
      )}

      {panel === "loans" && (
        <div className="border-t border-border/70 bg-gold-soft/40 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13.5px] font-semibold">
              Log this week&apos;s touch on each loan
            </p>
            <CloseButton onClick={() => setPanel("none")} />
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {data.loansDue.map((loan) => (
              <li
                key={loan.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold">
                    {loan.borrower}
                  </span>
                  <span className="text-[12px] text-muted">{loan.detail}</span>
                </span>
                <Button
                  size="touch"
                  variant={loan.overdue ? "gold" : "secondary"}
                  disabled={pending}
                  onClick={() => run(() => logLoanUpdate(loan.id))}
                >
                  Log update
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="px-5 pb-4 text-sm text-danger sm:px-6">{error}</p>}
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section>
      <p className="eyebrow mb-2 text-navy/70">Today</p>
      <div className="overflow-hidden rounded-[20px] border border-border/80 bg-surface shadow-[0_10px_30px_rgba(16,24,40,0.05)]">
        {children}
      </div>
    </section>
  );
}

function Cell({
  icon,
  tone,
  count,
  label,
  support,
  action,
  muted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: IconCircleTone;
  count: number;
  label: string;
  support: string;
  action: React.ReactNode;
  muted: boolean;
}) {
  /* The action sits under the text rather than beside it. Three cells share one
     row from 640px up, which leaves each about 200px: "11 loan updates due"
     and a button cannot both fit on that line, and side by side the count ran
     straight under the button. Stacked, nothing collides at any width. */
  return (
    <div className="flex items-start gap-3.5 p-5 sm:p-[22px]">
      <IconCircle icon={icon} tone={tone} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5">
          <span
            className={cn(
              "text-[22px] font-bold leading-none tabular-nums",
              muted ? "text-muted" : "text-foreground",
            )}
          >
            {count}
          </span>
          <span className="min-w-0 text-[13px] font-medium text-muted">{label}</span>
        </p>
        <p className="mt-1 text-[12.5px] text-muted">{support}</p>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      title="Close"
      className="rounded-md p-1 text-muted transition-colors hover:bg-black/[0.05] hover:text-foreground"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
