import "server-only";

import type {
  CompletionLeaderboardRow,
  DashboardData,
  LeaderboardRow,
  MyAchievement,
} from "@/lib/queries";

/**
 * Fixtures for demo mode.
 *
 * Used only while no Supabase project is configured, so the UI can be built and
 * reviewed on localhost. Shapes match what the real queries return, so swapping
 * in live data is a change to `lib/queries.ts` alone — no page touches it.
 *
 * Deliberately unflattering: one rejected submission, one in review, an unused
 * survey link. Screens designed against nothing but happy paths tend to fall
 * over on the first real Tuesday.
 */

const DAY = 86_400_000;

/** Fixed clock so fixtures don't drift between renders. */
const NOW = new Date("2026-08-03T10:00:00+05:30").getTime();
const at = (daysFromNow: number) => new Date(NOW + daysFromNow * DAY).toISOString();

export const demoDashboard: DashboardData = {
  profile: {
    id: "demo-ambassador",
    full_name: "Ananya Rao",
    college: "Christ University, Bengaluru",
    referral_code: "DMTR7K9Q",
    role: "ambassador",
    status: "active",
    must_change_password: false,
  },

  standing: {
    completionPct: 75,
    approvedTasks: 6,
    totalTasks: 8,
    position: 4,
    // Out of one batch, not the programme, which is what the board ranks.
    total: 7,
    batch: "Batch A",
  },

  surveys: [
    {
      survey_id: "s1",
      survey_title: "Campus food delivery habits",
      slug: "k3m9vq",
      click_count: 84,
      valid_responses: 21,
      flagged: 1,
      points_earned: 210,
    },
    {
      survey_id: "s2",
      survey_title: "What you actually read in the morning",
      slug: "p7wn2d",
      click_count: 3,
      valid_responses: 0,
      flagged: 0,
      points_earned: 0,
    },
  ],

  campaigns: [
    {
      id: "c1",
      title: "Monsoon reel — share it everywhere",
      description:
        "Our best-performing reel this quarter. Like it, drop a genuine comment, and put it on your story.",
      platform: "Instagram",
      instagram_url: "https://www.instagram.com/reel/DEMO1/",
      expected_handle: "dailymattr",
      thumbnail_path: null,
      starts_at: at(-2),
      ends_at: at(3),
      tasks: [
        {
          id: "t1",
          type: "like",
        proof_type: "screenshot" as const,
        label: "Like the reel",
        platform: "Instagram",
          points: 10,
          instructions: "Like the reel from your own account.",
          required: true,
          submission_status: "approved",
          submission_reason: null,
        },
        {
          id: "t2",
          type: "comment",
        proof_type: "screenshot" as const,
        label: "Leave a comment",
        platform: "Instagram",
          points: 20,
          instructions: "Leave a comment that isn't just an emoji.",
          required: true,
          submission_status: "needs_review",
          submission_reason: null,
        },
        {
          id: "t3",
          type: "story",
        proof_type: "screenshot" as const,
        label: "Post to story",
        platform: "Instagram",
          points: 30,
          instructions: "Share to your story and tag @dailymattr.",
          required: false,
          submission_status: null,
          submission_reason: null,
        },
      ],
    },
    {
      id: "c2",
      title: "Founder interview clip",
      description: "Short clip from the founder Q&A. Likes and shares only.",
      platform: "Instagram",
      instagram_url: "https://www.instagram.com/reel/DEMO2/",
      expected_handle: "dailymattr",
      thumbnail_path: null,
      starts_at: at(-9),
      ends_at: at(-1), // ended — the card must still render
      tasks: [
        {
          id: "t4",
          type: "like",
        proof_type: "screenshot" as const,
        label: "Like the reel",
        platform: "Instagram",
          points: 10,
          instructions: null,
          required: true,
          submission_status: "rejected",
          submission_reason:
            "The screenshot shows a different account's profile, not @dailymattr.",
        },
        {
          id: "t5",
          type: "share",
        proof_type: "screenshot" as const,
        label: "Share it",
        platform: "Instagram",
          points: 15,
          instructions: "Send it to at least three friends.",
          required: false,
          submission_status: null,
          submission_reason: null,
        },
      ],
    },
  ],

  referrals: {
    code: "DMTR7K9Q",
    total_confirmed: 6,
    points_earned: 90,
    last_conversion: at(-2),
  },

  // Third on the install board, so the demo shows the badge rather than
  // leaving the one tile that can carry it looking like it never does.
  installRank: 3,

  streak: 4,

  notifications: [
    {
      id: "n1",
      type: "submission_approved",
      title: "Approved — you earned 10 points",
      body: "Your screenshot passed review.",
      href: "/dashboard/campaigns",
      read_at: null,
      created_at: at(-0.1),
    },
    {
      id: "n2",
      type: "campaign_live",
      title: "New campaign is live",
      body: "Monsoon reel — share it everywhere",
      href: "/dashboard/campaigns",
      read_at: null,
      created_at: at(-0.5),
    },
    {
      id: "n3",
      type: "rank_up",
      title: "You moved up to #4",
      body: "Two more people passed this week — keep going.",
      href: "/dashboard/leaderboard",
      read_at: at(-1),
      created_at: at(-1),
    },
  ],

  recentLedger: [
    {
      id: 9,
      delta: 20,
      reason: "survey_response",
      note: "Campus food delivery habits",
      created_at: at(-0.2),
    },
    {
      id: 8,
      delta: 15,
      reason: "referral",
      note: "App download confirmed",
      created_at: at(-2),
    },
    {
      id: 7,
      delta: -10,
      reason: "revoke",
      note: "Screenshot reused from another ambassador",
      created_at: at(-3),
    },
    {
      id: 6,
      delta: 10,
      reason: "instagram_task",
      note: "Monsoon reel — like",
      created_at: at(-4),
    },
    {
      id: 5,
      delta: 25,
      reason: "manual_adjust",
      note: "Campus drive bonus",
      created_at: at(-6),
    },
  ],
};

export const demoLeaderboard: LeaderboardRow[] = [
  {
    position: 1,
    ambassador_id: "a1",
    full_name: "Rohan Mehta",
    college: "VIT Vellore",
    points: 780,
    is_me: false,
  },
  {
    position: 2,
    ambassador_id: "a2",
    full_name: "Fatima Sheikh",
    college: "Jamia Millia Islamia",
    points: 615,
    is_me: false,
  },
  {
    position: 3,
    ambassador_id: "a3",
    full_name: "Karthik Iyer",
    college: "Anna University",
    points: 402,
    is_me: false,
  },
  {
    position: 4,
    ambassador_id: "demo-ambassador",
    full_name: "Ananya Rao",
    college: "Christ University, Bengaluru",
    points: 340,
    is_me: true,
  },
  {
    position: 5,
    ambassador_id: "a5",
    full_name: "Meera Nair",
    college: "Christ University, Bengaluru",
    points: 295,
    is_me: false,
  },
  {
    position: 6,
    ambassador_id: "a6",
    full_name: "Aditya Deshmukh",
    college: "Savitribai Phule Pune University",
    points: 180,
    is_me: false,
  },
  {
    position: 7,
    ambassador_id: "a7",
    full_name: "Sneha Reddy",
    college: "Osmania University",
    points: 95,
    is_me: false,
  },
];

export const demoCompletionLeaderboard: CompletionLeaderboardRow[] = [
  { position: 1, ambassador_id: "a1", full_name: "Rohan Mehta", college: "VIT Vellore", batch: "Batch A", total_tasks: 8, approved_tasks: 8, completion_pct: 100, is_me: false },
  { position: 2, ambassador_id: "a2", full_name: "Fatima Sheikh", college: "Jamia Millia Islamia", batch: "Batch A", total_tasks: 8, approved_tasks: 7, completion_pct: 88, is_me: false },
  { position: 3, ambassador_id: "a3", full_name: "Karthik Iyer", college: "Anna University", batch: "Batch A", total_tasks: 8, approved_tasks: 7, completion_pct: 88, is_me: false },
  { position: 4, ambassador_id: "demo-ambassador", full_name: "Ananya Rao", college: "Christ University, Bengaluru", batch: "Batch A", total_tasks: 8, approved_tasks: 6, completion_pct: 75, is_me: true },
  { position: 5, ambassador_id: "a5", full_name: "Meera Nair", college: "Christ University, Bengaluru", batch: "Batch A", total_tasks: 8, approved_tasks: 5, completion_pct: 63, is_me: false },
  { position: 6, ambassador_id: "a6", full_name: "Aditya Deshmukh", college: "Savitribai Phule Pune University", batch: "Batch A", total_tasks: 8, approved_tasks: 4, completion_pct: 50, is_me: false },
  { position: 7, ambassador_id: "a7", full_name: "Sneha Reddy", college: "Osmania University", batch: "Batch A", total_tasks: 8, approved_tasks: 2, completion_pct: 25, is_me: false },
];

/** Hand-written recognition, for the demo student. */
export const demoAchievements: MyAchievement[] = [
  {
    id: "ach1",
    title: "Ran the orientation stall at Christ University",
    note: "Signed up 40 students in an afternoon, in the rain.",
    awarded_at: at(-12),
  },
  {
    id: "ach2",
    title: "First to 10 survey responses this month",
    note: null,
    awarded_at: at(-4),
  },
];
