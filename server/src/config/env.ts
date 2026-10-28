export type NodeEnv = 'development' | 'test' | 'production';

export interface Env {
  nodeEnv: NodeEnv;
  port: number;
  mongoUri: string;
  clientOrigin: string;
  jwtAccessSecret: string;
  bcryptCost: number;
  /** 32-byte key that encrypts 2FA secrets in the database. */
  twoFactorKey: Buffer;
}

const NODE_ENVS: readonly string[] = ['development', 'test', 'production'];

/**
 * Reads and checks the environment variables in one place, so a missing or wrong value
 * stops the server at start-up with a clear message instead of failing later in some
 * random request. Takes the variables as an argument (instead of reading process.env
 * directly) so it can be tested.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const problems: string[] = [];

  const nodeEnv = source.NODE_ENV ?? 'development';
  if (!NODE_ENVS.includes(nodeEnv)) {
    problems.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')} (got "${nodeEnv}")`);
  }

  const portText = source.PORT ?? '4000';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT must be a whole number from 1 to 65535 (got "${portText}")`);
  }

  const mongoUri = source.MONGODB_URI?.trim() ?? '';
  if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    problems.push('MONGODB_URI is required and must start with mongodb:// or mongodb+srv://');
  }

  const clientOrigin = source.CLIENT_ORIGIN?.trim() ?? '';
  try {
    const url = new URL(clientOrigin);
    if (url.origin !== clientOrigin) {
      problems.push(`CLIENT_ORIGIN must be an origin only, like ${url.origin} (no path or trailing slash)`);
    }
  } catch {
    problems.push('CLIENT_ORIGIN is required and must be a URL such as http://localhost:5173');
  }

  const jwtAccessSecret = source.JWT_ACCESS_SECRET ?? '';
  if (jwtAccessSecret.length < 32) {
    problems.push('JWT_ACCESS_SECRET is required and must be at least 32 characters long');
  }

  // 12 is a sensible default today. Tests use 4 so they run fast.
  const costText = source.BCRYPT_COST ?? '12';
  const bcryptCost = Number(costText);
  if (!Number.isInteger(bcryptCost) || bcryptCost < 4 || bcryptCost > 15) {
    problems.push(`BCRYPT_COST must be a whole number from 4 to 15 (got "${costText}")`);
  }

  // Base64 of exactly 32 random bytes. Without it the server cannot store 2FA secrets safely,
  // so it refuses to start rather than quietly storing them in plain text.
  const keyText = source.TWO_FACTOR_KEY?.trim() ?? '';
  const twoFactorKey = Buffer.from(keyText, 'base64');
  if (keyText === '' || twoFactorKey.length !== 32) {
    problems.push(
      'TWO_FACTOR_KEY is required: base64 of 32 random bytes. Make one with: ' +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
    );
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n - ${problems.join('\n - ')}`);
  }

  return { nodeEnv: nodeEnv as NodeEnv, port, mongoUri, clientOrigin, jwtAccessSecret, bcryptCost, twoFactorKey };
}