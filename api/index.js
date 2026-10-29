import app from "../server/index.js";

export default function handler(req, res) {
  // Vercel rewrites /api/* to this one function. Restore the original Express
  // path so the existing /api routes keep matching as they do locally.
  const url = new URL(req.url || "/api", "http://vercel.internal");
  const expressPath = url.searchParams.get("__express_path");
  if (expressPath && expressPath.startsWith("/api/")) {
    url.searchParams.delete("__express_path");
    req.url = expressPath + (url.search ? url.search : "");
  }
  return app(req, res);
}
