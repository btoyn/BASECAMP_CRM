"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { normalizeName } from "@/lib/utils";
import { isTier } from "@/lib/tiers";

export interface DuplicateCandidate {
  id: string;
  full_name: string;
  email: string | null;
  institution_name: string | null;
}

/** Find or create an institution by name for the current user. */
async function findOrCreateInstitution(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  name: string,
  territory?: string,
): Promise<string> {
  const normalized = normalizeName(name);
  const { data: existing } = await supabase
    .from("institutions")
    .select("id")
    .eq("normalized_name", normalized)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("institutions")
    .insert({
      user_id: userId,
      name: name.trim(),
      normalized_name: normalized,
      territory: territory || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Couldn't create institution: ${error.message}`);
  return created.id;
}

export interface CreateLenderInput {
  firstName: string;
  lastName: string;
  institutionName: string;
  email?: string;
  mobilePhone?: string;
  city?: string;
  territory?: string;
  title?: string;
  notes?: string;
  interests?: string;
  followUp: "next_week" | "in_30_days" | "before_next_trip" | "custom" | "skip";
  followUpDate?: string;
  /** Set once the user has reviewed duplicate warnings. */
  ignoreDuplicates?: boolean;
}

export type CreateLenderResult =
  | { status: "duplicates"; candidates: DuplicateCandidate[] }
  | { status: "error"; message: string };

export async function createLender(input: CreateLenderInput): Promise<CreateLenderResult | never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not signed in." };

  if (!input.firstName.trim() || !input.institutionName.trim()) {
    return { status: "error", message: "Name and institution are required." };
  }

  // Duplicate check (§13): by name and by email.
  if (!input.ignoreDuplicates) {
    const fullName = `${input.firstName} ${input.lastName}`.trim();
    const checks = [
      supabase
        .from("lenders")
        .select("id, full_name, email, institution:institutions(name)")
        .is("deleted_at", null)
        .ilike("full_name", `%${fullName}%`)
        .limit(5),
    ];
    if (input.email?.trim()) {
      checks.push(
        supabase
          .from("lenders")
          .select("id, full_name, email, institution:institutions(name)")
          .is("deleted_at", null)
          .eq("email", input.email.trim().toLowerCase())
          .limit(5),
      );
    }
    const results = await Promise.all(checks);
    const seen = new Map<string, DuplicateCandidate>();
    for (const r of results) {
      for (const row of r.data ?? []) {
        const inst = row.institution as unknown as { name: string } | null;
        seen.set(row.id, {
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          institution_name: inst?.name ?? null,
        });
      }
    }
    if (seen.size > 0) {
      return { status: "duplicates", candidates: [...seen.values()] };
    }
  }

  const institutionId = await findOrCreateInstitution(
    supabase,
    user.id,
    input.institutionName,
    input.territory,
  );

  // Follow-up timing (§13): default 30 days when skipped.
  const followUpDate = (() => {
    const d = new Date();
    switch (input.followUp) {
      case "next_week":
        d.setDate(d.getDate() + 7);
        return d;
      case "custom":
        return input.followUpDate ? new Date(input.followUpDate) : null;
      case "before_next_trip":
        return null; // linked when a trip is planned; surfaced via enrichment queue
      case "in_30_days":
      case "skip":
      default:
        d.setDate(d.getDate() + 30);
        return d;
    }
  })();

  const needsEnrichment = !input.email?.trim() || !input.territory?.trim();

  const { data: lender, error } = await supabase
    .from("lenders")
    .insert({
      user_id: user.id,
      institution_id: institutionId,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      mobile_phone: input.mobilePhone?.trim() || null,
      city: input.city?.trim() || null,
      territory: input.territory || null,
      title: input.title?.trim() || null,
      notes: input.notes?.trim() || null,
      needs_enrichment: needsEnrichment,
      next_follow_up_at: followUpDate?.toISOString().slice(0, 10) ?? null,
    })
    .select("id")
    .single();

  if (error) return { status: "error", message: error.message };

  // Current-institution history row
  await supabase.from("lender_institution_history").insert({
    user_id: user.id,
    lender_id: lender.id,
    institution_id: institutionId,
    title: input.title?.trim() || null,
    start_date: new Date().toISOString().slice(0, 10),
    is_current: true,
  });

  if (input.interests?.trim()) {
    await supabase.from("lender_personal_details").insert({
      user_id: user.id,
      lender_id: lender.id,
      category: "other",
      detail: input.interests.trim(),
    });
  }

  // Follow-up task so the new lender doesn't disappear (§13)
  if (followUpDate) {
    await supabase.from("tasks").insert({
      user_id: user.id,
      lender_id: lender.id,
      task_type: "follow_up",
      title: `Reach out to ${input.firstName.trim()} — new contact`,
      due_at: followUpDate.toISOString(),
      source: "system",
    });
  }

  await logAudit(supabase, user.id, {
    entityType: "lender",
    entityId: lender.id,
    action: "create",
    newValue: { name: `${input.firstName} ${input.lastName}`.trim() },
  });

  revalidatePath("/spheres", "layout");
  redirect(`/lenders/${lender.id}`);
}

/**
 * Sets a lender's tier.
 *
 * Its own action rather than a call to `updateLender` because the tier decides
 * how often this person is chased — it is worth checking the value is one of
 * the four rather than writing whatever arrives. Marks the tier as
 * hand-picked, so nothing later decides it knows better.
 */
export async function setLenderTier(
  lenderId: string,
  tier: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!isTier(tier)) return { error: "That isn't a tier." };

  const { data: before } = await supabase
    .from("lenders")
    .select("relationship_tier")
    .eq("id", lenderId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!before) return { error: "Lender not found." };

  const { error } = await supabase
    .from("lenders")
    .update({ relationship_tier: tier, manual_tier_override: true })
    .eq("id", lenderId);
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, {
    entityType: "lender",
    entityId: lenderId,
    action: "update",
    previousValue: { relationship_tier: before.relationship_tier },
    newValue: { relationship_tier: tier },
    undoAvailable: true,
  });

  // The tier changes how often they're due, so every count that reads coverage
  // moves with it.
  revalidatePath(`/lenders/${lenderId}`);
  revalidatePath("/spheres", "layout");
  revalidatePath("/dashboard");
  return {};
}

export async function updateLender(
  lenderId: string,
  fields: Record<string, string | boolean | null>,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: before } = await supabase
    .from("lenders")
    .select("*")
    .eq("id", lenderId)
    .single();

  const { error } = await supabase.from("lenders").update(fields).eq("id", lenderId);
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, {
    entityType: "lender",
    entityId: lenderId,
    action: "update",
    previousValue: before ? Object.fromEntries(Object.keys(fields).map((k) => [k, before[k]])) : null,
    newValue: fields,
    undoAvailable: true,
  });

  revalidatePath(`/lenders/${lenderId}`);
  revalidatePath("/spheres", "layout");
  return {};
}

export async function softDeleteLender(lenderId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("lenders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", lenderId);

  await logAudit(supabase, user.id, {
    entityType: "lender",
    entityId: lenderId,
    action: "soft_delete",
    undoAvailable: true,
  });

  revalidatePath("/spheres", "layout");
  redirect("/spheres");
}

export async function changeLenderInstitution(
  lenderId: string,
  newInstitutionName: string,
  newTitle?: string,
): Promise<{ error?: string; formerInstitution?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: lender } = await supabase
    .from("lenders")
    .select("institution:institutions(name)")
    .eq("id", lenderId)
    .single();

  const institutionId = await findOrCreateInstitution(supabase, user.id, newInstitutionName);

  const { error } = await supabase.rpc("change_lender_institution", {
    p_lender_id: lenderId,
    p_new_institution_id: institutionId,
    p_new_title: newTitle || null,
  });
  if (error) return { error: error.message };

  await logAudit(supabase, user.id, {
    entityType: "lender",
    entityId: lenderId,
    action: "update",
    newValue: { institution: newInstitutionName },
  });

  revalidatePath(`/lenders/${lenderId}`);
  const former = (lender?.institution as unknown as { name: string } | null)?.name;
  // §12: the former institution may need a replacement contact — surfaced by the UI.
  return { formerInstitution: former };
}

export async function addPersonalDetail(
  lenderId: string,
  category: string,
  detail: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!detail.trim()) return { error: "Detail is required." };

  const { error } = await supabase.from("lender_personal_details").insert({
    user_id: user.id,
    lender_id: lenderId,
    category,
    detail: detail.trim(),
  });
  if (error) return { error: error.message };
  revalidatePath(`/lenders/${lenderId}`);
  return {};
}

export async function removePersonalDetail(detailId: string, lenderId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("lender_personal_details")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", detailId);
  revalidatePath(`/lenders/${lenderId}`);
}
