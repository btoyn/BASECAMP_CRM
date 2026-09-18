"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, HandCoins, Send, Sparkles, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askAssistant, startWeeklyOutreach } from "./actions";

export interface HeroChip {
  icon: "promise" | "list";
  label: string;
}

const CHIP_ICONS = {
  promise: HandCoins,
  list: Users,
} as const;

/**
 * Hero header: greeting, what today needs, and the two things you might start.
 *
 * It used to carry a coverage ring as well. That is the same figure Relationship
 * Momentum leads with a few hundred pixels below, and two copies of one number
 * is one too many — whichever you read first, you check the other to see if it
 * agrees. Coverage, loan communication and meetings all live in Momentum now;
 * this says hello and points at the work.
 *
 * The mountain photograph lives at
 * /public/images/mountain-sunrise-header.png and is cover-cropped so the peak
 * and sun sit on the right; the navy → royal-blue → transparent wash keeps the
 * left side readable. The gradient is a complete look on its own, so the hero
 * still reads correctly before the photo is added.
 */
export function HeroHeader({
  greeting,
  firstName,
  summary,
  chips,
  hasPlan,
  aiEnabled,
}: {
  greeting: string;
  firstName: string | null;
  summary: string;
  chips: HeroChip[];
  hasPlan: boolean;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startWeeklyOutreach();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      document.getElementById("this-week")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleAsk(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const question = String(new FormData(e.currentTarget).get("question") ?? "");
    setAnswer(null);
    setAssistantError(null);
    startTransition(async () => {
      const result = await askAssistant(question);
      if (result.error) setAssistantError(result.error);
      if (result.answer) setAnswer(result.answer);
    });
  }

  return (
    <section className="mb-5">
      <div className="relative overflow-hidden rounded-[24px] bg-navy shadow-[var(--shadow-hero)]">
        {/* The photograph. Served through next/image so the 2172px original is
            re-encoded and resized per device instead of shipping ~1.7MB to every
            visitor. Cover-cropped with the peak and sun held toward the right. */}
        <Image
          src="/images/mountain-sunrise-header.png"
          alt=""
          fill
          priority
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 92vw, 1120px"
          className="object-cover"
          style={{ objectPosition: "70% 12%" }}
        />

        {/* Overlay: dense navy on the left for text, royal blue through the middle,
            thinning to the right so the peak and sunlight stay visible. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(100deg, rgba(20,35,74,0.96) 0%, rgba(22,40,92,0.92) 30%, rgba(43,76,190,0.66) 56%, rgba(30,91,255,0.26) 78%, rgba(30,91,255,0.06) 100%)",
          }}
        />
        {/* A touch of warmth pulled from the sunrise, kept very low */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 84% 34%, rgba(216,168,78,0.14) 0%, rgba(216,168,78,0) 42%)",
          }}
        />

        <div className="relative flex min-h-[230px] flex-col gap-5 p-5 sm:gap-6 sm:p-7">
          {/* Greeting, summary, actions, status chips */}
          <div className="min-w-0 flex-1">
            <h1 className="text-[30px] font-bold leading-[1.08] tracking-[-0.025em] text-white sm:text-[38px] lg:text-[40px]">
              {greeting}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/85">{summary}</p>

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Button
                size="md"
                disabled={pending}
                onClick={handleStart}
                className="border border-white/10 bg-white text-primary shadow-[0_2px_10px_rgba(10,20,45,0.22)] hover:bg-white hover:text-primary-hover hover:shadow-[0_4px_14px_rgba(10,20,45,0.28)] active:bg-white/90"
              >
                {pending ? "Working…" : hasPlan ? "Continue weekly outreach" : "Start weekly outreach"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="md"
                variant="ghost"
                onClick={() => setShowAssistant((v) => !v)}
                className="border border-white/35 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 active:bg-white/25"
              >
                <Sparkles className="h-4 w-4" />
                Ask assistant
              </Button>
            </div>

            {chips.length > 0 && (
              /* One scrolling row on phones so three chips don't cost three lines. */
              <ul className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:mt-5 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
                {chips.map((chip) => {
                  const Icon = CHIP_ICONS[chip.icon];
                  return (
                    <li
                      key={chip.label}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 bg-white/[0.14] px-2.5 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm sm:px-3 sm:text-[12.5px]"
                    >
                      <Icon className="h-3.5 w-3.5 opacity-90" />
                      {chip.label}
                    </li>
                  );
                })}
              </ul>
            )}

            {error && (
              <p className="mt-3 max-w-md rounded-lg bg-white/15 px-3 py-2 text-sm text-white backdrop-blur-sm">
                {error}
              </p>
            )}
          </div>
        </div>

        {showAssistant && (
          <div className="relative border-t border-white/20 bg-[rgba(12,22,48,0.55)] px-6 py-4 backdrop-blur-md sm:px-7">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-white">
                Ask about your relationships — who to call, what&apos;s slipping, what to say.
              </p>
              <button
                onClick={() => setShowAssistant(false)}
                className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/15 hover:text-white"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {aiEnabled ? (
              <form onSubmit={handleAsk} className="mt-3 flex flex-wrap gap-2">
                <input
                  name="question"
                  required
                  placeholder="e.g. Who should I prioritize in Southern Utah this week?"
                  className="min-w-0 flex-1 rounded-xl border border-white/25 bg-white/95 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-2 focus:outline-offset-2 focus:outline-white"
                />
                <Button
                  type="submit"
                  size="md"
                  disabled={pending}
                  className="bg-white text-primary hover:bg-white hover:text-primary-hover"
                >
                  <Send className="h-4 w-4" />
                  {pending ? "Thinking…" : "Ask"}
                </Button>
              </form>
            ) : (
              <p className="mt-2 max-w-2xl text-sm text-white/85">
                Assistant drafting is off. Add an Anthropic API key in{" "}
                <Link href="/settings" className="font-medium text-white underline">
                  Settings
                </Link>{" "}
                to switch it on — everything else here works without it.
              </p>
            )}

            {assistantError && (
              <p className="mt-3 rounded-lg bg-white/15 px-3 py-2 text-sm text-white">
                {assistantError}
              </p>
            )}
            {answer && (
              <div className="mt-3 whitespace-pre-wrap rounded-xl bg-white px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm">
                {answer}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
