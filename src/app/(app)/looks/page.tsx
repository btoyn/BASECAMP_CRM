import { redirect } from "next/navigation";

/** Looks became Pipeline — same records, now on a board. */
export default function LooksRedirect() {
  redirect("/pipeline");
}
