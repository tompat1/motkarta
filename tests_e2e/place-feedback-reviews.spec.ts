import { test, expect } from "@playwright/test";

test.describe("Place Feedback Modal, Sticky Bar Bugfix & Reviews Display", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("motkarta_preloader_seen", "true");
      window.localStorage.setItem("motkarta_onboarded", "true");
    });
  });

  test("feedback modal button shows 'Skicka Feedback, lär oss', is fully visible in mobile view, and displays under reviews", async ({
    page,
  }, testInfo) => {
    await page.goto("/");

    const isMobile = testInfo.project.name.startsWith("mobile");

    if (isMobile) {
      // Toggle to List view
      const viewToggleBtn = page.locator(".floating-view-toggle-btn");
      await expect(viewToggleBtn).toBeVisible({ timeout: 15000 });
      await viewToggleBtn.click();

      // Ensure mobile place card list is visible
      const cardList = page.locator(".mobile-place-card-list");
      await expect(cardList).toBeVisible({ timeout: 10000 });

      // Find first card and click ThumbsUp button
      const firstCard = page.locator(".mobile-photo-card").first();
      await expect(firstCard).toBeVisible();
      const placeName = (await firstCard.locator(".mobile-photo-card-title").textContent())?.trim() ?? "";

      const thumbsUpBtn = firstCard.locator("button[title*='Hjälpsam'], button[title*='Helpful']").first();
      await expect(thumbsUpBtn).toBeVisible();
      await thumbsUpBtn.click();

      // Verify modal backdrop and card are rendered at top level
      const modalBackdrop = page.locator(".place-feedback-backdrop");
      await expect(modalBackdrop).toBeVisible({ timeout: 10000 });

      const modal = page.locator(".place-feedback-card");
      await expect(modal).toBeVisible();

      // Verify modal close button and title are visible and accessible (not covered by sticky bar)
      const closeBtn = modal.locator("button[aria-label='Close']");
      await expect(closeBtn).toBeVisible();
      await expect(modal.locator("h3", { hasText: placeName })).toBeVisible();

      // Check bounding box of modal card top vs sticky bar to ensure it's not occluded
      const modalBox = await modal.boundingBox();
      expect(modalBox).not.toBeNull();
      expect(modalBox!.y).toBeGreaterThanOrEqual(10); // Placed safely below top edge / safe-area

      // Verify the CTA button text is strictly "Skicka Feedback, lär oss"
      const submitBtn = modal.locator("button[type='submit']");
      await expect(submitBtn).toBeVisible();
      await expect(submitBtn).toContainText("Skicka Feedback, lär oss");

      // Select a reason
      const firstReasonCheckbox = modal.locator("input[type='checkbox']").first();
      await firstReasonCheckbox.check();

      // Enter comment
      const textarea = modal.locator("textarea");
      await textarea.fill("Underbar stämning och fantastiskt kaffe!");

      if (testInfo.project.name === "mobile-chrome") {
        await page.screenshot({
          path: "/Users/thomasrynell/.gemini/antigravity-ide/brain/72a70bf3-d6b1-4a28-a1fb-a71bcfa751db/mobile_feedback_modal_fixed.png",
        });
      }

      // Submit feedback
      await submitBtn.click();

      // Modal displays success state and closes
      await expect(modalBackdrop).not.toBeVisible({ timeout: 10000 });

      // Click card to open PlaceDetailSheet
      const cardTitle = firstCard.locator("h2").first();
      await cardTitle.click();

      // Verify PlaceDetailSheet is open
      const detailSheet = page.locator(".place-detail-sheet");
      await expect(detailSheet).toBeVisible({ timeout: 10000 });

      // Switch to "Recensioner" tab in mobile place sheet
      const reviewsTabBtn = detailSheet.locator(".lazy-tab-btn", { hasText: /Recensioner|Reviews/i });
      await reviewsTabBtn.scrollIntoViewIfNeeded();
      await expect(reviewsTabBtn).toBeVisible({ timeout: 10000 });
      await reviewsTabBtn.click();

      // Verify the feedback action button is present in the reviews tab
      const feedbackActionBtn = detailSheet.locator(".place-leave-feedback-btn");
      await feedbackActionBtn.scrollIntoViewIfNeeded();
      await expect(feedbackActionBtn).toBeVisible();
      await expect(feedbackActionBtn).toContainText(/Tyck till|Give feedback/i);

      // Verify visitor feedback section is visible with our submitted feedback
      const visitorFeedbackSection = detailSheet.locator(".place-feedback-section");
      await visitorFeedbackSection.scrollIntoViewIfNeeded();
      await expect(visitorFeedbackSection).toBeVisible({ timeout: 10000 });
      await expect(visitorFeedbackSection).toContainText("Underbar stämning och fantastiskt kaffe!");
      await expect(visitorFeedbackSection.locator(".feedback-sentiment-pill.is-positive")).toBeVisible();

      if (testInfo.project.name === "mobile-chrome") {
        await page.screenshot({
          path: "/Users/thomasrynell/.gemini/antigravity-ide/brain/72a70bf3-d6b1-4a28-a1fb-a71bcfa751db/mobile_place_reviews_feedback.png",
        });
      }
    } else {
      // Desktop flow
      const placeItem = page.locator(".place").first();
      await expect(placeItem).toBeVisible({ timeout: 15000 });
      await placeItem.click();

      // Verify map card is open
      const mapCard = page.locator("article.map-card");
      await expect(mapCard).toBeVisible({ timeout: 10000 });

      // Switch to "Recensioner" tab
      const reviewsTabBtn = mapCard.locator(".lazy-tab-btn", { hasText: /Recensioner|Reviews/i });
      await reviewsTabBtn.scrollIntoViewIfNeeded();
      await expect(reviewsTabBtn).toBeVisible({ timeout: 10000 });
      await reviewsTabBtn.click();

      // Verify the feedback action button is present in the reviews tab
      const feedbackActionBtn = mapCard.locator(".place-leave-feedback-btn");
      await feedbackActionBtn.scrollIntoViewIfNeeded();
      await expect(feedbackActionBtn).toBeVisible();
      await expect(feedbackActionBtn).toContainText(/Tyck till|Give feedback/i);

      if (testInfo.project.name === "chromium") {
        await page.screenshot({
          path: "/Users/thomasrynell/.gemini/antigravity-ide/brain/72a70bf3-d6b1-4a28-a1fb-a71bcfa751db/desktop_map_card_reviews_feedback.png",
        });
      }
    }
  });
});
