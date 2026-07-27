import { Suspense } from "react";
import { ChatPageClient } from "./ChatPageClient";

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex h-[100dvh] items-center justify-center bg-primary-light text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          正在加载聊天页面...
        </div>
      }
    >
      <ChatPageClient />
    </Suspense>
  );
}
