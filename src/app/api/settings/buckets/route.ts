import { NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import {
  applyRemoveBucket,
  applySaveBucket,
  applySetActiveBucket,
  BucketConfigInput,
  getEditableBucketById,
  getBucketStateSummary,
  listBucketPublicViews,
  persistBucketState,
  readBucketState,
  testBucketConnectivity,
} from '@/lib/bucket-config';

type SavePayload = {
  action: 'save';
  bucket: BucketConfigInput;
  setActive?: boolean;
};

type RemovePayload = {
  action: 'remove';
  id: string;
};

type SetActivePayload = {
  action: 'set-active';
  id: string;
};

type TestPayload = {
  action: 'test';
  bucket: BucketConfigInput;
};

type GetBucketPayload = {
  action: 'get-bucket';
  id: string;
};

type RequestPayload = SavePayload | RemovePayload | SetActivePayload | TestPayload | GetBucketPayload;

export async function GET(request: Request) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;

  return NextResponse.json({
    success: true,
    data: {
      buckets: await listBucketPublicViews(request),
      runtime: await getBucketStateSummary(request),
    },
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const payload = (await request.json()) as RequestPayload;

    if (payload.action === 'test') {
      const tested = await testBucketConnectivity(payload.bucket);
      return NextResponse.json({
        success: tested.ok,
        message: tested.message,
      }, { status: tested.ok ? 200 : 400 });
    }

    if (payload.action === 'get-bucket') {
      if (typeof payload.id !== 'string' || !payload.id.trim()) {
        return NextResponse.json({ success: false, message: '缺少有效 id' }, { status: 400 });
      }
      const bucket = await getEditableBucketById(payload.id.trim(), request);
      if (!bucket) {
        return NextResponse.json({ success: false, message: '目标存储桶不存在或不可编辑' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: { bucket } });
    }

    const currentState = await readBucketState(request);

    if (payload.action === 'save') {
      const result = applySaveBucket(currentState, payload.bucket, Boolean(payload.setActive));
      if (result.error) {
        return NextResponse.json({ success: false, message: result.error }, { status: 400 });
      }
      await persistBucketState(result.state);
      const response = NextResponse.json({
        success: true,
        data: {
          buckets: await listBucketPublicViews(request),
        },
      });
      return response;
    }

    if (payload.action === 'remove') {
      if (typeof payload.id !== 'string' || !payload.id.trim()) {
        return NextResponse.json({ success: false, message: '缺少有效 id' }, { status: 400 });
      }
      const nextState = applyRemoveBucket(currentState, payload.id.trim());
      await persistBucketState(nextState);
      const response = NextResponse.json({
        success: true,
        data: {
          buckets: await listBucketPublicViews(request),
        },
      });
      return response;
    }

    if (payload.action === 'set-active') {
      if (typeof payload.id !== 'string' || !payload.id.trim()) {
        return NextResponse.json({ success: false, message: '缺少有效 id' }, { status: 400 });
      }

      const nextState = applySetActiveBucket(currentState, payload.id.trim());
      if (!nextState) {
        return NextResponse.json({ success: false, message: '目标存储桶不存在' }, { status: 404 });
      }
      await persistBucketState(nextState);
      const response = NextResponse.json({
        success: true,
        data: {
          buckets: await listBucketPublicViews(request),
        },
      });
      return response;
    }

    return NextResponse.json({ success: false, message: '未知操作类型' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || '存储桶配置操作失败' },
      { status: 500 }
    );
  }
}
