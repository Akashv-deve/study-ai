// '../dist/app' and '../dist/auth' pull in better-auth, whose ESM build this Jest config can't parse (no
// existing test touches app.ts/auth.ts directly for the same reason) — so both are replaced with light
// fakes via jest.mock BEFORE index.ts (which imports them) is required. This tests the real startup
// ORDERING logic in index.ts without needing a real Express app or a real Better Auth instance.
const mockApp = { listen: jest.fn() };
const mockAuth = { initializeAuth: jest.fn() };
jest.mock('../dist/app', () => ({ __esModule: true, default: mockApp }));
// A stable wrapper (not `initializeAuth: mockAuth.initializeAuth`, which would capture that one jest.fn()
// reference permanently at factory-eval time) that always delegates to whatever mockAuth.initializeAuth
// currently is — so beforeEach can swap it out per test and index.ts's call still reaches the new one.
jest.mock('../dist/auth', () => ({ __esModule: true, initializeAuth: (...args) => mockAuth.initializeAuth(...args) }));

const database = require('../dist/config/database');
const processor = require('../dist/jobs/processor');
const migrations = require('../dist/practice/migrations');
const mongoose = require('mongoose');
const { startServer } = require('../dist/index');

// Direct reassignment instead of jest.spyOn/restoreAllMocks for the already-mocked app/auth module exports —
// avoids any spyOn-wraps-a-mock subtlety and keeps each test's expectations unambiguous.
beforeEach(() => {
  mockApp.listen = jest.fn();
  mockAuth.initializeAuth = jest.fn();
});

describe('startup sequence — app.listen() is gated on DB connect + migration/index success', () => {
  afterEach(() => jest.restoreAllMocks());

  test('on a clean, successful boot, steps run in the required order: connect -> migrate -> auth/jobs -> listen', async () => {
    const calls = [];
    jest.spyOn(database, 'connectDatabase').mockImplementation(async () => { calls.push('connect'); });
    jest.spyOn(mongoose, 'connection', 'get').mockReturnValue({ db: {} });
    jest.spyOn(migrations, 'migratePracticeAttempts').mockImplementation(async () => { calls.push('migrate'); });
    mockAuth.initializeAuth.mockImplementation(() => { calls.push('auth'); });
    const jobs = jest.spyOn(processor, 'startJobProcessor').mockImplementation(() => { calls.push('jobs'); });
    const fakeServer = { close: jest.fn() };
    mockApp.listen.mockImplementation((...args) => { calls.push('listen'); const cb = args[args.length - 1]; if (typeof cb === 'function') cb(); return fakeServer; });

    const server = await startServer();

    expect(calls).toEqual(['connect', 'migrate', 'auth', 'jobs', 'listen']);
    expect(server).toBe(fakeServer);
    jobs.mockRestore();
  });

  test('listen() is never called if connectDatabase() rejects', async () => {
    jest.spyOn(database, 'connectDatabase').mockRejectedValue(new Error('mongo unreachable'));
    const migrate = jest.spyOn(migrations, 'migratePracticeAttempts');

    await expect(startServer()).rejects.toThrow('mongo unreachable');

    expect(migrate).not.toHaveBeenCalled(); // never even attempted once connect failed
    expect(mockApp.listen).not.toHaveBeenCalled(); // the critical guarantee: no unsafe serving state
  });

  test('listen() is never called if migratePracticeAttempts() rejects (migration or index creation failure)', async () => {
    jest.spyOn(database, 'connectDatabase').mockResolvedValue(undefined);
    jest.spyOn(mongoose, 'connection', 'get').mockReturnValue({ db: {} });
    jest.spyOn(migrations, 'migratePracticeAttempts').mockRejectedValue(new Error('partial index build failed'));
    const jobs = jest.spyOn(processor, 'startJobProcessor');

    await expect(startServer()).rejects.toThrow('partial index build failed');

    // Nothing downstream of the failed migration ever runs — in particular, the server is never started,
    // so there is no window where Practice Lab could be served without the one-active-attempt invariant.
    expect(mockAuth.initializeAuth).not.toHaveBeenCalled();
    expect(jobs).not.toHaveBeenCalled();
    expect(mockApp.listen).not.toHaveBeenCalled();
    jobs.mockRestore();
  });

  test('a missing mongoose.connection.db after a "successful" connect is also treated as fatal, before migration runs', async () => {
    jest.spyOn(database, 'connectDatabase').mockResolvedValue(undefined);
    jest.spyOn(mongoose, 'connection', 'get').mockReturnValue({ db: undefined });
    const migrate = jest.spyOn(migrations, 'migratePracticeAttempts');

    await expect(startServer()).rejects.toThrow('MongoDB connection is unavailable');

    expect(migrate).not.toHaveBeenCalled();
    expect(mockApp.listen).not.toHaveBeenCalled();
  });

  test('auth/job-processor initialization only ever happens strictly after migration has resolved, never concurrently', async () => {
    jest.spyOn(database, 'connectDatabase').mockResolvedValue(undefined);
    jest.spyOn(mongoose, 'connection', 'get').mockReturnValue({ db: {} });
    let migrationResolved = false;
    jest.spyOn(migrations, 'migratePracticeAttempts').mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => { migrationResolved = true; resolve(); }, 20);
    }));
    mockAuth.initializeAuth.mockImplementation(() => { expect(migrationResolved).toBe(true); });
    const jobs = jest.spyOn(processor, 'startJobProcessor').mockImplementation(() => { expect(migrationResolved).toBe(true); });
    mockApp.listen.mockImplementation(() => ({ close: jest.fn() }));

    await startServer();
    expect(migrationResolved).toBe(true);
    jobs.mockRestore();
  });
});
