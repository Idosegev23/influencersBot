// Create partnership from parsed document data

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, parsedData, documentIds } = body;

    if (!accountId || !parsedData) {
      return NextResponse.json(
        { error: 'accountId and parsedData are required' },
        { status: 400 }
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

    if (parsedData.deliverables && Array.isArray(parsedData.deliverables)) {
      for (const deliverable of parsedData.deliverables) {
        tasks.push({
          account_id: accountId,
          partnership_id: partnership.id,
          title: `${deliverable.quantity || 1} ${deliverable.type || 'deliverable'} ב-${deliverable.platform || ''}`,
          description: deliverable.description || '',
          due_date: deliverable.dueDate || null,
          status: 'pending',
          priority: 'medium',
          task_type: 'content_creation',
        });
      }
    }

    // Add tasks from brief
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
      const { error: tasksError } = await supabase
        .from('tasks')
        .insert(tasks);

      if (tasksError) {
        console.error('[Create Partnership] Tasks error:', tasksError);
      } else {
        console.log(`[Create Partnership] Created ${tasks.length} tasks`);
      }
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

    return NextResponse.json({
      success: true,
      partnership,
      summary: {
        tasks: tasks.length,
        invoices: invoices.length,
        calendarEvents: calendarEvents.length,
      },
      message: 'שת"פ נוצר בהצלחה! 🎉',
    });

  } catch (error: any) {
    console.error('[Create Partnership] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create partnership' },
      { status: 500 }
    );
  }
}

