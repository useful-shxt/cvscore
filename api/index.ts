// Vercel serverless entry point — wraps our Express app
import "dotenv/config";
import express, { Response, NextFunction } from "express";
import type { Request } from "express";
import { registerRoutes } from "../server/routes";
import { serveStatic } from "../server/static";
import { createServer } from "node:http";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Boot the routes once
const httpServer = createServer(app);

let ready = false;
let readyPromise: Promise<void>;

readyPromise = (async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ message: err.message || "Internal Server Error" });
  });

  serveStatic(app);
  ready = true;
})();

// Vercel calls this as a serverless function
export default async function handler(req: any, res: any) {
  if (!ready) await readyPromise;
  return new Promise<void>((resolve) => {
    app(req, res);
    res.on("finish", resolve);
    res.on("close", resolve);
  });
}
