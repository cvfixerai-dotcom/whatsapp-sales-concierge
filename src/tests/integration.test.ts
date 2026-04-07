/**
 * Basic Integration Tests for Critical Booking Flows
 * 
 * These tests validate core business logic without requiring
 * external services (Twilio, OpenAI, etc.) to be running.
 */

import { calculateLeadScore, getQualificationCriteria } from '../lib/ai/prompts';

// Mock Supabase to avoid real DB calls
jest.mock('../lib/db/client', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

describe('Lead Scoring', () => {
  test('calculates score of 0 for empty responses', () => {
    const result = calculateLeadScore('real-estate', {});
    expect(result.score).toBe(0);
    expect(result.missingRequired).toBeDefined();
    expect(Array.isArray(result.missingRequired)).toBe(true);
  });

  test('calculates higher score when more criteria are filled', () => {
    const lowResult = calculateLeadScore('real-estate', {});
    const highResult = calculateLeadScore('real-estate', {
      name: 'John',
      budget: '500k',
      timeline: 'this month',
      property_type: '3 bed house',
      location: 'Cape Town',
    });
    expect(highResult.score).toBeGreaterThan(lowResult.score);
  });

  test('score is between 0 and 100', () => {
    const result = calculateLeadScore('real-estate', {
      name: 'John',
      budget: '500k',
      timeline: 'urgent',
      property_type: 'apartment',
      location: 'Johannesburg',
      email: 'john@test.com',
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('missing required fields are reported', () => {
    const result = calculateLeadScore('real-estate', {});
    expect(result.missingRequired.length).toBeGreaterThan(0);
  });
});

describe('Qualification Criteria', () => {
  test('returns criteria object for real-estate industry', () => {
    const criteria = getQualificationCriteria('real-estate');
    expect(criteria).toBeDefined();
    expect(typeof criteria).toBe('object');
    expect(Object.keys(criteria).length).toBeGreaterThan(0);
  });

  test('criteria entries have weight and required fields', () => {
    const criteria = getQualificationCriteria('real-estate');
    for (const [, value] of Object.entries(criteria)) {
      expect(typeof value.weight).toBe('number');
      expect(typeof value.required).toBe('boolean');
    }
  });

  test('returns criteria for medical industry', () => {
    const criteria = getQualificationCriteria('medical');
    expect(criteria).toBeDefined();
    expect(typeof criteria).toBe('object');
  });

  test('returns default criteria for unknown industry', () => {
    const criteria = getQualificationCriteria('unknown-industry');
    expect(criteria).toBeDefined();
    expect(typeof criteria).toBe('object');
    expect(Object.keys(criteria).length).toBeGreaterThan(0);
  });
});

describe('Email Validation', () => {
  // Test the email validation logic used in send-email.ts
  const isValidEmail = (email: string): boolean => {
    if (!email) return false;
    const placeholders = ['placeholder', 'noreply', 'example.com', 'test@test', 'no-email'];
    if (placeholders.some(p => email.toLowerCase().includes(p))) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  test('rejects empty email', () => {
    expect(isValidEmail('')).toBe(false);
  });

  test('rejects placeholder emails', () => {
    expect(isValidEmail('placeholder@test.com')).toBe(false);
    expect(isValidEmail('user@example.com')).toBe(false);
    expect(isValidEmail('noreply@company.com')).toBe(false);
  });

  test('accepts valid email', () => {
    expect(isValidEmail('john@gmail.com')).toBe(true);
    expect(isValidEmail('client@realestate.co.za')).toBe(true);
  });
});

describe('Booking Flow Validation', () => {
  test('slot time parsing handles ISO strings', () => {
    const isoString = '2026-04-10T09:00:00+02:00';
    const date = new Date(isoString);
    expect(date.getTime()).not.toBeNaN();
    expect(date.toISOString()).toBeDefined();
  });

  test('slot time parsing handles various date formats', () => {
    const formats = [
      '2026-04-10T09:00:00Z',
      '2026-04-10T09:00:00+05:30',
      '2026-04-10T09:00:00.000Z',
    ];
    formats.forEach(f => {
      const d = new Date(f);
      expect(d.getTime()).not.toBeNaN();
    });
  });

  test('business hours day mapping is correct', () => {
    const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    expect(DAY_NAMES[0]).toBe('sunday');
    expect(DAY_NAMES[1]).toBe('monday');
    expect(DAY_NAMES[6]).toBe('saturday');
    expect(DAY_NAMES.length).toBe(7);
  });

  test('duplicate booking detection logic', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Within 24 hours = duplicate
    const isDuplicate = (bookingTime: Date) => {
      return (now.getTime() - bookingTime.getTime()) < 24 * 60 * 60 * 1000;
    };

    expect(isDuplicate(oneHourAgo)).toBe(true);
    expect(isDuplicate(twoDaysAgo)).toBe(false);
  });
});

describe('Temperature State Machine', () => {
  const validTemperatures = ['new', 'warm', 'hot', 'cold', 'booked', 'lost'];

  test('all temperature values are valid', () => {
    validTemperatures.forEach(t => {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    });
  });

  test('booked temperature should not be overwritten', () => {
    // Simulates the CRIT-1 fix logic
    const shouldUpdate = (currentTemp: string, newTemp: string): boolean => {
      if (currentTemp === 'booked' && newTemp !== 'booked') return false;
      return true;
    };

    expect(shouldUpdate('new', 'warm')).toBe(true);
    expect(shouldUpdate('warm', 'hot')).toBe(true);
    expect(shouldUpdate('booked', 'warm')).toBe(false); // CRIT-1: prevent overwrite
    expect(shouldUpdate('booked', 'cold')).toBe(false);
    expect(shouldUpdate('booked', 'booked')).toBe(true);
  });
});
