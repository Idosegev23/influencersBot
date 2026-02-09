import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Add a brand
export async function POST(req: NextRequest) {
  try {
    const { accountId, brand } = await req.json();

    if (!accountId || !brand) {
      return NextResponse.json(
        { error: 'Missing accountId or brand' },
        { status: 400 }
      );
    }

    // Get current persona
    const { data: persona, error: fetchError } = await supabase
      .from('chatbot_persona')
      .select('gemini_raw_output')
      .eq('account_id', accountId)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    // Add brand to gemini_raw_output
    const geminiData = persona.gemini_raw_output || {};
    const brands = geminiData.brands || [];
    brands.push({
      ...brand,
      id: `manual_${Date.now()}`,
      source: 'manual',
    });

    const { error: updateError } = await supabase
      .from('chatbot_persona')
      .update({
        gemini_raw_output: {
          ...geminiData,
          brands,
        },
      })
      .eq('account_id', accountId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, brand });
  } catch (error) {
    console.error('Error adding brand:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Update a brand
export async function PATCH(req: NextRequest) {
  try {
    const { accountId, brandId, updates } = await req.json();

    if (!accountId || !brandId) {
      return NextResponse.json(
        { error: 'Missing accountId or brandId' },
        { status: 400 }
      );
    }

    // Get current persona
    const { data: persona, error: fetchError } = await supabase
      .from('chatbot_persona')
      .select('gemini_raw_output')
      .eq('account_id', accountId)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    // Update brand in gemini_raw_output
    const geminiData = persona.gemini_raw_output || {};
    const brands = geminiData.brands || [];
    const brandIndex = brands.findIndex((b: any) => 
      b.id === brandId || b.brand_id === brandId
    );

    if (brandIndex === -1) {
      return NextResponse.json(
        { error: 'Brand not found' },
        { status: 404 }
      );
    }

    brands[brandIndex] = {
      ...brands[brandIndex],
      ...updates,
    };

    const { error: updateError } = await supabase
      .from('chatbot_persona')
      .update({
        gemini_raw_output: {
          ...geminiData,
          brands,
        },
      })
      .eq('account_id', accountId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating brand:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Delete a brand
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');
    const brandId = searchParams.get('brandId');

    if (!accountId || !brandId) {
      return NextResponse.json(
        { error: 'Missing accountId or brandId' },
        { status: 400 }
      );
    }

    // Get current persona
    const { data: persona, error: fetchError } = await supabase
      .from('chatbot_persona')
      .select('gemini_raw_output')
      .eq('account_id', accountId)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: 'Persona not found' },
        { status: 404 }
      );
    }

    // Remove brand from gemini_raw_output
    const geminiData = persona.gemini_raw_output || {};
    const brands = (geminiData.brands || []).filter((b: any) => 
      b.id !== brandId && b.brand_id !== brandId
    );

    const { error: updateError } = await supabase
      .from('chatbot_persona')
      .update({
        gemini_raw_output: {
          ...geminiData,
          brands,
        },
      })
      .eq('account_id', accountId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to delete' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting brand:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
