"use client";

import {
  useState,
  type ReactNode,
} from "react";
import {
  CornerUpLeft,
  Copy,
  SmilePlus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Message } from "@/types";
import { useTranslations } from "next-intl";

const QUICK_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
];

interface MessageActionsProps {
  message: Message;
  onReply: () => void;
  onReact: (emoji: string) => void;
  children: ReactNode;
}

/**
 * Hover/long-press toolbar wrapper around a MessageBubble.
 *
 * Revoked WhatsApp messages are historical records in the CRM:
 * their text/media can still be viewed and copied, but new reply
 * and reaction actions are intentionally unavailable.
 */
export function MessageActions({
  message,
  onReply,
  onReact,
  children,
}: MessageActionsProps) {
  const t = useTranslations("Inbox.actions");

  const [touchOpen, setTouchOpen] =
    useState(false);

  const [pickerOpen, setPickerOpen] =
    useState(false);

  const isAgent =
    message.sender_type === "agent" ||
    message.sender_type === "bot";

  const isRevoked =
    !!message.revoked_at;

  const handleContextMenu = (
    event: React.MouseEvent,
  ) => {
    event.preventDefault();
    setTouchOpen(true);
  };

  const handleCopy = async () => {
    const text =
      message.content_text ?? "";

    if (!text) {
      toast.error(t("nothingToCopy"));
      return;
    }

    try {
      await navigator.clipboard.writeText(
        text,
      );

      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }

    setTouchOpen(false);
  };

  const handlePickEmoji = (
    emoji: string,
  ) => {
    if (isRevoked) {
      return;
    }

    onReact(emoji);
    setPickerOpen(false);
    setTouchOpen(false);
  };

  const handleReply = () => {
    if (isRevoked) {
      return;
    }

    onReply();
    setTouchOpen(false);
  };

  return (
    <div
      className={cn(
        "flex w-full",
        isAgent
          ? "justify-end"
          : "justify-start",
      )}
      onContextMenu={handleContextMenu}
      onBlur={() =>
        setTouchOpen(false)
      }
    >
      <div className="group/actions relative min-w-0 max-w-[75%]">
        {children}

        <div
          data-touch-open={
            touchOpen || pickerOpen
              ? "true"
              : undefined
          }
          className={cn(
            "absolute -top-3 z-10 flex h-7 items-center gap-0.5 rounded-full border border-border bg-popover/95 px-1 shadow-md backdrop-blur-sm transition-opacity",
            "opacity-0 group-hover/actions:opacity-100 group-focus-within/actions:opacity-100",
            "data-[touch-open=true]:opacity-100",
            isAgent
              ? "right-3"
              : "left-3",
          )}
        >
          {!isRevoked && (
            <>
              <Popover
                open={pickerOpen}
                onOpenChange={setPickerOpen}
              >
                <PopoverTrigger
                  className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("react")}
                >
                  <SmilePlus className="h-3.5 w-3.5" />
                </PopoverTrigger>

                <PopoverContent
                  className="flex w-auto flex-row gap-1 p-1.5"
                  sideOffset={6}
                >
                  {QUICK_EMOJIS.map(
                    (emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() =>
                          handlePickEmoji(
                            emoji,
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition-transform hover:scale-125 hover:bg-muted"
                        aria-label={t(
                          "reactWith",
                          { emoji },
                        )}
                      >
                        {emoji}
                      </button>
                    ),
                  )}
                </PopoverContent>
              </Popover>

              <button
                type="button"
                onClick={handleReply}
                className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("reply")}
              >
                <CornerUpLeft className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("copyText")}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
