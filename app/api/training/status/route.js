
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureJobsTable } from '@/lib/training';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/training/status?jobId=123
// Returns the progress and status of one training job.

export async function GET(req) {
  try {
    // Ensure the training jobs table exists
    await ensureJobsTable();

    // Read jobId from the URL
    const { searchParams } = new URL(req.url);
    const jobId = Number(searchParams.get('jobId'));

    // Validate jobId
    if (
      !searchParams.has('jobId') ||
      !Number.isSafeInteger(jobId) ||
      jobId <= 0
    ) {
      return NextResponse.json(
        { error: 'A valid jobId is required' },
        { status: 400 }
      );
    }

    // Get the training job from the database
    const [job] = await query(
      `SELECT
        id,
        status,
        total,
        processed,
        rows_imported,
        error,
        summary
      FROM training_jobs
      WHERE id = $1`,
      [jobId]
    );

    // Check if the job exists
    if (!job) {
      return NextResponse.json(
        { error: 'Training job not found' },
        { status: 404 }
      );
    }

    // Parse the summary safely
    let summary = null;

    try {
      summary = job.summary
        ? typeof job.summary === 'string'
          ? JSON.parse(job.summary)
          : job.summary
        : null;
    } catch {
      summary = null;
    }

    // Return training progress
    return NextResponse.json(
      {
        ...job,
        summary
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      }
    );

  } catch (error) {
    console.error('Training status API error:', error);

    return NextResponse.json(
      {
        error: 'Failed to retrieve training job status'
      },
      { status: 500 }
    );
  }
}
