export type EscalationSeverity = 'critical' | 'high';
export type EscalationTrigger = 'legal' | 'abuse' | 'human_demand' | 'sustained_anger';

export interface EscalationVerdict {
  escalate: boolean;
  severity: EscalationSeverity | null;
  reason: string; // Hebrew, human-readable
  triggers: EscalationTrigger[];
}

export interface EscalationRecipient {
  name: string;
  email?: string;
  whatsapp?: string; // E.164 / waId
}

export interface EscalationConfig {
  enabled?: boolean;
  recipients?: EscalationRecipient[];
  dedupeMinutes?: number;
}
