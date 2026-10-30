import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Next.js API 代理路由: /api/claims/ocr
 * 接收客户端上传的票据文件，并将请求安全代理至 Python AI 智能微服务
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded / 未检测到上传文件' }, { status: 400 });
    }

    const aiBackendBase = (process.env.NEXT_PUBLIC_PYTHON_API_URL || 'http://localhost:8000')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/api$/, '');

    const targetUrl = `${aiBackendBase}/api/claims/ocr-receipt`;

    // 转发请求头（携带用户 ID Token）
    const authHeader = request.headers.get('authorization') || '';
    const headers = {};
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const forwardForm = new FormData();
    forwardForm.append('file', file, file.name);

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: forwardForm
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error('[/api/claims/ocr] Forwarding failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: `OCR proxy connection failed: ${err.message}`
      },
      { status: 500 }
    );
  }
}
