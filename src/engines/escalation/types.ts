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

export type HandoffTrigger =
  | 'human_demand'
  | 'refund_return'
  | 'defective_product'
  | 'frustration'
  | 'legal'
  | 'abuse'
  | 'repeated_failure'
  | 'low_confidence';

export interface HandoffDetection {
  triggered: boolean;
  triggers: HandoffTrigger[];
  severity: 'low' | 'medium' | 'high';
  reason: string; // Hebrew, human-readable
}

// Extended IN PLACE (no separate EscalationConfigExtended type). D4 imports/casts this name.
export interface EscalationConfig {
  enabled?: boolean;
  recipients?: EscalationRecipient[];
  dedupeMinutes?: number;
  triggers?: Partial<Record<HandoffTrigger, boolean>>; // per-trigger toggle
  lowConfidenceThreshold?: number;                     // 0..1; fires low_confidence below it
}
