// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
// El navegador no necesita leer tokens: todas las operaciones Auth usan el servidor.
export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}
