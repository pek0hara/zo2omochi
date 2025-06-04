/**
 * イベント追跡クラス
 * 重複イベントの検出と処理済みイベントの記録を担当
 */
class EventTracker {
  
  /**
   * 重複イベントかどうかをチェック
   */
  static isDuplicateEvent(webhookEventId) {
    try {
      const sheet = this.getProcessedEventsSheet();
      const data = sheet.getDataRange().getValues();
      
      // 過去24時間以内の処理済みイベントをチェック
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      
      for (let i = 1; i < data.length; i++) { // ヘッダー行をスキップ
        if (data[i][1] === webhookEventId && data[i][0] > yesterday) {
          return true; // 重複発見
        }
      }
      return false;
    } catch (error) {
      Logger.log("Error in isDuplicateEvent: " + error.message);
      return false; // エラー時は重複なしとして処理を続行
    }
  }

  /**
   * 処理済みイベントを記録
   */
  static recordProcessedEvent(webhookEventId) {
    try {
      const sheet = this.getProcessedEventsSheet();
      sheet.appendRow([new Date(), webhookEventId]);
      
      // 古いレコードを削除（24時間以前のものを削除）
      this.cleanupOldEvents(sheet);
    } catch (error) {
      Logger.log("Error in recordProcessedEvent: " + error.message);
      ErrorLogger.log("recordProcessedEvent Error", error.message);
    }
  }

  /**
   * 処理済みイベントシートを取得（なければ作成）
   */
  static getProcessedEventsSheet() {
    const spreadsheet = SpreadsheetApp.openById(Config.getSpreadsheetId());
    let sheet = spreadsheet.getSheetByName("processed_events");
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet("processed_events");
      sheet.appendRow(["処理時刻", "WebhookEventId"]);
    }
    
    return sheet;
  }

  /**
   * 古いイベントレコードを削除
   */
  static cleanupOldEvents(sheet) {
    try {
      const data = sheet.getDataRange().getValues();
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);
      
      // 削除対象の行を特定（後ろから削除するため逆順でチェック）
      const rowsToDelete = [];
      for (let i = data.length - 1; i >= 1; i--) { // ヘッダー行をスキップ
        if (data[i][0] < yesterday) {
          rowsToDelete.push(i + 1); // シートの行番号は1始まり
        }
      }
      
      // 行を削除
      rowsToDelete.forEach(rowIndex => {
        sheet.deleteRow(rowIndex);
      });
      
      if (rowsToDelete.length > 0) {
        Logger.log(`Cleaned up ${rowsToDelete.length} old event records`);
      }
    } catch (error) {
      Logger.log("Error in cleanupOldEvents: " + error.message);
    }
  }
}
