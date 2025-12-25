import { parseSetCookieHeader } from "better-auth/cookies";

export type SecondaryStorage = {
	get: (key: string) => Promise<string | null>;
	set: (key: string, value: string, ttl?: number) => Promise<void>;
	delete: (key: string) => Promise<void>;
};

export function createMemorySecondaryStorage(): SecondaryStorage {
	const store = new Map<
		string,
		{
			value: string;
			expiresAt: number | null;
		}
	>();

	return {
		async get(key) {
			const entry = store.get(key);
			if (!entry) return null;
			if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
				store.delete(key);
				return null;
			}
			return entry.value;
		},
		async set(key, value, ttl) {
			const expiresAt =
				typeof ttl === "number" && ttl > 0 ? Date.now() + ttl * 1000 : null;
			store.set(key, { value, expiresAt });
		},
		async delete(key) {
			store.delete(key);
		},
	};
}

export function createCookieJar() {
	const jar = new Map<string, string>();

	function applySetCookie(setCookieHeader: string | null) {
		if (!setCookieHeader) return;
		const parsed = parseSetCookieHeader(setCookieHeader);
		for (const [name, cookie] of parsed.entries()) {
			jar.set(name, cookie.value);
		}
	}

	function headerValue() {
		if (jar.size === 0) return "";
		return Array.from(jar.entries())
			.map(([k, v]) => `${k}=${v}`)
			.join("; ");
	}

	return {
		applySetCookie,
		headerValue,
		get(name: string) {
			return jar.get(name);
		},
		set(name: string, value: string) {
			jar.set(name, value);
		},
	};
}

export async function readJson<T>(res: Response): Promise<T> {
	return (await res.json()) as T;
}

