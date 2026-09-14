import { NextResponse } from "next/server";

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/store-agent/facilities`, {
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
