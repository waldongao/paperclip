import { tCli } from "../i18n.js";
import net from "node:net";

export function checkPort(port: number): Promise<{ available: boolean; error?: string }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve({ available: false, error: tCli("Port {{port}} is already in use", { port: String(port) }) });
      } else {
        resolve({ available: false, error: err.message });
      }
    });
    server.once("listening", () => {
      server.close(() => resolve({ available: true }));
    });
    server.listen(port, "127.0.0.1");
  });
}
