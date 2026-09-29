/**
 * Creates a mock jsforce Connection object with sensible defaults.
 * Override any method by passing it in the overrides object.
 */
export function createMockConnection(overrides = {}) {
  const defaultConn = {
    query: async (soql, options) => ({
      totalSize: 0,
      done: true,
      records: [],
    }),
    search: async (sosl) => ({
      searchRecords: [],
    }),
    describe: async (objectName) => ({
      name: objectName,
      label: objectName,
      fields: [],
      custom: false,
      childRelationships: [],
      recordTypeInfos: [],
    }),
    describeGlobal: async () => ({
      sobjects: [],
    }),
    sobject: (name) => ({
      create: async (records) =>
        Array.isArray(records)
          ? records.map((_, i) => ({ id: `001xx00000${i}`, success: true, errors: [] }))
          : { id: '001xx000001', success: true, errors: [] },
      update: async (records) =>
        Array.isArray(records)
          ? records.map(() => ({ id: null, success: true, errors: [] }))
          : { id: null, success: true, errors: [] },
      destroy: async (ids) =>
        Array.isArray(ids)
          ? ids.map(() => ({ id: null, success: true, errors: [] }))
          : { id: null, success: true, errors: [] },
      upsert: async (records, extIdField) =>
        Array.isArray(records)
          ? records.map((_, i) => ({ id: `001xx00000${i}`, success: true, errors: [], created: true }))
          : { id: '001xx000001', success: true, errors: [], created: true },
    }),
    metadata: {
      create: async (type, metadata) => ({ success: true, fullName: metadata?.fullName }),
      read: async (type, fullNames) => ({}),
      update: async (type, metadata) => ({ success: true, fullName: metadata?.fullName }),
    },
    tooling: {
      query: async (soql) => ({
        totalSize: 0,
        done: true,
        records: [],
      }),
      sobject: (name) => ({
        create: async (record) => ({ id: '07Lxx000001', success: true, errors: [] }),
        update: async (record) => ({ id: null, success: true, errors: [] }),
        delete: async (id) => ({ id: null, success: true, errors: [] }),
      }),
      executeAnonymous: async (code) => ({
        compiled: true,
        compileProblem: null,
        success: true,
        exceptionMessage: null,
        exceptionStackTrace: null,
        line: -1,
        column: -1,
      }),
      request: async (opts) => '',
    },
    analytics: {
      reports: async () => [],
      dashboards: async () => [],
      report: (id) => ({
        describe: async () => ({}),
        execute: async (opts) => ({}),
      }),
      dashboard: (id) => ({
        describe: async () => ({}),
        components: async () => ({}),
        refresh: async () => ({}),
        status: async () => ({}),
      }),
    },
    instanceUrl: 'https://test.salesforce.com',
  };

  return deepMerge(defaultConn, overrides);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof source[key] !== 'function'
    ) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
