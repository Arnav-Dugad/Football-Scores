import { handleApi } from "../server/handler";
export const config = { runtime: "edge" };
export default function handler(request: Request) {
  return handleApi(request, {
    FOOTBALL_DATA_TOKEN: process.env.FOOTBALL_DATA_TOKEN,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}
