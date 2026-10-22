import { NextRequest, NextResponse } from "next/server";
import { getInternalApiUrl } from "@/lib/domain";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ facilityId: string }> }
) {
  try {
    const { facilityId } = await context.params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "25";

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const apiUrl = getInternalApiUrl(host);

    const res = await fetch(`${apiUrl}/store-agent/${facilityId}/commands?limit=${limit}`, {
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
