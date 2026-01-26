import { createClient } from '@/lib/supabase';

export interface NotificationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  timing_value: number | null;
  timing_unit: 'minutes' | 'hours' | 'days' | 'weeks' | null;
  channels: string[];
  template: string | null;
  is_active: boolean;
}

export interface FollowUpParams {
  account_id: string;
  user_id: string;
  rule_id: string;
  partnership_id?: string;
  task_id?: string;
  invoice_id?: string;
  title: string;
  message: string;
  scheduled_for: Date;
}

export class NotificationRuleEngine {
  private supabase: ReturnType<typeof createClient>;
  private rules: Map<string, NotificationRule> = new Map();

  constructor(supabase: ReturnType<typeof createClient>) {
    this.supabase = supabase;
  }

  /**
   * Load all active rules from database
   */
  async loadRules(): Promise<void> {
    const { data, error } = await this.supabase
      .from('notification_rules')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('Error loading notification rules:', error);
      throw error;
    }

    this.rules.clear();
    data.forEach((rule) => {
      this.rules.set(rule.trigger_type, rule as NotificationRule);
    });

    console.log(`✅ Loaded ${this.rules.size} active notification rules`);
  }

  /**
   * Evaluate rules for a task
   */
  async evaluateTaskRules(taskId: string): Promise<void> {
    const { data: task, error } = await this.supabase
      .from('tasks')
      .select('*, partnerships(*), accounts(*)')
      .eq('id', taskId)
      .single();

    if (error || !task) {
      console.error('Task not found:', taskId);
      return;
    }

    const now = new Date();
    const dueDate = task.due_date ? new Date(task.due_date) : null;

    if (!dueDate) return;

    // Check if task is overdue
    if (dueDate < now && task.status !== 'completed') {
      await this.triggerRule('task_overdue', {
        task,
        days_overdue: Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
      });
    }

    // Check upcoming deadlines
    const daysUntilDeadline = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDeadline === 3 || daysUntilDeadline === 1) {
      await this.triggerRule('task_deadline_approaching', {
        task,
        days: daysUntilDeadline,
      });
    }
  }

  /**
   * Evaluate rules for a partnership
   */
  async evaluatePartnershipRules(partnershipId: string): Promise<void> {
    const { data: partnership, error } = await this.supabase
      .from('partnerships')
      .select('*, accounts(*)')
      .eq('id', partnershipId)
      .single();

    if (error || !partnership) {
      console.error('Partnership not found:', partnershipId);
      return;
    }

    const now = new Date();
    const startDate = partnership.start_date ? new Date(partnership.start_date) : null;
    const endDate = partnership.end_date ? new Date(partnership.end_date) : null;

    // Check if partnership is starting soon
    if (startDate) {
      const daysUntilStart = Math.floor((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilStart === 7) {
        await this.triggerRule('partnership_start_soon', { partnership });
      }
    }

    // Check if partnership is ending soon
    if (endDate) {
      const daysUntilEnd = Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilEnd === 7) {
        await this.triggerRule('partnership_ending_soon', { partnership });
      }
    }
  }

  /**
   * Evaluate rules for an invoice
   */
  async evaluateInvoiceRules(invoiceId: string): Promise<void> {
    const { data: invoice, error } = await this.supabase
      .from('invoices')
      .select('*, partnerships(*), accounts(*)')
      .eq('id', invoiceId)
      .single();

    if (error || !invoice) {
      console.error('Invoice not found:', invoiceId);
      return;
    }

    const now = new Date();
    const dueDate = invoice.due_date ? new Date(invoice.due_date) : null;

    if (!dueDate) return;

    // Check if invoice is due soon
    const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDue === 3 && invoice.status === 'pending') {
      await this.triggerRule('invoice_due', {
        invoice,
        days: daysUntilDue,
      });
    }
  }

  /**
   * Trigger a specific rule
   */
  private async triggerRule(triggerType: string, context: any): Promise<void> {
    const rule = this.rules.get(triggerType);
    if (!rule) {
      console.log(`No rule found for trigger type: ${triggerType}`);
      return;
    }

    // Build message from template
    const message = this.buildMessage(rule.template || '', context);
    const title = this.buildTitle(triggerType, context);

    // Get account and user
    const accountId = context.task?.account_id || 
                      context.partnership?.account_id || 
                      context.invoice?.account_id;

    if (!accountId) {
      console.error('No account_id found in context');
      return;
    }

    // Get account owner
    const { data: account } = await this.supabase
      .from('accounts')
      .select('owner_user_id')
      .eq('id', accountId)
      .single();

    if (!account) {
      console.error('Account not found:', accountId);
      return;
    }

    // Calculate scheduled time
    const scheduledFor = this.calculateScheduledTime(rule);

    // Create follow-ups for each channel
    for (const channel of rule.channels) {
      await this.createFollowUp({
        account_id: accountId,
        user_id: account.owner_user_id,
        rule_id: rule.id,
        partnership_id: context.partnership?.id,
        task_id: context.task?.id,
        invoice_id: context.invoice?.id,
        title,
        message,
        scheduled_for: scheduledFor,
      });
    }
  }

  /**
   * Build message from template
   */
  private buildMessage(template: string, context: any): string {
    let message = template;

    // Replace placeholders
    if (context.task) {
      message = message.replace(/\{\{task_name\}\}/g, context.task.title || 'משימה');
    }
    if (context.partnership) {
      message = message.replace(/\{\{partnership_name\}\}/g, context.partnership.campaign_name || 'שת"פ');
    }
    if (context.invoice) {
      message = message.replace(/\{\{invoice_number\}\}/g, context.invoice.invoice_number || 'חשבונית');
    }
    if (context.days !== undefined) {
      message = message.replace(/\{\{days\}\}/g, context.days.toString());
    }
    if (context.days_overdue !== undefined) {
      message = message.replace(/\{\{days\}\}/g, context.days_overdue.toString());
    }

    return message;
  }

  /**
   * Build title based on trigger type
   */
  private buildTitle(triggerType: string, context: any): string {
    switch (triggerType) {
      case 'task_deadline_approaching':
        return `דדליין מתקרב: ${context.task?.title || 'משימה'}`;
      case 'task_overdue':
        return `משימה באיחור: ${context.task?.title || 'משימה'}`;
      case 'partnership_start_soon':
        return `שת"פ מתחיל בקרוב: ${context.partnership?.campaign_name || 'שת"פ'}`;
      case 'partnership_ending_soon':
        return `שת"פ מסתיים בקרוב: ${context.partnership?.campaign_name || 'שת"פ'}`;
      case 'invoice_due':
        return `חשבונית מגיעה לתאריך: ${context.invoice?.invoice_number || 'חשבונית'}`;
      case 'milestone_completed':
        return `אבן דרך הושלמה!`;
      case 'document_uploaded':
        return `מסמך חדש הועלה`;
      default:
        return 'התראה חדשה';
    }
  }

  /**
   * Calculate when notification should be sent
   */
  private calculateScheduledTime(rule: NotificationRule): Date {
    const now = new Date();

    if (!rule.timing_value || !rule.timing_unit) {
      return now; // Send immediately
    }

    const milliseconds = this.convertToMilliseconds(rule.timing_value, rule.timing_unit);
    return new Date(now.getTime() + milliseconds);
  }

  /**
   * Convert timing to milliseconds
   */
  private convertToMilliseconds(value: number, unit: string): number {
    const multipliers: Record<string, number> = {
      minutes: 60 * 1000,
      hours: 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
    };

    return value * (multipliers[unit] || 0);
  }

  /**
   * Create a follow-up notification
   */
  private async createFollowUp(params: FollowUpParams): Promise<void> {
    // Check if similar follow-up already exists (prevent duplicates)
    const { data: existing } = await this.supabase
      .from('follow_ups')
      .select('id')
      .eq('user_id', params.user_id)
      .eq('rule_id', params.rule_id)
      .eq('status', 'pending')
      .gte('scheduled_for', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Within last 24 hours
      .limit(1);

    if (existing && existing.length > 0) {
      console.log('Similar follow-up already exists, skipping...');
      return;
    }

    // Create new follow-up
    const { error } = await this.supabase
      .from('follow_ups')
      .insert({
        account_id: params.account_id,
        user_id: params.user_id,
        rule_id: params.rule_id,
        partnership_id: params.partnership_id || null,
        task_id: params.task_id || null,
        invoice_id: params.invoice_id || null,
        title: params.title,
        message: params.message,
        channel: 'in_app', // Default to in-app, cron will handle other channels
        scheduled_for: params.scheduled_for.toISOString(),
        status: 'pending',
      });

    if (error) {
      console.error('Error creating follow-up:', error);
    } else {
      console.log(`✅ Created follow-up: ${params.title}`);
    }
  }
}

export default NotificationRuleEngine;
