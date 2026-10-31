import type { Db } from './db';
import type { Device } from './db/schema';

export type AppEnv = {
  Bindings: Cloudflare.Env;
  // `device` is set by requireDevice, i.e. on every /api route except redeem.
  Variables: { db: Db; device: Device };
};
