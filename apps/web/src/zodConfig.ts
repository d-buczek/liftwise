import { z } from 'zod';

// The content security policy refuses the code zod would generate, and reports zod's attempt to
// (§6.8). The first import of main.ts: modules parse while they load.
z.config({ jitless: true });
