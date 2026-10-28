// Route Handler (API endpoint): GET /api/medicines/MED-00001 -> JSON details of one medicine
import { getMedicineDetail } from '@/lib/queries';


export async function GET(request, { params }) {
  const { code } = await params;                 // dynamic segment [code]
  const data = await getMedicineDetail(code);
  if (!data) return Response.json({ error: 'Medicine not found' }, { status: 404 });
  return Response.json(data);
}
