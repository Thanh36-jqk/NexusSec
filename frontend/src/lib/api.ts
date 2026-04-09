export const getAuthToken = () => {
    if (typeof window !== "undefined") {
        return localStorage.getItem("nexussec_token");
    }
    return null;
};

export const setAuthToken = (token: string) => {
    if (typeof window !== "undefined") {
        localStorage.setItem("nexussec_token", token);
    }
};

export const clearAuthToken = () => {
    if (typeof window !== "undefined") {
        localStorage.removeItem("nexussec_token");
    }
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

type FetchOptions = RequestInit & {
    params?: Record<string, string>;
};

export async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { params, headers, ...rest } = options;

    const token = getAuthToken();
    const headersInit: Record<string, string> = {
        "Content-Type": "application/json",
        ...(headers as Record<string, string>),
    };

    if (token) {
        headersInit["Authorization"] = `Bearer ${token}`;
    }

    let url = `${API_BASE}${endpoint}`;
    if (params) {
        url += "?" + new URLSearchParams(params).toString();
    }

    const response = await fetch(url, { headers: headersInit, credentials: "include", ...rest });

    if (response.status === 401) {
        // Unauthorized -> Clear token and send to login
        clearAuthToken();
        if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
            window.location.href = "/login";
        }
        throw new Error("Unauthorized");
    }

    const data = await response.json().catch(() => null);

    if (response.status === 403 && data?.message === "email_not_verified") {
        if (typeof window !== "undefined") {
            window.location.href = "/verify-email";
        }
        throw new Error(data?.message);
    }

    if (!response.ok) {
        throw new Error(data?.message || `HTTP ${response.status}`);
    }

    return data;
}
