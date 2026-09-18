import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { daysLateFrom, loanState } from "@/lib/loan-cadence";
import { LoanList, type LoanRow, type LoanLender } from "./loan-list";

export const metadata = { title: "Loan updates" };

/**
 * Active loans, and who's owed an update (spec §26).
 *
 * Deliberately not a pipeline — no amounts, no stages. A row exists to answer
 * one question: does this referral partner know where their deal stands?
 */
export default async function LoansPage() {
  const supabase = await createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [{ data: loans }, { data: lenders }] = await Promise.all([
    supabase
      .from("active_loans")
      .select(
        "id, borrower_name, updates_active, last_update_sent_at, next_update_due_at, closing_outcome, sba_approval_date, approved_sba_amount, lender:lenders(id, full_name, institution:institutions(name))",
      )
      .is("deleted_at", null)
      .order("next_update_due_at", { nullsFirst: false }),
    supabase
      .from("lenders")
      .select("id, full_name, institution:institutions(name)")
      .is("deleted_at", null)
      .eq("active", true)
      .order("full_name"),
  ]);

  const rows: LoanRow[] = (loans ?? []).map((l) => {
    const lender = l.lender as unknown as {
      id: string;
      full_name: string;
      institution: { name: string } | null;
    } | null;

    const due = l.next_update_due_at ? new Date(`${l.next_update_due_at}T00:00:00`) : null;
    const daysLate = due === null ? 0 : daysLateFrom(due, today);

    return {
      id: l.id,
      borrower: l.borrower_name,
      lenderId: lender?.id ?? null,
      lenderName: lender?.full_name ?? null,
      institution: lender?.institution?.name ?? null,
      active: l.updates_active,
      closingOutcome: l.closing_outcome,
      approvedOn: l.sba_approval_date,
      approvedAmount: l.approved_sba_amount,
      lastUpdateAt: l.last_update_sent_at,
      daysLate: Math.max(0, daysLate),
      state: loanState(daysLate, l.updates_active),
    };
  });

  const lenderOptions: LoanLender[] = (lenders ?? []).map((l) => ({
    id: l.id,
    name: l.full_name,
    institution: (l.institution as unknown as { name: string } | null)?.name ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Loans"
        description="Every active loan gets a touch each week, even when nothing has changed. Approved ones move to their own tab."
      />
      <LoanList rows={rows} lenders={lenderOptions} />
    </div>
  );
}
