import { NextResponse } from 'next/server';

function normalizeIp(ip) {
  if (!ip) return '127.0.0.1';
  let clean = ip.trim();
  if (clean.startsWith('::ffff:')) {
    clean = clean.replace('::ffff:', '');
  }
  return clean;
}

function getClientIp(request) {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return normalizeIp(cfIp);

  const xForwarded = request.headers.get('x-forwarded-for');
  if (xForwarded && xForwarded.trim()) {
    const first = xForwarded.split(',')[0].trim();
    if (first) return normalizeIp(first);
  }

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp && xRealIp.trim()) return normalizeIp(xRealIp);

  return '127.0.0.1';
}

export async function GET(request) {
  const clientIp = getClientIp(request);
  return NextResponse.json({
    status: 'success',
    client_ip: clientIp
  });
}
