"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type {
  Message,
  MessageReaction,
  MessageEditHistoryItem,
} from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  MapPin,
  LayoutTemplate,
  CornerDownLeft,
  Sparkles,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import {
  MediaAudioBubble,
  MediaDocumentBubble,
  MediaImageBubble,
  MediaUnavailable,
  MediaVideoBubble,
} from "./message-media";
import { InteractivePreview } from "@/components/interactive/interactive-preview";
import { useTranslations } from "next-intl";

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  editHistory?: MessageEditHistoryItem[];
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
  /**
   * Opens the thread's media viewer on this message. Only images and videos
   * call it; omitted when the parent renders no viewer, in which case media
   * stays inline and non-clickable.
   */
  onOpenMedia?: (messageId: string) => void;
}

function StatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sending":
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "sent":
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-400" />;
    case "failed":
      return <XCircle className="h-3 w-3 text-red-400" />;
    default:
      return null;
  }
}

function MessageContent({
  message,
  t,
  isAgent,
  onOpenMedia,
}: {
  message: Message;
  t: ReturnType<typeof useTranslations>;
  /** Outbound bubbles sit on the primary fill — badges must invert. */
  isAgent: boolean;
  onOpenMedia?: (messageId: string) => void;
}) {
  const openMedia = onOpenMedia
    ? () => onOpenMedia(message.id)
    : undefined;

  switch (message.content_type) {
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text}
        </p>
      );

    case "image":
      return (
        <div>
          {message.media_url ? (
            <MediaImageBubble
              message={message}
              onOpen={openMedia}
              t={t}
            />
          ) : (
            <MediaUnavailable label={t("photo")} t={t} />
          )}

          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "video":
      return (
        <div>
          {message.media_url ? (
            <MediaVideoBubble
              message={message}
              onOpen={openMedia}
              t={t}
            />
          ) : (
            <MediaUnavailable label={t("video")} t={t} />
          )}

          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "audio":
      return (
        <div>
          {message.media_url ? (
            <MediaAudioBubble message={message} t={t} />
          ) : (
            <MediaUnavailable label={t("audio")} t={t} />
          )}
        </div>
      );

    case "document":
      if (!message.media_url) {
        return (
          <MediaUnavailable
            label={message.content_text || t("document")}
            t={t}
          />
        );
      }

      return (
        <MediaDocumentBubble
          message={message}
          t={t}
        />
      );

    case "template":
      return (
        <div>
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
              isAgent
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary/20 text-primary",
            )}
          >
            <LayoutTemplate className="h-3 w-3" />
            {t("template")}
          </span>

          {message.content_text ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          ) : (
            message.template_name && (
              <p className="mt-1 break-words text-sm italic opacity-80">
                {message.template_name}
              </p>
            )
          )}
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            {message.content_text || t("locationShared")}
          </span>
        </div>
      );

    case "interactive": {
      if (message.interactive_payload) {
        return (
          <InteractivePreview
            payload={message.interactive_payload}
          />
        );
      }

      if (message.sender_type === "customer") {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <CornerDownLeft className="h-3 w-3" />
              {t("buttonReply")}
            </span>

            <p className="whitespace-pre-wrap break-words text-sm">
              {message.content_text || t("interactiveReply")}
            </p>
          </div>
        );
      }

      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || t("interactiveReply")}
        </p>
      );
    }

    default:
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || t("unsupported")}
        </p>
      );
  }
}

export function MessageBubble({
  message,
  reply,
  editHistory = [],
  reactions,
  currentUserId,
  onToggleReaction,
  onOpenMedia,
}: MessageBubbleProps) {
  const t = useTranslations("Inbox.bubble");
  const [historyOpen, setHistoryOpen] = useState(false);

  const isAgent =
    message.sender_type === "agent" ||
    message.sender_type === "bot";

  const time = format(
    new Date(message.created_at),
    "HH:mm",
  );

  const editCount = editHistory.length;

  const originalContent =
    editHistory[0]?.previous_content_text ?? null;

  /*
   * A -> B -> C
   *
   * Original box: A
   * Expanded intermediate history: B
   * Normal MessageContent: C
   *
   * The final transition is not rendered separately because
   * messages.content_text already contains the current version.
   */
  const intermediateEdits =
    editHistory.length > 1
      ? editHistory.slice(0, -1)
      : [];

  return (
    <div
      className={cn(
        "flex flex-col",
        isAgent ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "relative rounded-2xl px-3 py-2",
          isAgent
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}

        {editCount > 0 && (
          <div
            className={cn(
              "mb-2 rounded-lg border px-2.5 py-2",
              isAgent
                ? "border-primary-foreground/20 bg-primary-foreground/10"
                : "border-border bg-background/50",
            )}
          >
            <div
              className={cn(
                "mb-1 text-[10px] font-semibold uppercase tracking-wide",
                isAgent
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground",
              )}
            >
              {t("originalVersion")}
            </div>

            <p className="whitespace-pre-wrap break-words text-xs opacity-80">
              {originalContent ||
                t("emptyEditedContent")}
            </p>
          </div>
        )}

        {historyOpen &&
          intermediateEdits.length > 0 && (
            <div className="mb-2 space-y-2">
              {intermediateEdits.map(
                (edit, index) => (
                  <div
                    key={`${edit.edited_at}-${index}`}
                    className={cn(
                      "rounded-lg border px-2.5 py-2",
                      isAgent
                        ? "border-primary-foreground/20 bg-primary-foreground/10"
                        : "border-border bg-background/50",
                    )}
                  >
                    <div
                      className={cn(
                        "mb-1 text-[10px] font-medium",
                        isAgent
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {t("editedAt", {
                        time: format(
                          new Date(edit.edited_at),
                          "HH:mm",
                        ),
                      })}
                    </div>

                    <p className="whitespace-pre-wrap break-words text-xs opacity-80">
                      {edit.new_content_text ||
                        t("emptyEditedContent")}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}

        <MessageContent
          message={message}
          t={t}
          isAgent={isAgent}
          onOpenMedia={onOpenMedia}
        />

        {editCount > 1 && (
          <button
            type="button"
            onClick={() =>
              setHistoryOpen((open) => !open)
            }
            className={cn(
              "mt-2 inline-flex items-center gap-1 text-[10px] font-medium underline-offset-2 hover:underline",
              isAgent
                ? "text-primary-foreground/75"
                : "text-muted-foreground",
            )}
          >
            {historyOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}

            {historyOpen
              ? t("hideEditHistory")
              : t("showEditHistory", {
                  count: intermediateEdits.length,
                })}
          </button>
        )}

        {message.revoked_at && (
          <div
            className={cn(
              "mt-2 flex items-center gap-1 border-t pt-1.5 text-[10px] font-medium",
              isAgent
                ? "border-primary-foreground/20 text-primary-foreground/75"
                : "border-border text-muted-foreground",
            )}
          >
            <Trash2 className="h-3 w-3 shrink-0" />

            <span>
              {t("deletedInWhatsApp", {
                time: format(
                  new Date(message.revoked_at),
                  "HH:mm",
                ),
              })}
            </span>
          </div>
        )}

        <div
          className={cn(
            "mt-1 flex items-center gap-1",
            isAgent
              ? "justify-end"
              : "justify-start",
          )}
        >
          {message.ai_generated && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full bg-primary-foreground/20 px-1.5 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-primary-foreground"
              title={t("aiBadgeTitle")}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {t("aiBadge")}
            </span>
          )}

          {message.edited_at && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[10px]",
                isAgent
                  ? "text-primary-foreground/70"
                  : "text-muted-foreground",
              )}
            >
              <Pencil className="h-2.5 w-2.5" />

              {editCount > 1
                ? t("editCount", {
                    count: editCount,
                  })
                : t("edited")}
            </span>
          )}

          <span
            className={cn(
              "text-[10px]",
              isAgent
                ? "text-primary-foreground/70"
                : "text-muted-foreground",
            )}
          >
            {time}
          </span>

          {isAgent && (
            <StatusIcon status={message.status} />
          )}
        </div>
      </div>

      {reactions && reactions.length > 0 && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={
            message.revoked_at
              ? undefined
              : onToggleReaction
          }
        />
      )}
    </div>
  );
}
