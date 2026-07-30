import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { communications, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

interface CommsContextValue {
  totalUnread: number;
  refresh: () => void;
}

const CommsContext = createContext<CommsContextValue>({
  totalUnread: 0,
  refresh: () => {},
});

const POLL_INTERVAL = 30_000;

export function CommsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [totalUnread, setTotalUnread] = useState(0);

  // Map of thread_id → unread_count from the previous poll. Null means no
  // poll has run yet; we skip notifications on the first poll so that
  // existing unread messages don't all fire at once on login.
  const prevUnreadRef = useRef<Record<string, number> | null>(null);
  const notifGrantedRef = useRef(false);

  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      notifGrantedRef.current = true;
      return;
    }
    if (Notification.permission === 'default') {
      void Notification.requestPermission().then((perm) => {
        notifGrantedRef.current = perm === 'granted';
      });
    }
  }, []);

  const poll = useCallback(async () => {
    if (!user) return;
    try {
      const { threads } = await communications.listThreads();
      const total = threads.reduce((sum, t) => sum + t.unread_count, 0);
      setTotalUnread(total);

      const prev = prevUnreadRef.current;
      if (prev !== null && notifGrantedRef.current) {
        for (const thread of threads) {
          const prevCount = prev[thread.thread_id] ?? 0;
          if (
            thread.unread_count > prevCount &&
            thread.last_message &&
            !thread.last_message.is_you
          ) {
            const n = new Notification(thread.report.title, {
              body: `${thread.last_message.sender_full_name}: ${thread.last_message.preview}`,
              icon: '/favicon.ico',
              tag: thread.thread_id,
            });
            n.onclick = () => {
              window.focus();
              window.location.href = `/communications/threads/${encodeURIComponent(thread.thread_id)}`;
            };
          }
        }
      }

      prevUnreadRef.current = Object.fromEntries(
        threads.map((t) => [t.thread_id, t.unread_count]),
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      // Silently swallow poll errors — badge will just not update.
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void poll();
    const id = setInterval(() => void poll(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [user, poll]);

  const refresh = useCallback(() => {
    void poll();
  }, [poll]);

  return (
    <CommsContext.Provider value={{ totalUnread, refresh }}>
      {children}
    </CommsContext.Provider>
  );
}

export function useComms(): CommsContextValue {
  return useContext(CommsContext);
}
