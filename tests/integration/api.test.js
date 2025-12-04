/**
 * Integration tests for API endpoints
 * Note: These tests require a running MongoDB instance
 */

import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app.js';
import User from '../../src/models/User.js';
import Admin from '../../src/models/Admin.js';
import Call from '../../src/models/Call.js';
import RefreshToken from '../../src/models/RefreshToken.js';
import { generateAccessToken } from '../../src/middlewares/auth-middleware.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

describe('API Integration Tests', () => {
  let adminToken;
  let testAdmin;
  let testUser;
  let userToken;
  
  beforeAll(async () => {
    // Connect to test database
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/green_candle_test';
    await mongoose.connect(mongoUri);
  });
  
  afterAll(async () => {
    // Clean up and close connection
    await mongoose.connection.close();
  });
  
  beforeEach(async () => {
    // Clear test data
    await Promise.all([
      User.deleteMany({}),
      Admin.deleteMany({}),
      Call.deleteMany({}),
      // Remove refresh tokens to avoid test interference
      RefreshToken.deleteMany({}),
    ]);
    
    // Create test admin
    const hashedPassword = await bcrypt.hash('testpassword', 10);
    testAdmin = await Admin.create({
      email: 'testadmin@example.com',
      password: hashedPassword,
      role: 'admin',
    });
    adminToken = generateAccessToken(testAdmin._id, 'admin');
    
    // Create test user with active subscription
    testUser = await User.create({
      firebaseUid: 'test-firebase-uid',
      mobile: '9876543210',
      isActive: true,
      subscription: {
        plan: 'weekly',
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });
    userToken = generateAccessToken(testUser._id, 'user');
  });
  
  describe('Health Check', () => {
    it('GET /health should return 200', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body.status).toBe('ok');
      expect(response.body.timestamp).toBeDefined();
    });
  });
  
  describe('Admin Authentication', () => {
    it('POST /api/auth/admin/login should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/admin/login')
        .send({
          email: 'testadmin@example.com',
          password: 'testpassword',
        })
        .expect(200);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.refreshToken).toBeDefined();
      expect(response.body.data.admin.email).toBe('testadmin@example.com');
    });
    
    it('POST /api/auth/admin/login should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/admin/login')
        .send({
          email: 'testadmin@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
      
      expect(response.body.status).toBe('fail');
    });
    
    it('POST /api/auth/admin/login should validate input', async () => {
      const response = await request(app)
        .post('/api/auth/admin/login')
        .send({
          email: 'invalid-email',
          password: '123',
        })
        .expect(400);
      
      expect(response.body.status).toBe('fail');
    });

    it('POST /api/auth/admin/refresh should rotate refresh tokens and revoke old one', async () => {
      const loginRes = await request(app)
        .post('/api/auth/admin/login')
        .send({ email: 'testadmin@example.com', password: 'testpassword' })
        .expect(200);

      const oldRefreshToken = loginRes.body.data.refreshToken;
      const decodedOld = jwt.decode(oldRefreshToken);
      const oldJti = decodedOld.jti;

      // Use refresh endpoint to rotate
      const refreshRes = await request(app)
        .post('/api/auth/admin/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(200);

      const newRefreshToken = refreshRes.body.data.refreshToken;
      const decodedNew = jwt.decode(newRefreshToken);
      const newJti = decodedNew.jti;

      const oldRecord = await RefreshToken.findOne({ jti: oldJti });
      const newRecord = await RefreshToken.findOne({ jti: newJti });

      expect(oldRecord).toBeDefined();
      expect(oldRecord.revokedAt).toBeDefined();
      expect(oldRecord.replacedBy.toString()).toBe(newRecord._id.toString());

      // Old refresh token should be invalid after rotation
      await request(app)
        .post('/api/auth/admin/refresh')
        .send({ refreshToken: oldRefreshToken })
        .expect(401);
    });
  });
  
  describe('Admin - Calls CRUD', () => {
    it('POST /api/admin/calls should create a call', async () => {
      const callData = {
        commodity: 'gold',
        type: 'buy',
        entryPrice: 62000,
        target: 62500,
        stopLoss: 61500,
        date: new Date().toISOString(),
      };
      
      const response = await request(app)
        .post('/api/admin/calls')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(callData)
        .expect(201);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data.call.commodity).toBe('gold');
      expect(response.body.data.call.type).toBe('buy');
      expect(response.body.data.call.status).toBe('active');
    });
    
    it('GET /api/admin/calls should list calls with pagination', async () => {
      // Create test calls
      await Call.create([
        { commodity: 'gold', type: 'buy', entryPrice: 62000, target: 62500, stopLoss: 61500, date: new Date(), createdBy: testAdmin._id },
        { commodity: 'silver', type: 'sell', entryPrice: 74000, target: 73500, stopLoss: 74500, date: new Date(), createdBy: testAdmin._id },
      ]);
      
      const response = await request(app)
        .get('/api/admin/calls')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination).toBeDefined();
    });
    
    it('PUT /api/admin/calls/:id should update a call', async () => {
      const call = await Call.create({
        commodity: 'gold',
        type: 'buy',
        entryPrice: 62000,
        target: 62500,
        stopLoss: 61500,
        date: new Date(),
        createdBy: testAdmin._id,
      });
      
      const response = await request(app)
        .put(`/api/admin/calls/${call._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'hit_target' })
        .expect(200);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data.call.status).toBe('hit_target');
    });
    
    it('DELETE /api/admin/calls/:id should delete a call', async () => {
      const call = await Call.create({
        commodity: 'gold',
        type: 'buy',
        entryPrice: 62000,
        target: 62500,
        stopLoss: 61500,
        date: new Date(),
        createdBy: testAdmin._id,
      });
      
      await request(app)
        .delete(`/api/admin/calls/${call._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      const deletedCall = await Call.findById(call._id);
      expect(deletedCall).toBeNull();
    });
    
    it('should reject calls without admin token', async () => {
      await request(app)
        .get('/api/admin/calls')
        .expect(401);
    });
  });
  
  describe('Admin - User Management', () => {
    it('GET /api/admin/users should list users', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
    
    it('GET /api/admin/users/:id should get user details', async () => {
      const response = await request(app)
        .get(`/api/admin/users/${testUser._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data.user.mobile).toBe('9876543210');
    });
    
    it('PATCH /api/admin/users/:id/status should update user status', async () => {
      const response = await request(app)
        .patch(`/api/admin/users/${testUser._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);
      
      expect(response.body.status).toBe('success');
      
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.isActive).toBe(false);
    });
  });
  
  describe('Admin - Dashboard', () => {
    it('GET /api/admin/dashboard/stats should return dashboard stats', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data).toBeDefined();
    });
  });
  
  describe('User - Calls Access', () => {
    it('GET /api/calls should return today calls for subscribed user', async () => {
      // Create a call for today
      await Call.create({
        commodity: 'gold',
        type: 'buy',
        entryPrice: 62000,
        target: 62500,
        stopLoss: 61500,
        date: new Date(),
        status: 'active',
        createdBy: testAdmin._id,
      });
      
      const response = await request(app)
        .get('/api/calls')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data.calls).toBeDefined();
    });
    
    it('GET /api/calls should reject user without active subscription', async () => {
      // Update user to have no subscription
      await User.findByIdAndUpdate(testUser._id, {
        'subscription.isActive': false,
      });
      
      await request(app)
        .get('/api/calls')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });
  
  describe('Market Data', () => {
    it('GET /api/market/prices should return market prices (public)', async () => {
      const response = await request(app)
        .get('/api/market/prices')
        .expect(200);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data.prices).toBeDefined();
    });
    
    it('GET /api/market/summary should return market summary', async () => {
      const response = await request(app)
        .get('/api/market/summary')
        .expect(200);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data.commodities).toBeDefined();
    });
  });
  
  describe('Subscription Plans', () => {
    it('GET /api/subscriptions/plans should return available plans', async () => {
      const response = await request(app)
        .get('/api/subscriptions/plans')
        .expect(200);
      
      expect(response.body.status).toBe('success');
      expect(response.body.data.plans).toBeDefined();
      expect(Array.isArray(response.body.data.plans)).toBe(true);
    });
  });
  
  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown-route')
        .expect(404);
      
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toContain('Cannot GET');
    });
    
    it('should handle invalid ObjectId', async () => {
      const response = await request(app)
        .get('/api/admin/users/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      
      expect(response.body.status).toBe('fail');
    });
    
    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/admin/calls')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({}) // Missing required fields
        .expect(400);
      
      expect(response.body.status).toBe('fail');
    });
  });
});
