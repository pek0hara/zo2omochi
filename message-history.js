/**
 * メッセージ履歴管理クラス
 * スプレッドシートへのログ記録と履歴取得を担当
 */
class MessageHistory {
  
  /**
   * メインシートにログを記録
   */
  static logToMainSheet(userId, messageText, geminiMessage, quotedMessageId = null, messageId = null) {
    try {
      const sheet = this.getMainSheet();
      const date = Config.getNow();
      // 列順: 日時, ユーザーID, メッセージ本文, Geminiレスポンス, メッセージID, 引用メッセージID
      sheet.appendRow([date, userId, messageText, geminiMessage, messageId, quotedMessageId]);
    } catch (error) {
      Logger.log("Error in logToMainSheet: " + error.message);
      ErrorLogger.log("logToMainSheet Error", error.message);
    }
  }

  /**
   * 今日のメッセージを取得
   */
  static getTodaysMessages(userId) {
    try {
      const sheet = this.getMainSheet();
      const data = sheet.getDataRange().getValues();
      
      const today = Config.getNow();
      const todayStart = Config.getTodayStart(today);
      const todayEnd = Config.getTodayEnd(today);

      const todaysMessages = [];
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const timestamp = new Date(row[0]);
        const rowUserId = row[1];
        const messageText = row[2];

        if (rowUserId === userId && timestamp >= todayStart && timestamp <= todayEnd) {
          const timeString = Config.formatDate(timestamp, "HH:mm");
          todaysMessages.push(`${timeString} ${messageText}`);
        }
      }

      return todaysMessages;
    } catch (error) {
      Logger.log("Error in getTodaysMessages: " + error.message);
      return [];
    }
  }

  /**
   * メインシートを取得（なければ作成）
   */
  static getMainSheet() {
    const spreadsheet = SpreadsheetApp.openById(Config.getSpreadsheetId());
    let sheet = spreadsheet.getSheetByName("おもちログ");
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet("おもちログ");
      sheet.appendRow(["日時", "ユーザーID", "本文", "おもちメッセージ"]);
    }
    
    return sheet;
  }

  /**
   * 指定されたユーザーの最新メッセージを取得
   */
  static getLatestMessage(userId) {
    try {
      const sheet = this.getMainSheet();
      const data = sheet.getDataRange().getValues();
      
      // 最新から検索
      for (let i = data.length - 1; i >= 1; i--) {
        const row = data[i];
        if (row[1] === userId) {
          return {
            rowIndex: i + 1,
            timestamp: new Date(row[0]),
            messageText: row[2],
            geminiMessage: row[3]
          };
        }
      }
      
      return null;
    } catch (error) {
      Logger.log("Error in getLatestMessage: " + error.message);
      return null;
    }
  }

  /**
   * 指定時間のメッセージを検索
   */
  static findMessageByTime(userId, timeString) {
    try {
      const sheet = this.getMainSheet();
      const data = sheet.getDataRange().getValues();
      
      const today = Config.getNow();
      const todayStart = Config.getTodayStart(today);
      const todayEnd = Config.getTodayEnd(today);

      for (let i = data.length - 1; i >= 1; i--) {
        const row = data[i];
        const timestamp = new Date(row[0]);
        const rowUserId = row[1];

        if (rowUserId === userId && timestamp >= todayStart && timestamp <= todayEnd) {
          const timeFormatted = Config.formatDate(timestamp, "HH:mm");
          if (timeFormatted === timeString) {
            return {
              rowIndex: i + 1,
              timestamp: timestamp,
              messageText: row[2],
              geminiMessage: row[3]
            };
          }
        }
      }
      
      return null;
    } catch (error) {
      Logger.log("Error in findMessageByTime: " + error.message);
      return null;
    }
  }

  /**
   * メッセージを削除
   */
  static deleteMessage(rowIndex) {
    try {
      const sheet = this.getMainSheet();
      sheet.deleteRow(rowIndex);
      return true;
    } catch (error) {
      Logger.log("Error in deleteMessage: " + error.message);
      ErrorLogger.log("deleteMessage Error", error.message);
      return false;
    }
  }

  /**
   * メッセージIDでメッセージを検索
   */
  static findMessageById(messageId) {
    try {
      const sheet = this.getMainSheet();
      const data = sheet.getDataRange().getValues();
      
      // ヘッダー行をスキップして検索
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        // 5列目（E列）にmessageIdが記録されている
        if (row[4] === messageId) { // 実際のメッセージIDでの検索
          return {
            rowIndex: i + 1,
            timestamp: new Date(row[0]),
            userId: row[1],
            text: row[2],
            geminiMessage: row[3],
            messageId: row[4],
            quotedMessageId: row[5]
          };
        }
      }
      
      return null;
    } catch (error) {
      Logger.log("Error in findMessageById: " + error.message);
      return null;
    }
  }

  /**
   * メッセージIDでメッセージを検索（quotedMessageId用）
   */
  static findQuotedMessage(quotedMessageId) {
    try {
      const sheet = this.getMainSheet();
      const data = sheet.getDataRange().getValues();
      
      // ヘッダー行をスキップして検索
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        // 5列目（E列）のmessageIdと照合（quotedMessageIdで指定されたメッセージを探す）
        if (row[4] === quotedMessageId) { 
          return {
            rowIndex: i + 1,
            timestamp: new Date(row[0]),
            userId: row[1],
            text: row[2],
            geminiMessage: row[3],
            messageId: row[4],
            quotedMessageId: row[5]
          };
        }
      }
      
      return null;
    } catch (error) {
      Logger.log("Error in findQuotedMessage: " + error.message);
      return null;
    }
  }
}
