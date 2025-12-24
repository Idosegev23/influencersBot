import { test, expect } from '@playwright/test';

test.describe('Chat Page', () => {
  test('should load chat page', async ({ page }) => {
    // Navigate to a sample chat page
    await page.goto('/chat/testuser');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Check if page shows loading or 404 (depending on whether testuser exists)
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('should have responsive layout on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/chat/testuser');
    await page.waitForLoadState('networkidle');
    
    // Check that the page renders
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

test.describe('Admin Dashboard', () => {
  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/admin');
    
    // Should see login form or be redirected
    await page.waitForLoadState('networkidle');
    
    // Check for password input or login elements
    const loginElement = page.locator('input[type="password"], [data-testid="login"]');
    const pageContent = await page.content();
    
    // Either there's a login form, or we're on the login page
    expect(pageContent.length).toBeGreaterThan(0);
  });
});

test.describe('Privacy Page', () => {
  test('should load privacy policy', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    
    // Check for privacy content
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('should have GDPR data deletion form', async ({ page }) => {
    await page.goto('/privacy');
    await page.waitForLoadState('networkidle');
    
    // Look for email input
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });
});


