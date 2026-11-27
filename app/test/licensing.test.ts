import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_POLAR_ORGANIZATION_ID,
  FeatureGate,
  HttpPolarApiClient,
  LICENSE_SECRET_KEY,
  LicenseManager,
  OFFLINE_GRACE_MS,
  PRO_FEATURE_LABELS,
  PolarApiError,
  REVALIDATE_INTERVAL_MS,
  createMemoryStorageAdapter,
  maskLicenseKey,
} from '../src/licensing';
import type { PolarApiClient, ProFeatureId } from '../src/licensing';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const ORG_ID = DEFAULT_POLAR_ORGANIZATION_ID;
const CHECKOUT_URL = 'https://buy.polar.sh/polar_cl_chromaloom_pro';

function createMockPolarClient(): {
  client: PolarApiClient;
  activate: ReturnType<typeof vi.fn>;
  validate: ReturnType<typeof vi.fn>;
  deactivate: ReturnType<typeof vi.fn>;
} {
  const activate = vi.fn();
  const validate = vi.fn();
  const deactivate = vi.fn();
  return {
    client: { activate, validate, deactivate },
    activate,
    validate,
    deactivate,
  };
}

describe('ChromaLoom maskLicenseKey', () => {
  it('masks CHROMA-prefixed Polar keys preserving prefix and last 4 chars', () => {
    expect(maskLicenseKey('CHROMA-A1B2-C3D4-9F2A')).toBe('CHROMA-****-9F2A');
  });

  it('handles non-hyphenated and blank keys safely', () => {
    expect(maskLicenseKey('CHROMALOOM123456')).toBe('CHRO-****-3456');
    expect(maskLicenseKey('   ')).toBe('****');
  });
});

describe('ChromaLoom LicenseManager (MV3 StorageAdapter)', () => {
  it('starts in fresh free state using bani Polar org default', async () => {
    const storage = createMemoryStorageAdapter();
    const { client } = createMockPolarClient();
    const manager = new LicenseManager(storage, undefined, client);
    await manager.init();

    expect(DEFAULT_POLAR_ORGANIZATION_ID).toBe(
      'c9b3a57f-c07f-4f81-b9b8-aa9f5b497a1e'
    );
    expect(manager.isPro()).toBe(false);
    expect(manager.getState()).toEqual({
      tier: 'free',
      offlineGraceActive: false,
    });
  });

  it('activates a valid license, masks key, and persists secret + 14-day grace window', async () => {
    const backing = new Map<string, unknown>();
    const storage = createMemoryStorageAdapter(backing);
    const { client, activate } = createMockPolarClient();
    const now = Date.parse('2026-11-27T17:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_cl_001',
      key: 'CHROMA-1111-2222-9F2A',
    });

    const manager = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client,
      () => now
    );

    const state = await manager.activate(
      '  CHROMA-1111-2222-9F2A  ',
      'chromaloom-firefox'
    );

    expect(activate).toHaveBeenCalledWith(
      'CHROMA-1111-2222-9F2A',
      ORG_ID,
      'chromaloom-firefox'
    );
    expect(manager.isPro()).toBe(true);
    expect(state).toEqual({
      tier: 'pro',
      keyMask: 'CHROMA-****-9F2A',
      activationId: 'act_cl_001',
      validatedAtIso: new Date(now).toISOString(),
      graceUntilIso: new Date(now + OFFLINE_GRACE_MS).toISOString(),
      offlineGraceActive: false,
    });
    expect(backing.get(LICENSE_SECRET_KEY)).toBe('CHROMA-1111-2222-9F2A');
  });

  it('rejects empty keys, non-granted statuses, and 404/422 errors without elevating tier', async () => {
    const backing = new Map<string, unknown>();
    const storage = createMemoryStorageAdapter(backing);
    const { client, activate } = createMockPolarClient();
    const manager = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client
    );

    await expect(manager.activate('   ')).rejects.toThrow(PolarApiError);
    expect(activate).not.toHaveBeenCalled();

    activate.mockResolvedValueOnce({
      status: 'revoked',
      id: 'act_bad',
      key: 'CHROMA-BAD-KEY',
    });
    await expect(manager.activate('CHROMA-BAD-KEY')).rejects.toThrow(
      PolarApiError
    );
    expect(manager.isPro()).toBe(false);
    expect(backing.has(LICENSE_SECRET_KEY)).toBe(false);

    activate.mockRejectedValueOnce(
      new PolarApiError('Not Found', {
        statusCode: 404,
        isRevokedOrInvalid: true,
        isTransient: false,
      })
    );
    await expect(manager.activate('CHROMA-404-KEY')).rejects.toThrow(
      PolarApiError
    );
    expect(manager.isPro()).toBe(false);
  });

  it('trusts cached valid state under 72h with zero API calls', async () => {
    const storage = createMemoryStorageAdapter();
    const { client, activate, validate } = createMockPolarClient();
    let now = Date.parse('2026-11-27T17:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_cache',
      key: 'CHROMA-AAA1-BBB2-CCCC',
    });

    const manager = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client,
      () => now
    );
    await manager.activate('CHROMA-AAA1-BBB2-CCCC', 'edge-mac');

    now += REVALIDATE_INTERVAL_MS - 60_000;
    const state = await manager.refreshIfNeeded();

    expect(validate).not.toHaveBeenCalled();
    expect(state.tier).toBe('pro');
    expect(state.offlineGraceActive).toBe(false);
  });

  it('silently refreshes at >= 72h and extends 14-day grace window', async () => {
    const storage = createMemoryStorageAdapter();
    const { client, activate, validate } = createMockPolarClient();
    let now = Date.parse('2026-11-27T17:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_refresh',
      key: 'CHROMA-1234-5678-9ABC',
    });
    validate.mockResolvedValue({ status: 'granted' });

    const manager = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client,
      () => now
    );
    await manager.activate('CHROMA-1234-5678-9ABC', 'edge-mac');

    now += REVALIDATE_INTERVAL_MS;
    const state = await manager.refreshIfNeeded();

    expect(validate).toHaveBeenCalledWith(
      'CHROMA-1234-5678-9ABC',
      ORG_ID,
      'act_refresh'
    );
    expect(state.tier).toBe('pro');
    expect(state.offlineGraceActive).toBe(false);
    expect(state.validatedAtIso).toBe(new Date(now).toISOString());
    expect(state.graceUntilIso).toBe(
      new Date(now + OFFLINE_GRACE_MS).toISOString()
    );
  });

  it('keeps Pro with offlineGraceActive=true on transient error within 14-day grace', async () => {
    const storage = createMemoryStorageAdapter();
    const { client, activate, validate } = createMockPolarClient();
    let now = Date.parse('2026-11-27T17:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_offline',
      key: 'CHROMA-OFFL-INE1-9999',
    });
    validate.mockRejectedValue(
      new PolarApiError('Polar API network error: offline', {
        isRevokedOrInvalid: false,
        isTransient: true,
      })
    );

    const manager = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client,
      () => now
    );
    await manager.activate('CHROMA-OFFL-INE1-9999', 'firefox-laptop');

    now += 6 * DAY_MS;
    const state = await manager.refreshIfNeeded();

    expect(manager.isPro()).toBe(true);
    expect(state.tier).toBe('pro');
    expect(state.offlineGraceActive).toBe(true);
  });

  it('downgrades to free when 14-day offline grace has expired', async () => {
    const storage = createMemoryStorageAdapter();
    const { client, activate, validate } = createMockPolarClient();
    let now = Date.parse('2026-11-27T17:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_expired',
      key: 'CHROMA-EXPI-RED1-0000',
    });
    validate.mockRejectedValue(
      new PolarApiError('Polar API responded with HTTP 503', {
        statusCode: 503,
        isRevokedOrInvalid: false,
        isTransient: true,
      })
    );

    const manager = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client,
      () => now
    );
    await manager.activate('CHROMA-EXPI-RED1-0000', 'offline-browser');

    now += OFFLINE_GRACE_MS + 1_000;
    const state = await manager.refreshIfNeeded();

    expect(manager.isPro()).toBe(false);
    expect(state).toEqual({ tier: 'free', offlineGraceActive: false });
  });

  it('immediately revokes Pro on explicit 404/422 or non-granted status', async () => {
    for (const scenario of ['404', '422', 'status_disabled'] as const) {
      const backing = new Map<string, unknown>();
      const storage = createMemoryStorageAdapter(backing);
      const { client, activate, validate } = createMockPolarClient();
      let now = Date.parse('2026-11-27T17:00:00.000Z');

      activate.mockResolvedValue({
        status: 'granted',
        id: `act_${scenario}`,
        key: 'CHROMA-REVO-KED1-ABCD',
      });

      if (scenario === '404') {
        validate.mockRejectedValue(
          new PolarApiError('Not Found', {
            statusCode: 404,
            isRevokedOrInvalid: true,
            isTransient: false,
          })
        );
      } else if (scenario === '422') {
        validate.mockRejectedValue(
          new PolarApiError('Unprocessable Entity', {
            statusCode: 422,
            isRevokedOrInvalid: true,
            isTransient: false,
          })
        );
      } else {
        validate.mockResolvedValue({ status: 'disabled' });
      }

      const manager = new LicenseManager(
        storage,
        { organizationId: ORG_ID },
        client,
        () => now
      );
      await manager.activate('CHROMA-REVO-KED1-ABCD', 'edge-mac');

      now += 4 * DAY_MS;
      const state = await manager.refreshIfNeeded();

      expect(manager.isPro()).toBe(false);
      expect(state).toEqual({ tier: 'free', offlineGraceActive: false });
      expect(backing.has(LICENSE_SECRET_KEY)).toBe(false);
    }
  });

  it('deactivates best-effort and clears secrets and state', async () => {
    const backing = new Map<string, unknown>();
    const storage = createMemoryStorageAdapter(backing);
    const { client, activate, deactivate } = createMockPolarClient();

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_deact',
      key: 'CHROMA-DEAC-TIV1-7777',
    });
    deactivate.mockRejectedValueOnce(new Error('offline during deactivate'));

    const manager = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client
    );
    await manager.activate('CHROMA-DEAC-TIV1-7777', 'old-browser');

    const state = await manager.deactivate();

    expect(deactivate).toHaveBeenCalledWith(
      'CHROMA-DEAC-TIV1-7777',
      ORG_ID,
      'act_deact'
    );
    expect(state).toEqual({ tier: 'free', offlineGraceActive: false });
    expect(manager.isPro()).toBe(false);
    expect(backing.has(LICENSE_SECRET_KEY)).toBe(false);
  });

  it('persists Pro state across popup reopen / fresh LicenseManager instance', async () => {
    const backing = new Map<string, unknown>();
    const storage = createMemoryStorageAdapter(backing);
    const { client, activate, validate } = createMockPolarClient();
    const now = Date.parse('2026-11-27T17:00:00.000Z');

    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_persist',
      key: 'CHROMA-PERS-IST1-5555',
    });

    const first = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client,
      () => now
    );
    await first.activate('CHROMA-PERS-IST1-5555', 'firefox-mac');

    const reopened = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client,
      () => now + HOUR_MS
    );
    await reopened.init();

    expect(reopened.isPro()).toBe(true);
    expect(reopened.getState().keyMask).toBe('CHROMA-****-5555');
    expect(reopened.getState().activationId).toBe('act_persist');

    await reopened.refreshIfNeeded();
    expect(validate).not.toHaveBeenCalled();
  });
});

describe('ChromaLoom HttpPolarApiClient', () => {
  it('calls Polar public customer-portal endpoints with zero secret headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'act_http_cl_1',
          license_key: { status: 'granted', key: 'CHROMA-HTTP-0001-ABCD' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const client = new HttpPolarApiClient(
      'https://api.polar.sh/',
      fetchMock as unknown as typeof fetch
    );

    const res = await client.activate(
      'CHROMA-HTTP-0001-ABCD',
      ORG_ID,
      'chromaloom-edge'
    );

    expect(res).toEqual({
      id: 'act_http_cl_1',
      status: 'granted',
      key: 'CHROMA-HTTP-0001-ABCD',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.polar.sh/v1/customer-portal/license-keys/activate'
    );
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
  });

  it('classifies 404/422 as revoked/invalid and 5xx as transient', async () => {
    const fetch422 = vi
      .fn()
      .mockResolvedValue(new Response('invalid', { status: 422 }));
    const client422 = new HttpPolarApiClient(
      'https://api.polar.sh',
      fetch422 as unknown as typeof fetch
    );

    await expect(
      client422.validate('CHROMA-NONE', ORG_ID, 'act_1')
    ).rejects.toMatchObject({
      statusCode: 422,
      isRevokedOrInvalid: true,
      isTransient: false,
    });

    const fetch500 = vi
      .fn()
      .mockResolvedValue(new Response('server error', { status: 500 }));
    const client500 = new HttpPolarApiClient(
      'https://api.polar.sh',
      fetch500 as unknown as typeof fetch
    );

    await expect(
      client500.validate('CHROMA-LIVE', ORG_ID, 'act_1')
    ).rejects.toMatchObject({
      statusCode: 500,
      isRevokedOrInvalid: false,
      isTransient: true,
    });
  });
});

describe('ChromaLoom FeatureGate', () => {
  const allFeatures: ProFeatureId[] = [
    'wcag_auditor',
    'token_export',
    'gradient_boards',
  ];

  it('blocks all 3 Pro features when Free and invokes onBlocked with checkoutUrl', async () => {
    const storage = createMemoryStorageAdapter();
    const { client } = createMockPolarClient();
    const manager = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client
    );
    await manager.init();
    const gate = new FeatureGate(manager, CHECKOUT_URL);

    expect(gate.getCheckoutUrl()).toBe(CHECKOUT_URL);

    for (const feature of allFeatures) {
      expect(PRO_FEATURE_LABELS[feature].title).toBeTruthy();
      expect(PRO_FEATURE_LABELS[feature].summary).toBeTruthy();
      expect(gate.isAllowed(feature)).toBe(false);

      const onBlocked = vi.fn();
      expect(gate.requirePro(feature, onBlocked)).toBe(false);
      expect(onBlocked).toHaveBeenCalledWith(feature, CHECKOUT_URL);
    }
  });

  it('allows all 3 Pro features silently once activated', async () => {
    const storage = createMemoryStorageAdapter();
    const { client, activate } = createMockPolarClient();
    activate.mockResolvedValue({
      status: 'granted',
      id: 'act_gate',
      key: 'CHROMA-PRO1-GATE-8888',
    });

    const manager = new LicenseManager(
      storage,
      { organizationId: ORG_ID },
      client
    );
    await manager.activate('CHROMA-PRO1-GATE-8888', 'chromaloom-edge');

    const gate = new FeatureGate(manager, CHECKOUT_URL);
    const onBlocked = vi.fn();

    for (const feature of allFeatures) {
      expect(gate.isAllowed(feature)).toBe(true);
      expect(gate.requirePro(feature, onBlocked)).toBe(true);
    }
    expect(onBlocked).not.toHaveBeenCalled();
  });
});
