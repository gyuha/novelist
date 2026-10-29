import type { AppType } from "@novelist/api";
import { hc } from "hono/client";

export const api = hc<AppType>("/");
