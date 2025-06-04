/**
 * Webhook ハンドラー
 * LINEからのWebhookイベントを処理する
 */

/**
 * LINE Webhook エントリーポイント
 */
function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const event = contents.events[0];

    // webhookEventIdによる重複チェック
    if (event.webhookEventId) {
      if (EventTracker.isDuplicateEvent(event.webhookEventId)) {
        Logger.log("Duplicate webhookEventId detected: " + event.webhookEventId);
        return ResponseHelper.createSuccessResponse("Duplicate event skipped");
      }
      EventTracker.recordProcessedEvent(event.webhookEventId);
    }

    // 再配信イベントのチェック
    if (event.deliveryContext && event.deliveryContext.isRedelivery) {
      ErrorLogger.log(
        "再配信イベントを受信しました。 WebhookEventID: " +
          (event.webhookEventId || "N/A") +
          ", UserID: " +
          (event.source ? event.source.userId : "N/A") +
          "。重複処理を避けるためスキップします。"
      );
      return ResponseHelper.createSuccessResponse("再配信イベントを受信し、スキップしました。");
    }

    // イベントタイプごとの処理を委譲
    return EventProcessor.processEvent(event);

  } catch (error) {
    Logger.log("Error in doPost: " + error.message);
    ErrorLogger.log(error.message, error.stack);
    return ResponseHelper.createErrorResponse(error.message);
  }
}
