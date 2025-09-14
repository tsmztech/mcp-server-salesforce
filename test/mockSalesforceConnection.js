/**
 * Mock Salesforce connection for testing
 */

export class MockSalesforceConnection {
  constructor() {
    this.queryResults = new Map();
    this.toolingQueries = new Map();
    this.metadata = new MockMetadata();
    this.tooling = new MockTooling();
    this.sobjectInstances = new Map();
    this.instanceUrl = 'https://test.salesforce.com';
  }

  // Set up mock query results
  setQueryResult(soql, result) {
    this.queryResults.set(soql, result);
  }

  // Mock query method
  async query(soql) {
    // Check for exact match first
    if (this.queryResults.has(soql)) {
      return this.queryResults.get(soql);
    }
    
    // Check for partial matches (useful for parameterized queries)
    for (const [key, value] of this.queryResults) {
      if (soql.includes(key) || key.includes('*')) {
        return value;
      }
    }

    // Default result
    return {
      totalSize: 0,
      done: true,
      records: []
    };
  }

  // Mock search method for SOSL
  async search(sosl) {
    return {
      searchRecords: []
    };
  }

  // Mock sobject method
  sobject(objectType) {
    if (!this.sobjectInstances.has(objectType)) {
      this.sobjectInstances.set(objectType, new MockSObject(objectType));
    }
    return this.sobjectInstances.get(objectType);
  }
}

class MockSObject {
  constructor(objectType) {
    this.objectType = objectType;
    this.createResults = [];
    this.updateResults = [];
    this.deleteResults = [];
    this.upsertResults = [];
  }

  // Set up mock DML results
  setCreateResult(result) {
    this.createResults.push(result);
  }

  setUpdateResult(result) {
    this.updateResults.push(result);
  }

  setDeleteResult(result) {
    this.deleteResults.push(result);
  }

  setUpsertResult(result) {
    this.upsertResults.push(result);
  }

  // Mock DML operations
  async create(records) {
    if (this.createResults.length > 0) {
      return this.createResults.shift();
    }
    return Array.isArray(records) 
      ? records.map(() => ({ success: true, id: 'mock_id_' + Math.random() }))
      : { success: true, id: 'mock_id_' + Math.random() };
  }

  async update(records) {
    if (this.updateResults.length > 0) {
      return this.updateResults.shift();
    }
    return Array.isArray(records)
      ? records.map(() => ({ success: true, id: 'mock_id_' + Math.random() }))
      : { success: true, id: 'mock_id_' + Math.random() };
  }

  async destroy(ids) {
    if (this.deleteResults.length > 0) {
      return this.deleteResults.shift();
    }
    return Array.isArray(ids)
      ? ids.map(() => ({ success: true, id: ids[0] || 'mock_id' }))
      : { success: true, id: ids };
  }

  async upsert(records, externalIdField) {
    if (this.upsertResults.length > 0) {
      return this.upsertResults.shift();
    }
    return Array.isArray(records)
      ? records.map(() => ({ success: true, id: 'mock_id_' + Math.random(), created: true }))
      : { success: true, id: 'mock_id_' + Math.random(), created: true };
  }
}

class MockMetadata {
  constructor() {
    this.createResults = [];
    this.updateResults = [];
    this.readResults = new Map();
  }

  setCreateResult(result) {
    this.createResults.push(result);
  }

  setUpdateResult(result) {
    this.updateResults.push(result);
  }

  setReadResult(type, fullNames, result) {
    this.readResults.set(`${type}:${fullNames.join(',')}`, result);
  }

  async create(type, metadata) {
    if (this.createResults.length > 0) {
      return this.createResults.shift();
    }
    return { success: true, fullName: metadata.fullName || 'MockObject__c' };
  }

  async update(type, metadata) {
    if (this.updateResults.length > 0) {
      return this.updateResults.shift();
    }
    return { success: true, fullName: metadata.fullName || 'MockObject__c' };
  }

  async read(type, fullNames) {
    const key = `${type}:${fullNames.join(',')}`;
    if (this.readResults.has(key)) {
      return this.readResults.get(key);
    }
    return null;
  }
}

class MockTooling {
  constructor() {
    this.queryResults = new Map();
    this.executeAnonymousResults = [];
    this.requestResults = new Map();
    this.sobjectInstances = new Map();
  }

  setQueryResult(soql, result) {
    this.queryResults.set(soql, result);
  }

  setExecuteAnonymousResult(result) {
    this.executeAnonymousResults.push(result);
  }

  setRequestResult(url, result) {
    this.requestResults.set(url, result);
  }

  async query(soql) {
    if (this.queryResults.has(soql)) {
      return this.queryResults.get(soql);
    }
    return {
      totalSize: 0,
      done: true,
      records: []
    };
  }

  async executeAnonymous(apexCode) {
    if (this.executeAnonymousResults.length > 0) {
      return this.executeAnonymousResults.shift();
    }
    return {
      compiled: true,
      success: true,
      line: 0,
      column: 0,
      compileProblem: null,
      exceptionMessage: null,
      exceptionStackTrace: null
    };
  }

  async request(options) {
    const key = options.url || `${options.method}:${options.path}`;
    if (this.requestResults.has(key)) {
      return this.requestResults.get(key);
    }
    return 'Mock request response';
  }

  sobject(objectType) {
    if (!this.sobjectInstances.has(objectType)) {
      this.sobjectInstances.set(objectType, new MockSObject(objectType));
    }
    return this.sobjectInstances.get(objectType);
  }
}