/**
 * リファクタリング済み LINE Bot メインエントリーポイント
 * 新しいモジュラー構造で動作します
 * 
 * 注意: このファイルは後方互換性のため残していますが、
 * 実際の処理は各専用モジュールに分離されています。
 */

/**
 * LINE Webhook エントリーポイント（リファクタリング済み）
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

// 後方互換性のための関数（外部から呼び出される可能性があるため残す）
function pushToNotionHourly() {
  return NotionIntegration.pushToNotionHourly();
}

function pushToNotionDaily() {
  return NotionIntegration.pushToNotionDaily();
}

function setupHourlyTrigger() {
  return TriggerManager.setupHourlyTrigger();
}

function setupDailyTrigger() {
  return TriggerManager.setupDailyTrigger();
}

function checkCurrentTriggers() {
  return TriggerManager.checkCurrentTriggers();
}

/**
 * 以下、古い関数の後方互換性サポート
 * 実際の処理は新しいクラスに委譲されます
 */

// ユーザー管理関連
function getDisplayName(userId) {
  return UserManager.getDisplayName(userId);
}

function setUserName(userId, newName) {
  return UserManager.setUserName(userId, newName);
}

// メッセージ送信関連
function sendReply(replyToken, replyMessage) {
  return MessageSender.sendReply(replyToken, replyMessage);
}

function sendWelcomeMessage(replyToken) {
  return MessageSender.sendWelcomeMessage(replyToken);
}

function askForNameConfirmation(replyToken, proposedName) {
  return MessageSender.askForNameConfirmation(replyToken, proposedName);
}

function askForNameAgain(replyToken) {
  return MessageSender.askForNameAgain(replyToken);
}

function sendUsageGuide(replyToken, userName) {
  return MessageSender.sendUsageGuide(replyToken, userName);
}

// ログ関連
function logToMainSheet(userId, messageText, geminiMessage) {
  return MessageHistory.logToMainSheet(userId, messageText, geminiMessage);
}

function logErrorToSheet(errorMessage, stackTrace) {
  return ErrorLogger.log(errorMessage, stackTrace);
}

function logDebugToSheet(debugLog) {
  return ErrorLogger.logDebug(debugLog);
}

// メッセージ履歴関連
function getTodaysMessages(userId) {
  return MessageHistory.getTodaysMessages(userId);
}

// メッセージ削除関連
function handleDeleteCommand(userId, messageText, replyToken) {
  return MessageDeletion.handleDeleteCommand(userId, messageText, replyToken);
}

function deleteLastMessage(userId, replyToken) {
  return MessageDeletion.deleteLastMessage(userId, replyToken);
}

function deleteMessageByTime(userId, timeString, replyToken) {
  return MessageDeletion.deleteMessageByTime(userId, timeString, replyToken);
}

// API関連
function getGeminiMessage(messageText, prompt) {
  return GeminiAPI.getMessage(messageText, prompt);
}

// イベント追跡関連
function isDuplicateEvent(webhookEventId) {
  return EventTracker.isDuplicateEvent(webhookEventId);
}

function recordProcessedEvent(webhookEventId) {
  return EventTracker.recordProcessedEvent(webhookEventId);
}

/**
 * テスト用関数
 */
function testNotionCreateArticle() {
  Logger.log("テスト関数が呼び出されました");
  // テスト実装は必要に応じて追加
}

/**
 * リファクタリング情報
 * 
 * 変更内容:
 * - 3,757行の巨大ファイルを13の専用モジュールに分割
 * - 重複する関数定義を削除
 * - 責任を明確に分離
 * - エラーハンドリングを統一
 * - 設定管理を一元化
 * 
 * 新しいファイル構成:
 * - webhook-handler.js: Webhookエントリーポイント
 * - event-processor.js: イベント処理ロジック
 * - command-processor.js: コマンド処理
 * - message-sender.js: メッセージ送信
 * - user-manager.js: ユーザー管理
 * - message-history.js: メッセージ履歴管理
 * - message-deletion.js: メッセージ削除機能
 * - mention-processor.js: メンション処理
 * - gemini-api.js: Gemini API連携
 * - event-tracker.js: イベント追跡
 * - error-logger.js: エラーログ
 * - config.js: 設定管理
 * - response-helper.js: レスポンス生成
 * - notion-integration.js: Notion連携
 * - trigger-manager.js: トリガー管理
 */
