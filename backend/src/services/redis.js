import Redis from "ioredis";

let client;
let subClient; // separate connection for subscribe (can't do pub+sub on same conn)

function createClient() {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const c = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  c.on("error", (err) => {
    // Suppress connection refused noise — Redis is optional
    if (!err.message.includes("ECONNREFUSED")) console.error("[redis]", err.message);
  });
  return c;
}

export function getRedis() {
  if (!client) client = createClient();
  return client;
}

export function getSubRedis() {
  if (!subClient) subClient = createClient();
  return subClient;
}
