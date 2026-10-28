// GET /api/training/status?jobId=123  -> progress of one training job
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureJobsTable } from '@/lib/training';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  await ensureJobsTable();
  const jobId = Number(new URL(req.url).searchParams.get('jobId'));
  if (!Number.isInteger(jobId)) return NextResponse.json({ error: 'jobId is required' }, { status: 400 });

  const [job] = await query(
    'SELECT id, status, total, processed, rows_imported, error, summary FROM training_jobs WHERE id = $1', [jobId]);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  let summary = null;
  try { summary = job.summary ? JSON.parse(job.summary) : null; } catch { /* ignore broken JSON */ }
  return NextResponse.json({ ...job, summary }, { headers: { 'Cache-Control': 'no-store' } });
}