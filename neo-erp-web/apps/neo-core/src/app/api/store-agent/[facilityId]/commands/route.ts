import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ facilityId: string }> }
) {
  try {
    const { facilityId } = await context.params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "25";

    const res = await fetch(`${API_URL}/store-agent/${facilityId}/commands?limit=${limit}`, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      return NextResponse.json([], { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error fetching commands in route handler:", error);
    return NextResponse.json([], { status: 500 });
  }
}
