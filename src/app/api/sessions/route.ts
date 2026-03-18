
import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Session from '@/models/Session';

export async function POST(request: Request) {
  try {
    await dbConnect();
    const body = await request.json();
    
    // Extract real client IP from proxy headers
    let ip = '127.0.0.1';
    
    const headers = {
      'x-forwarded-for': request.headers.get('x-forwarded-for'),
      'x-real-ip': request.headers.get('x-real-ip'),
      'cf-connecting-ip': request.headers.get('cf-connecting-ip'),
      'client-ip': request.headers.get('client-ip')
    };

    console.log('Production Headers:', JSON.stringify(headers));
    
    if (headers['x-forwarded-for']) {
      ip = headers['x-forwarded-for'].split(',')[0].trim();
    } else if (headers['x-real-ip']) {
      ip = headers['x-real-ip'];
    } else if (headers['cf-connecting-ip']) {
      ip = headers['cf-connecting-ip'];
    }
    
    // Convert IPv6-mapped IPv4 addresses and normalize localhost
    if (ip === '::1') {
      ip = '127.0.0.1';
    } else if (ip && ip.startsWith('::ffff:')) {
      ip = ip.substring(7);
    }
    
    // Use findOneAndUpdate with upsert to ensure unique sessions per IP
    const session = await Session.findOneAndUpdate(
      { ipAddress: ip },
      {
        userAgent: body.device_info || 'Unknown',
        deviceInfo: body.device_info || 'Unknown',
        isActive: true,
        socketId: body.socket_id,
        lastSeen: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, session_id: session._id });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  try {
    await dbConnect();
    const sessions = await Session.find({}).sort({ lastSeen: -1 }).lean();
    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await dbConnect();
    await Session.deleteMany({});
    return NextResponse.json({ success: true, message: 'All sessions cleared' });
  } catch (error) {
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
