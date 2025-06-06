/**
 * エラーロガークラス
 * エラーログをスプレッドシートに記録
 */
class ErrorLogger {
  
  /**
   * エラーをログに記録
   */
  static log(errorMessage, stackTrace = "") {
    try {
      const sheet = this.getErrorSheet();
      const date = Config.getNow();
      sheet.appendRow([date, errorMessage, stackTrace]);
    } catch (error) {
      Logger.log("Error in ErrorLogger.log: " + error.message);
    }
  }

  /**
   * デバッグログを記録
   */
  static logDebug(debugMessage) {
    try {
      const sheet = this.getDebugSheet();
      const date = Config.getNow();
      sheet.appendRow([date, debugMessage]);
    } catch (error) {
      Logger.log("Error in ErrorLogger.logDebug: " + error.message);
    }
  }

  /**
   * エラーシートを取得（なければ作成）
   */
  static getErrorSheet() {
    const spreadsheet = SpreadsheetApp.openById(Config.getSpreadsheetId());
    let sheet = spreadsheet.getSheetByName("error");
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet("error");
      sheet.appendRow(["日時", "エラーメッセージ", "スタックトレース"]);
    }
    
    return sheet;
  }

  /**
   * デバッグシートを取得（なければ作成）
   */
  static getDebugSheet() {
    const spreadsheet = SpreadsheetApp.openById(Config.getSpreadsheetId());
    let sheet = spreadsheet.getSheetByName("debug");
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet("debug");
      sheet.appendRow(["日時", "デバッグメッセージ"]);
    }
    
    return sheet;
  }
}
