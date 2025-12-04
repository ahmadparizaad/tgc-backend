/**
 * Jest setup file
 * Runs before each test file
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-key-for-testing';
process.env.MONGODB_URI = 'mongodb://localhost:27017/green_candle_test';

// Increase timeout for async operations
jest.setTimeout(30000);

// Global test utilities
global.testUtils = {
  /**
   * Generate a random MongoDB ObjectId-like string
   */
  generateObjectId: () => {
    const timestamp = Math.floor(Date.now() / 1000).toString(16);
    const randomPart = 'x'.repeat(16).replace(/x/g, () => 
      Math.floor(Math.random() * 16).toString(16)
    );
    return timestamp + randomPart;
  },
  
  /**
   * Generate test user data
   */
  generateUser: (overrides = {}) => ({
    firebaseUid: `firebase_${Date.now()}`,
    mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    isActive: true,
    subscription: {
      plan: null,
      startDate: null,
      endDate: null,
      isActive: false,
    },
    ...overrides,
  }),
  
  /**
   * Generate test call data
   */
  generateCall: (overrides = {}) => ({
    commodity: 'gold',
    type: 'buy',
    entryPrice: 62000,
    target: 62500,
    stopLoss: 61500,
    status: 'active',
    date: new Date(),
    ...overrides,
  }),
  
  /**
   * Generate test admin data
   */
  generateAdmin: (overrides = {}) => ({
    email: `admin_${Date.now()}@test.com`,
    password: 'testpassword123',
    role: 'admin',
    ...overrides,
  }),
  
  /**
   * Wait for a specified time
   */
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
};

// Silence console during tests (optional - comment out for debugging)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
// };

// Clean up after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 500));
});
