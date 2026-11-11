import { t } from "@lingui/core/macro";
import { isAndroidApp } from "./platform";

/**
 * The words for the store that sells Pro in this copy (ADR-277): Google Play
 * and a Google account in the Android app, the App Store and an Apple ID
 * everywhere else. Functions, not constants, so each is read in the bowler's
 * language at the moment it is shown.
 */

/** While a buy or a restore waits on the store. */
export function storeAsking(android: boolean = isAndroidApp()): string {
  return android ? t`Asking Google Play…` : t`Asking the App Store…`;
}

/** A buy or a restore the store failed, with its reason when it gave one. */
export function storeDidNotAnswer(reason: string, android: boolean = isAndroidApp()): string {
  if (android) {
    return reason ? t`Google Play did not answer: ${reason}` : t`Google Play did not answer. Try again in a moment.`;
  }
  return reason ? t`The App Store did not answer: ${reason}` : t`The App Store did not answer. Try again in a moment.`;
}

/** A restore that found no purchase on the account. */
export function storeNotBought(android: boolean = isAndroidApp()): string {
  return android ? t`This Google account has not bought Headpin Pro.` : t`This Apple ID has not bought Headpin Pro.`;
}
