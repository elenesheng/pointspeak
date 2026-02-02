import { useState, useCallback } from 'react';
import { ReasoningLog, ReasoningLogType, ReasoningLogMetadata } from '../types/ui.types';

export const useReasoningLogs = () => {
  const [logs, setLogs] = useState<ReasoningLog[]>([]);

  const addLog = useCallback(
    (content: string, type: ReasoningLogType = 'thought', metadata?: ReasoningLogMetadata) => {
      const newLog: ReasoningLog = {
        id: Math.random().toString(36).substr(2, 9),
        type,
        content,
        timestamp: new Date(),
        metadata,
      };
      setLogs((prev) => [...prev, newLog]);
    },
    []
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs, addLog, clearLogs };
};
