/**
 * ユーザー管理クラス
 * ユーザー情報の管理を担当
 */
class UserManager {
  
  /**
   * ユーザーの表示名を取得
   */
  static getDisplayName(userId) {
    try {
      const sheet = this.getUserSheet();
      const data = sheet.getDataRange().getValues();
      
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === userId) {
          return data[i][1] || "";
        }
      }
      return "";
    } catch (error) {
      Logger.log("Error in getDisplayName: " + error.message);
      return "";
    }
  }

  /**
   * ユーザーの名前を設定
   */
  static setUserName(userId, newName) {
    try {
      const sheet = this.getUserSheet();
      const data = sheet.getDataRange().getValues();
      
      // 既存のユーザーを検索
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === userId) {
          sheet.getRange(i + 1, 2).setValue(newName);
          return;
        }
      }
      
      // 新規ユーザーの場合
      sheet.appendRow([userId, newName]);
    } catch (error) {
      Logger.log("Error in setUserName: " + error.message);
      ErrorLogger.log("setUserName Error", error.message);
    }
  }

  /**
   * ユーザーシートを取得（なければ作成）
   */
  static getUserSheet() {
    const spreadsheet = SpreadsheetApp.openById(Config.getSpreadsheetId());
    let sheet = spreadsheet.getSheetByName("ユーザー");
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet("ユーザー");
      sheet.appendRow(["ユーザーID", "名前"]);
    }
    
    return sheet;
  }
}
