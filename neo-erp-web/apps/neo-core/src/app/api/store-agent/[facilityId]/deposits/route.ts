import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

async function getAuthHeaders() {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  try {
    const { facilityId } = await params;
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/store-agent/${facilityId}/deposits`, {
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: "Error consultando mapeos de depósitos", details: err },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  try {
    const { facilityId } = await params;
    const body = await request.json();
    const headers = await getAuthHeaders();

    const res = await fetch(`${API_URL}/store-agent/${facilityId}/deposits`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: "Error guardando mapeo", details: err },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  try {
    const { facilityId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const mappingId = searchParams.get("mappingId");
    if (!mappingId) {
      return NextResponse.json(
        { error: "mappingId requerido en query params" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const headers = await getAuthHeaders();

    const res = await fetch(`${API_URL}/store-agent/${facilityId}/deposits/${mappingId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: "Error actualizando mapeo", details: err },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ facilityId: string }> }
) {
  try {
    const { facilityId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const mappingId = searchParams.get("mappingId");
    if (!mappingId) {
      return NextResponse.json(
        { error: "mappingId requerido en query params" },
        { status: 400 }
      );
    }

    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/store-agent/${facilityId}/deposits/${mappingId}`, {
      method: "DELETE",
      headers,
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: "Error eliminando mapeo", details: err },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error interno del servidor" },
      { status: 500 }
    );
  }
}
