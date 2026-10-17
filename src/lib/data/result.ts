/** Resultado de una operación que la UI o un tool muestran tal cual: el error ya viene en español. */
export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
export const fail = <T = never>(error: string): Result<T> => ({ ok: false, error })
