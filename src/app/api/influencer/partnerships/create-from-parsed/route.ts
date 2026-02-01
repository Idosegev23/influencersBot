// Create partnership from parsed document data

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, checkPermission, isAccountOwner } from '@/lib/auth/middleware';

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { accountId, parsedData, documentIds } = body;

    if (!accountId || !parsedData) {
      return NextResponse.json(
        { error: 'accountId and parsedData are required' },
        { status: 400 }
      );
    }

    // Verify user owns this account
    const isOwner = await isAccountOwner(user, accountId);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Forbidden - not account owner' },
        { status: 403 }
      );
    }

    // Check partnership creation permission
    const canCreate = await checkPermission(user, {
      resource: 'partnerships',
      action: 'create',
    });

    if (!canCreate) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    const supabase = await createClient();

    // 1. Create Partnership
    const { data: partnership, error: partnershipError } = await supabase
      .from('partnerships')
      .insert({
        account_id: accountId,
        brand_name: parsedData.brandName || 'Unknown Brand',
        campaign_name: parsedData.campaignName || '',
        status: 'pending',
        start_date: parsedData.startDate || null,
        end_date: parsedData.endDate || null,
        total_value: parsedData.totalAmount || null,
        currency: parsedData.currency || 'ILS',
        description: parsedData.campaignGoal || '',
        notes: JSON.stringify({
          targetAudience: parsedData.targetAudience,
          keyMessages: parsedData.keyMessages,
          exclusivity: parsedData.exclusivity,
        }),
      })
      .select()
      .single();

    if (partnershipError) {
      throw partnershipError;
    }

    console.log(`[Create Partnership] Created partnership: ${partnership.id}`);

    // 2. Link documents to partnership
    if (documentIds && documentIds.length > 0) {
      await supabase
        .from('partnership_documents')
        .update({ partnership_id: partnership.id })
        .in('id', documentIds);
    }

    // 3. Create Tasks from deliverables
    const tasks: any[] = [];

    // 3.1. Add kickoff meeting task if required
    if (parsedData.kickoffMeeting?.required) {
      const kickoffTask = {
        account_id: accountId,
        partnership_id: partnership.id,
        title: 'פגישת קיקאוף - היכרות ובחינת מוצר',
        description: parsedData.kickoffMeeting.purpose || 'פגישה מקדימה לבחינת מוצר תבואות באתר הסחר והכרת הצוות',
        due_date: parsedData.startDate || null, // Schedule before start date
        status: 'pending',
        priority: 'high',
        task_type: 'meeting',
      };
      tasks.push(kickoffTask);
      console.log(`[Create Partnership] Added kickoff meeting task`);
    }

    // 3.2. Add tasks from deliverables with approval deadlines
    if (parsedData.deliverables && Array.isArray(parsedData.deliverables)) {
      for (const deliverable of parsedData.deliverables) {
        // Main deliverable task
        const deliverableTask = {
          account_id: accountId,
          partnership_id: partnership.id,
          title: `${deliverable.quantity || 1} ${deliverable.type || 'deliverable'} ב-${deliverable.platform || 'אינסטגרם'}`,
          description: deliverable.description || '',
          due_date: deliverable.dueDate || null,
          status: 'pending',
          priority: 'medium',
          task_type: 'content_creation',
        };
        tasks.push(deliverableTask);

        // If approval deadline exists, create approval task
        if (deliverable.approvalDeadline && deliverable.dueDate) {
          const approvalTask = {
            account_id: accountId,
            partnership_id: partnership.id,
            title: `אישור תוצר: ${deliverable.type}`,
            description: `העברת תוצר לאישור המותג - ${deliverable.approvalDeadline}`,
            due_date: deliverable.dueDate, // Should be adjusted to be before dueDate
            status: 'pending',
            priority: 'high',
            task_type: 'reporting',
          };
          tasks.push(approvalTask);
        }
      }
    }

    // 3.3. Add general approval task if approval process required
    if (parsedData.approvalProcess?.required && !parsedData.approvalProcess?.timeframe) {
      tasks.push({
        account_id: accountId,
        partnership_id: partnership.id,
        title: 'אישור תוצרים מהמותג',
        description: `תיאום אישור תוצרים עם ${parsedData.approvalProcess.contactForApproval || 'המותג'} - ${parsedData.approvalProcess.timeframe || '48 שעות לפני פרסום'}`,
        due_date: parsedData.startDate || null,
        status: 'pending',
        priority: 'high',
        task_type: 'general',
      });
    }

    // 3.4. Add tracking setup task if encoded links required
    if (parsedData.trackingAndMonitoring?.useEncodedLinks) {
      tasks.push({
        account_id: accountId,
        partnership_id: partnership.id,
        title: 'הגדרת לינקים מקודדים וניטור',
        description: `הגדרת מערכת מעקב ${parsedData.trackingAndMonitoring.trackingSystem || 'imai'} ולינקים מקודדים לניטור נתונים`,
        due_date: parsedData.startDate || null,
        status: 'pending',
        priority: 'high',
        task_type: 'general',
      });
    }

    // 3.5. Add tasks from brief
    if (parsedData.tasks && Array.isArray(parsedData.tasks)) {
      for (const task of parsedData.tasks) {
        tasks.push({
          account_id: accountId,
          partnership_id: partnership.id,
          title: task.title || 'Task',
          description: task.description || '',
          due_date: task.dueDate || null,
          status: 'pending',
          priority: task.priority || 'medium',
          task_type: 'general',
        });
      }
    }

    if (tasks.length > 0) {
      console.log(`[Create Partnership] Creating ${tasks.length} tasks...`);
      const { error: tasksError } = await supabase
        .from('tasks')
        .insert(tasks);

      if (tasksError) {
        console.error('[Create Partnership] Tasks error:', tasksError);
        // Don't fail the whole operation if tasks fail
      } else {
        console.log(`[Create Partnership] ✅ Created ${tasks.length} tasks successfully`);
      }
    } else {
      console.log('[Create Partnership] No tasks to create');
    }

    // 4. Create Invoices from payment milestones
    const invoices: any[] = [];

    if (parsedData.paymentMilestones && Array.isArray(parsedData.paymentMilestones)) {
      for (let i = 0; i < parsedData.paymentMilestones.length; i++) {
        const milestone = parsedData.paymentMilestones[i];
        invoices.push({
          account_id: accountId,
          partnership_id: partnership.id,
          invoice_number: `INV-${partnership.id.substring(0, 8)}-${i + 1}`,
          total_amount: milestone.amount || 0,
          due_date: milestone.dueDate || null,
          status: 'pending',
          description: milestone.trigger || `תשלום ${i + 1}`,
          items: [{
            description: milestone.trigger || `תשלום ${milestone.percentage}%`,
            amount: milestone.amount || 0,
          }],
        });
      }
    }

    if (invoices.length > 0) {
      const { error: invoicesError } = await supabase
        .from('invoices')
        .insert(invoices);

      if (invoicesError) {
        console.error('[Create Partnership] Invoices error:', invoicesError);
      } else {
        console.log(`[Create Partnership] Created ${invoices.length} invoices`);
      }
    }

    // 5. Create Calendar Events from key dates
    const calendarEvents: any[] = [];

    // Add contract expiry date
    if (parsedData.expiryDate) {
      calendarEvents.push({
        account_id: accountId,
        partnership_id: partnership.id,
        title: `תפוגת חוזה: ${parsedData.brandName}`,
        event_type: 'deadline',
        start_time: parsedData.expiryDate,
        description: 'תזכורת: החוזה פוקע היום',
      });
    }

    // Add task due dates
    for (const task of tasks) {
      if (task.due_date) {
        calendarEvents.push({
          account_id: accountId,
          partnership_id: partnership.id,
          title: task.title,
          event_type: 'deadline',
          start_time: task.due_date,
          description: task.description,
        });
      }
    }

    if (calendarEvents.length > 0) {
      const { error: eventsError } = await supabase
        .from('calendar_events')
        .insert(calendarEvents);

      if (eventsError) {
        console.error('[Create Partnership] Calendar events error:', eventsError);
      } else {
        console.log(`[Create Partnership] Created ${calendarEvents.length} calendar events`);
      }
    }

    // 6. TODO: Create notifications/follow-ups
    // This will be implemented with the notification engine

    const summary = {
      tasks: tasks.length,
      invoices: invoices.length,
      calendarEvents: calendarEvents.length,
    };

    console.log(`[Create Partnership] ✅ Partnership created successfully with ${summary.tasks} tasks, ${summary.invoices} invoices, ${summary.calendarEvents} events`);

    return NextResponse.json({
      success: true,
      partnership_id: partnership.id,
      partnership,
      summary,
      message: `שת"פ נוצר בהצלחה! נוצרו ${summary.tasks} משימות, ${summary.invoices} חשבוניות, ו-${summary.calendarEvents} אירועים.`,
    });

  } catch (error: any) {
    console.error('[Create Partnership] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create partnership' },
      { status: 500 }
    );
  }
}

