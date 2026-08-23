"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { MessageReaction } from "@/types";

interface MessageReactionsProps {
  reactions: MessageReaction[];
  currentUserId: string | undefined;

  /**
   * Undefined means read-only.
   *
   * Revoked WhatsApp messages keep historical reactions visible,
   * but the CRM must not create/remove reactions on them.
   */
  onToggle?: (emoji: string) => void;
}

interface ReactionGroup {
  emoji: string;
  count: number;
  byCurrentUser: boolean;
}

function groupReactions(
  reactions: MessageReaction[],
  currentUserId: string | undefined,
): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();

  for (const reaction of reactions) {
    const existing = map.get(reaction.emoji);

    const isMine =
      reaction.actor_type === "agent" &&
      !!currentUserId &&
      reaction.actor_id === currentUserId;

    if (existing) {
      existing.count += 1;
      existing.byCurrentUser =
        existing.byCurrentUser || isMine;
    } else {
      map.set(reaction.emoji, {
        emoji: reaction.emoji,
        count: 1,
        byCurrentUser: isMine,
      });
    }
  }

  return [...map.values()];
}

export function MessageReactions({
  reactions,
  currentUserId,
  onToggle,
}: MessageReactionsProps) {
  const groups = useMemo(
    () =>
      groupReactions(
        reactions,
        currentUserId,
      ),
    [reactions, currentUserId],
  );

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {groups.map((group) => (
        <button
          key={group.emoji}
          type="button"
          disabled={!onToggle}
          onClick={() =>
            onToggle?.(group.emoji)
          }
          aria-pressed={group.byCurrentUser}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors",
            !onToggle &&
              "cursor-default opacity-75",
            group.byCurrentUser
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border bg-muted/80 text-foreground",
            onToggle &&
              (group.byCurrentUser
                ? "hover:bg-primary/25"
                : "hover:bg-muted"),
          )}
        >
          <span className="text-sm leading-none">
            {group.emoji}
          </span>

          {group.count > 1 && (
            <span>{group.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
