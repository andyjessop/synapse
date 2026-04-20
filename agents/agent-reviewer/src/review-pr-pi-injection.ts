import type { PiReviewClient } from './pi-review-client.js';

let injectedPiReview: PiReviewClient | undefined;

export function setReviewPrPiClient(client: PiReviewClient): void {
  injectedPiReview = client;
}

export function resetReviewPrPiClientForTest(): void {
  injectedPiReview = undefined;
}

export function isReviewPrPiClientConfigured(): boolean {
  return injectedPiReview !== undefined;
}

export function getReviewPrPiClient(): PiReviewClient | undefined {
  return injectedPiReview;
}
