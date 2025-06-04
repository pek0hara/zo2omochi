/**
 * リファクタリング済み LINE Bot メインエントリーポイント
 * 新しいモジュラー構造で動作します
 */

import { WebhookHandler } from './webhook-handler';

/**
 * LINE Webhook エントリーポイント
 */
function doPost(e) {
  return WebhookHandler.handlePost(e);
}

/**
 * テスト用関数
 */
function testNotionCreateArticle() {
  Logger.log("テスト関数が呼び出されました");
  // テスト実装は必要に応じて追加
}

