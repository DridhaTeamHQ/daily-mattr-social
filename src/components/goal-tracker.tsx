import { CalendarClock, Rocket, TrendingUp } from "lucide-react";

import { Card, CardBody } from "@/components/ui/card";
import { Note } from "@/components/ui/feedback";
import type { FunnelStage, GoalTracking } from "@/lib/admin/growth";
import { cn, formatNumber } from "@/lib/utils";

/**
 * The 10,000-download goal, as a rate rather than a total.
 *
 * A running count cannot answer the only question that matters — are we going
 * to get there — so the headline pairs the total with a trailing velocity and
 * the date that velocity implies. When velocity is zero the date is shown as
 * unknown rather than as "never": a projection built on no movement is not a
 * projection, and printing a far-future date would be false precision.
 */
export function GoalTracker({ goal }: { goal: GoalTracking }) {
  const stalled = goal.velocity7 <= 0;
  const accelerating = goal.velocity7 > goal.velocityWindow;

  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-bold tracking-wide text-ink-faint uppercase">
              Downloads towards the goal
            </p>
            <p className="display mt-1 text-[34px] leading-none text-ink">
              {formatNumber(goal.total)}
              <span className="text-[20px] text-ink-faint">
                {" "}
                / {formatNumber(goal.goal)}
              </span>
            </p>
          </div>

          <div className="text-right">
            <p className="display text-[26px] leading-none text-brand">
              {goal.pct}%
            </p>
            <p className="text-[12px] font-semibold text-ink-soft">
              {formatNumber(goal.remaining)} to go
            </p>
          </div>
        </div>

        {/* Deliberately not the shared ProgressBar: this one is the page's
            headline and carries a marker for where a straight line to target
            would put us. */}
        <div className="mt-4 h-4 w-full overflow-hidden rounded-full border border-gray-200 bg-gray-100">
          <div
            className="h-full rounded-full bg-brand transition-[width]"
            style={{ width: `${Math.max(goal.pct, goal.total > 0 ? 1 : 0)}%` }}
            role="progressbar"
            aria-valuenow={goal.total}
            aria-valuemin={0}
            aria-valuemax={goal.goal}
            aria-label="Downloads towards the goal"
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric
            icon={TrendingUp}
            label="Velocity"
            value={`${goal.velocity7}/day`}
            sub={`${goal.windowDays}-day average ${goal.velocityWindow}`}
            tone={accelerating ? "up" : "flat"}
          />
          <Metric
            icon={CalendarClock}
            label="Projected finish"
            value={goal.projectedDate ?? "Unknown"}
            sub={
              goal.daysRemaining === null
                ? "No movement in the last 7 days"
                : `About ${formatNumber(goal.daysRemaining)} days`
            }
            tone={stalled ? "down" : "flat"}
          />
          {/* Measured against a fixed six-month horizon, NOT against the
              projection. Dividing the remainder by the projected days just
              returns the current velocity — a tautology dressed as a target.
              A fixed horizon gives a rate that can actually be missed. */}
          <Metric
            icon={Rocket}
            label="Needed per day"
            value={`${formatNumber(Math.ceil(goal.remaining / 180))}/day`}
            sub="To finish within 6 months"
            tone={goal.velocity7 >= goal.remaining / 180 ? "up" : "down"}
          />
        </div>

        {stalled && goal.remaining > 0 && (
          <Note
            tone="warn"
            title="Nothing in the last seven days"
            className="mt-4"
          >
            With no downloads this week there is no rate to project from. The
            number above is missing, not zero.
          </Note>
        )}
      </CardBody>
    </Card>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: "up" | "down" | "flat";
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex items-center gap-1.5">
        <Icon
          className={cn(
            "size-3.5",
            tone === "up"
              ? "text-ok"
              : tone === "down"
                ? "text-bad"
                : "text-ink-faint",
          )}
        />
        <span className="text-[11px] font-bold tracking-wide text-ink-faint uppercase">
          {label}
        </span>
      </div>
      <p className="mt-1 text-[17px] font-extrabold text-ink">{value}</p>
      <p className="text-[11.5px] font-semibold text-ink-soft">{sub}</p>
    </div>
  );
}

/**
 * The referral funnel.
 *
 * Bar widths are relative to the widest stage, so the shape reads as a funnel.
 * The percentage beside each row is against the stage ABOVE it, which is the
 * number you act on — a 90% install-to-onboard rate and a 10% one need
 * completely different responses.
 */
export function Funnel({ stages }: { stages: FunnelStage[] }) {
  // Scaled against the WIDEST stage, not the first. Click tracking started
  // after downloads had already been recorded by hand, so the top stage is
  // legitimately smaller than the one below it — and dividing by it would
  // collapse every bar to nothing or push them past 100%.
  const widest = Math.max(1, ...stages.map((s) => s.value));

  const clicks = stages[0]?.value ?? 0;
  const installs = stages[1]?.value ?? 0;
  const clicksLagging = clicks < installs;

  return (
    <>
      {clicksLagging && (
        <p className="mb-3 text-[12px] font-semibold text-ink-soft">
          Fewer clicks than installs, because link tracking started after
          downloads were first recorded. The click-to-install rate only becomes
          meaningful once every download has come through a{" "}
          <code className="rounded bg-gray-100 px-1">/r/</code> link.
        </p>
      )}

      <ol className="space-y-2.5">
        {stages.map((stage) => {
          const width =
            stage.value > 0 ? Math.max(2, (stage.value / widest) * 100) : 0;
          const bad = stage.dropOff !== null && stage.dropOff > 0.6;

          return (
            <li key={stage.label}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-bold text-ink">
                  {stage.label}
                </span>
                <span className="tabular text-[12.5px] font-extrabold text-ink">
                  {formatNumber(stage.value)}
                  {stage.conversion !== null && (
                    <span
                      className={cn(
                        "ml-2 font-bold",
                        bad ? "text-bad" : "text-ink-soft",
                      )}
                    >
                      {Math.round(stage.conversion * 100)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={cn(
                    "h-full rounded-full",
                    bad ? "bg-bad" : "bg-brand",
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
