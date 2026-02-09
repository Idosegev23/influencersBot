import { NextRequest, NextResponse } from 'next/server';
import { processSupportFlow } from '@/lib/flows/support';

export async function POST(req: NextRequest) {
  try {
    const { message, supportState, username } = await req.json();
    
    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const result = await processSupportFlow(message, username, supportState);
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('Support flow API error:', error);
    
    if (error.message === 'Influencer not found') {
      return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
    }
    
    return NextResponse.json(
      { error: 'Failed to process support request' },
      { status: 500 }
    );
  }
}