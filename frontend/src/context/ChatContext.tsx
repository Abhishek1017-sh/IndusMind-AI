"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";

import {
  sendChatMessage,
  type ChatResponse,
  type Citation,
  type AgentLogStep,
  type TimelineEvent,
} from "@/lib/api";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;

  citations?: Citation[];
  agentLogs?: AgentLogStep[];
  confidenceScore?: number;
  reasoningSteps?: string[];
  evidenceBase?: string[];
  timeline?: TimelineEvent[];

  loading?: boolean;
}

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! I am your **AI Knowledge Assistant**.\n\n" +
    "I answer questions using only the documents you've uploaded, with full source citations.\n\n" +
    "Upload documents from the **Documents** page and ask me anything.",
};

interface ChatContextType {
  messages: Message[];
  isLoading: boolean;

  sendMessage: (text: string) => Promise<void>;

  clearChat: () => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [messages, setMessages] = useState<Message[]>([
    WELCOME_MESSAGE,
  ]);

  const [isLoading, setIsLoading] = useState(false);

  const sendMessage = useCallback(
    async (text: string) => {
      const query = text.trim();

      if (!query || isLoading) return;

      setIsLoading(true);

      const userId = crypto.randomUUID();
      const assistantId = crypto.randomUUID();

      const userMessage: Message = {
        id: userId,
        role: "user",
        content: query,
      };

      const placeholder: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        loading: true,
      };

      setMessages((prev) => [
        ...prev,
        userMessage,
        placeholder,
      ]);

      try {
        const response: ChatResponse = await sendChatMessage(query);

        setMessages((prev) =>
          prev.map((message) => {
            if (message.id !== assistantId) return message;

            return {
              id: assistantId,
              role: "assistant",
              content: response.response,

              citations: response.citations,
              agentLogs: response.agent_logs,

              confidenceScore: response.confidence_score,
              reasoningSteps: response.reasoning_steps,
              evidenceBase: response.evidence_base,

              timeline: response.timeline,

              loading: false,
            };
          })
        );
      } catch (error) {
        console.error(error);

        setMessages((prev) =>
          prev.map((message) => {
            if (message.id !== assistantId) return message;

            return {
              ...message,
              loading: false,
              content:
                "⚠️ Unable to connect to the backend.\n\nPlease make sure the FastAPI server is running.",
            };
          })
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading]
  );

  const clearChat = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
  }, []);

  const value = useMemo(
    () => ({
      messages,
      isLoading,
      sendMessage,
      clearChat,
    }),
    [messages, isLoading, sendMessage, clearChat]
  );

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error(
      "useChat must be used inside ChatProvider."
    );
  }

  return context;
}