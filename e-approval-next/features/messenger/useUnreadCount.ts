"use client";

import { useEffect, useState } from "react";
import { messengerApi } from "./api";
import { POLL_UNREAD_MS } from "./constants";

/** 헤더 알림용: 안 읽은 메시지 수 (로그인했을 때만, 화면이 보일 때만 갱신) */
export function useUnreadCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let active = true;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      messengerApi
        .unreadCount()
        .then((r) => active && setCount(r.count))
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, POLL_UNREAD_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("messenger-read", onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("messenger-read", onFocus);
    };
  }, [enabled]);

  return count;
}
