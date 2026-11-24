export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  traceId?: string;
  errors?: Record<string, unknown>;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly problem?: ProblemDetails;

  constructor(status: number, message: string, problem?: ProblemDetails) {
    super(message);
    this.status = status;
    this.problem = problem;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit & { token?: string | null; rawResponse?: boolean } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const reqHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  };

  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  if (rest.body && !(rest.body instanceof FormData) && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: reqHeaders,
    cache: 'no-store',
  });

  if (!res.ok) {
    let problem: ProblemDetails | undefined;
    try {
      problem = (await res.json()) as ProblemDetails;
    } catch {
      // non-JSON error
    }
    throw new ApiError(
      res.status,
      problem?.detail || problem?.title || `Request failed with status ${res.status}`,
      problem
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
