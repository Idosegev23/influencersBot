import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { password } = await req.json();
    
    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }
    
    const hash = await hashPassword(password);
    return NextResponse.json({ hash });
  } catch (error) {
    console.error('Hash error:', error);
    return NextResponse.json({ error: 'Failed to hash' }, { status: 500 });
  }
}



