/**
 * 設定管理クラス
 * スクリプトプロパティからの設定値取得を担当
 */
class Config {
  
  /**
   * LINE Channel Access Tokenを取得
   */
  static getLineAccessToken() {
    return PropertiesService.getScriptProperties().getProperty("LINE_CHANNEL_ACCESS_TOKEN");
  }

  /**
   * BotのユーザーIDを取得
   */
  static getBotUserId() {
    return PropertiesService.getScriptProperties().getProperty("BOT_USER_ID");
  }

  /**
   * SpreadsheetのIDを取得
   */
  static getSpreadsheetId() {
    return PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  }

  /**
   * Gemini API Keyを取得
   */
  static getGeminiApiKey() {
    return PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  }

  /**
   * Notion Tokenを取得
   */
  static getNotionToken() {
    return PropertiesService.getScriptProperties().getProperty("NOTION_TOKEN");
  }

  /**
   * Notion Database IDを取得
   */
  static getNotionDatabaseId() {
    return PropertiesService.getScriptProperties().getProperty("NOTION_DATABASE_ID");
  }

  /**
   * User Mapを取得
   */
  static getUserMap() {
    const userMapString = PropertiesService.getScriptProperties().getProperty("USER_MAP");
    try {
      return userMapString ? JSON.parse(userMapString) : {};
    } catch (error) {
      Logger.log("Error parsing USER_MAP: " + error.message);
      return {};
    }
  }

  /**
   * User Mapを設定
   */
  static setUserMap(userMap) {
    try {
      PropertiesService.getScriptProperties().setProperty("USER_MAP", JSON.stringify(userMap));
    } catch (error) {
      Logger.log("Error setting USER_MAP: " + error.message);
    }
  }

  /**
   * プロジェクトのタイムゾーンを取得
   * appsscript.jsonの設定に基づく
   */
  static getTimeZone() {
    return Session.getScriptTimeZone(); // appsscript.jsonのtimeZone設定を使用
  }

  /**
   * 現在の日時を取得（プロジェクトのタイムゾーンで）
   */
  static getNow() {
    return new Date();
  }

  /**
   * 日付を指定されたフォーマットで文字列に変換
   */
  static formatDate(date, format = "yyyy/MM/dd HH:mm:ss") {
    return Utilities.formatDate(date, this.getTimeZone(), format);
  }

  /**
   * 今日の開始時刻（00:00:00）を取得
   */
  static getTodayStart(date = null) {
    const baseDate = date || this.getNow();
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0);
  }

  /**
   * 今日の終了時刻（23:59:59.999）を取得
   */
  static getTodayEnd(date = null) {
    const baseDate = date || this.getNow();
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 23, 59, 59, 999);
  }

  /**
   * 昨日の日付を取得
   */
  static getYesterday(date = null) {
    const baseDate = date || this.getNow();
    return new Date(baseDate.getTime() - 24 * 60 * 60 * 1000);
  }
}
