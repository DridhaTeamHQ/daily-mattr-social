import { Heart, MessageCircle, Play, Share2 } from "lucide-react";

import type { Enums } from "@/lib/database.types";

/**
 * The icon and fallback wording for each kind of task.
 *
 * Shared rather than local to the dashboard, because the admin preview has to
 * draw the same row from the same map — a preview that picks its own icons is
 * a preview of nothing.
 */
export const TASK_META: Record<
  Enums<"task_type">,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  like: { label: "Like the reel", icon: Heart },
  comment: { label: "Leave a comment", icon: MessageCircle },
  share: { label: "Share it", icon: Share2 },
  story: { label: "Post to your story", icon: Play },
};
