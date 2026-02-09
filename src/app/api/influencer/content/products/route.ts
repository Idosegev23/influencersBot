import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Add a product
export async function POST(req: NextRequest) {
  try {
    const { accountId, product } = await req.json();

    if (!accountId || !product) {
      return NextResponse.json(
        { error: 'Missing accountId or product' },
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

    // Add product to gemini_raw_output
    const geminiData = persona.gemini_raw_output || {};
    const products = geminiData.products || [];
    products.push({
      ...product,
      id: `manual_${Date.now()}`,
      source: 'manual',
    });

    const { error: updateError } = await supabase
      .from('chatbot_persona')
      .update({
        gemini_raw_output: {
          ...geminiData,
          products,
        },
      })
      .eq('account_id', accountId);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, product });
  } catch (error) {
    console.error('Error adding product:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Update a product
export async function PATCH(req: NextRequest) {
  try {
    const { accountId, productId, updates } = await req.json();

    if (!accountId || !productId) {
      return NextResponse.json(
        { error: 'Missing accountId or productId' },
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

    // Update product in gemini_raw_output
    const geminiData = persona.gemini_raw_output || {};
    const products = geminiData.products || [];
    const productIndex = products.findIndex((p: any) => 
      p.id === productId || p.product_id === productId
    );

    if (productIndex === -1) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    products[productIndex] = {
      ...products[productIndex],
      ...updates,
    };

    const { error: updateError } = await supabase
      .from('chatbot_persona')
      .update({
        gemini_raw_output: {
          ...geminiData,
          products,
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
    console.error('Error updating product:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Delete a product
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId');
    const productId = searchParams.get('productId');

    if (!accountId || !productId) {
      return NextResponse.json(
        { error: 'Missing accountId or productId' },
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

    // Remove product from gemini_raw_output
    const geminiData = persona.gemini_raw_output || {};
    const products = (geminiData.products || []).filter((p: any) => 
      p.id !== productId && p.product_id !== productId
    );

    const { error: updateError } = await supabase
      .from('chatbot_persona')
      .update({
        gemini_raw_output: {
          ...geminiData,
          products,
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
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
