import { NextRequest, NextResponse } from "next/server";
import { getInternalApiUrl } from "@/lib/domain";

export async function GET(request: NextRequest) {
  try {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
    const apiUrl = getInternalApiUrl(host);
    const res = await fetch(`${apiUrl}/store-agent/facilities`, {
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
    console.error("Error fetching facilities in route handler:", error);
    return NextResponse.json([], { status: 500 });
  }
}
