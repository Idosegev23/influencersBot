'use client';

import { useState, useCallback, useRef } from 'react';

// ============================================
// Stream Event Types (matching server)
// ============================================

interface StreamMeta {
  type: 'meta';
  traceId: string;
  requestId: string;
  decisionId: string;
  sessionId: string;
  uiDirectives: Record<string, unknown>;
  stateTransition?: { from: string; to: string };
  suggestedActions?: Array<{ id: string; label: string; action: string }>;
}

interface StreamCards {
  type: 'cards';
  cardsType: 'brands' | 'products' | 'content';
  items: unknown[];
}

interface StreamDelta {
  type: 'delta';
  text: string;
}

interface StreamDone {
  type: 'done';
  responseId: string | null;
  latencyMs: number;
  tokens?: { input: number; output: number };
  fullText: string;
}

interface StreamError {
  type: 'error';
  message: string;
  code?: string;
}

type StreamEvent = StreamMeta | StreamCards | StreamDelta | StreamDone | StreamError;

// ============================================
// Hook State
// ============================================

interface StreamState {
  isStreaming: boolean;
  meta: StreamMeta | null;
  cards: StreamCards | null;
  text: string;
  done: StreamDone | null;
  error: StreamError | null;
}

interface UseStreamChatOptions {
  onMeta?: (meta: StreamMeta) => void;
  onCards?: (cards: StreamCards) => void;
  onDelta?: (delta: string, fullText: string) => void;
  onDone?: (done: StreamDone) => void;
  onError?: (error: StreamError) => void;
}

// ============================================
// Hook
// ============================================

export function useStreamChat(options: UseStreamChatOptions = {}) {
  const [state, setState] = useState<StreamState>({
    isStreaming: false,
    meta: null,
    cards: null,
    text: '',
    done: null,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (params: {
    message: string;
    username: string;
    sessionId?: string;
    previousResponseId?: string;
    clientMessageId?: string;
  }) => {
    // Cancel any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Reset state
    setState({
      isStreaming: true,
      meta: null,
      cards: null,
      text: '',
      done: null,
      error: null,
    });

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentText = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event: StreamEvent = JSON.parse(line);

            switch (event.type) {
              case 'meta':
                setState(s => ({ ...s, meta: event }));
                options.onMeta?.(event);
                break;

              case 'cards':
                setState(s => ({ ...s, cards: event }));
                options.onCards?.(event);
                break;

              case 'delta':
                currentText += event.text;
                setState(s => ({ ...s, text: currentText }));
                options.onDelta?.(event.text, currentText);
                break;

              case 'done':
                setState(s => ({ ...s, isStreaming: false, done: event }));
                options.onDone?.(event);
                break;

              case 'error':
                setState(s => ({ ...s, isStreaming: false, error: event }));
                options.onError?.(event);
                break;
            }
          } catch (parseError) {
            console.error('[StreamChat] Parse error:', parseError, 'Line:', line);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event: StreamEvent = JSON.parse(buffer);
          if (event.type === 'done') {
            setState(s => ({ ...s, isStreaming: false, done: event }));
            options.onDone?.(event);
          } else if (event.type === 'error') {
            setState(s => ({ ...s, isStreaming: false, error: event }));
            options.onError?.(event);
          }
        } catch (e) {
          // Ignore incomplete JSON
        }
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        // User cancelled - not an error
        setState(s => ({ ...s, isStreaming: false }));
        return;
      }

      const streamError: StreamError = {
        type: 'error',
        message: error.message || 'שגיאה בחיבור',
        code: 'NETWORK_ERROR',
      };
      setState(s => ({ ...s, isStreaming: false, error: streamError }));
      options.onError?.(streamError);
    }
  }, [options]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(s => ({ ...s, isStreaming: false }));
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState({
      isStreaming: false,
      meta: null,
      cards: null,
      text: '',
      done: null,
      error: null,
    });
  }, [cancel]);

  return {
    ...state,
    sendMessage,
    cancel,
    reset,
  };
}

export type { StreamMeta, StreamCards, StreamDelta, StreamDone, StreamError, StreamEvent };

