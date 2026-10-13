import { useEffect, useState } from 'react';
import { fetchApi } from '../services/api';

export interface ThreadMessage {
  _id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: { generationId?: string };
  createdAt: string;
}

/** Task 13: the full persisted history for a conversation (Conversation/Message — the existing architecture,
 * nothing new stored). Re-fetches whenever the conversation completes a new turn (`refreshKey` changes) so a
 * follow-up's answer joins the thread once it's durably saved, and the thread survives a page refresh because
 * it's read straight from the backend rather than kept only in local component state. */
export function useConversationThread(conversationId: string | undefined, refreshKey: unknown) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);

  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    let cancelled = false;
    fetchApi<ThreadMessage[]>(`/ai/conversations/${conversationId}/messages`)
      .then((data) => { if (!cancelled) setMessages(data); })
      .catch(() => { if (!cancelled) setMessages([]); });
    return () => { cancelled = true; };
  }, [conversationId, refreshKey]);

  return messages;
}
