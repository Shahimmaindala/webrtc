
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Session from '@/models/Session';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const { id } = await params;
    const session = await Session.findById(id);
    if (!session) {
        return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, session });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
      await dbConnect();
      const { id } = await params;
      const body = await request.json();
      
      const session = await Session.findByIdAndUpdate(id, {
          ...body,
          lastSeen: new Date()
      }, { new: true });
  
      if (!session) {
          return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, session });
    } catch (error) {
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
    }
  }
