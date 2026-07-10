import { startServer } from "./app";

startServer().catch((err) => {
  console.error("Failed to start the Express server:", err);
});
